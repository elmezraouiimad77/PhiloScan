# Security Specification: PhiloScan Zero-Trust RBAC & Option (A) Architecture

This specification defines the Zero-Trust access control, cryptographic integrity, privacy isolation, and Firestore Enterprise governance posture for **PhiloScan** under **Option (A) — Without Service Account**.

---

## 1. Architectural Posture (Option A: No Service Account)

- **Hosting**: Render Free Web Service (stateless Express + built React SPA) + Firebase Spark / Firestore Enterprise (`ai-studio-d15e3b81-015e-4e2a-bd5c-ec61f18d0bde`).
- **No Service Account (`firebase-admin`)**: Render NEVER impersonates a privileged server writer and NEVER writes `trustedAnalysis` or `analysisStatus` to Firestore.
- **Cryptographic Attestation via HTTPS**:
  - Render signs automated analyses with HMAC-SHA256 over a strict 7-field canonical payload:
    `schemaVersion | submissionId | sessionId | studentAuthUid | answersHash | analysisHash | signedAt`
    plus a unique anti-replay `jti` nonce.
  - `answersHash = SHA-256(canonicalJson(answers))`
  - `analysisHash = SHA-256(canonicalJson(analysis))`
  - HMAC proves cryptographic origin and non-tampering (`signatureIntegrity: 'valid'`), **NOT** semantic pedagogical truth (`teacherNotes` / `overriddenClassification` remain the teacher's authoritative judgment).
  - Re-analysis via Render (`/api/submissions/:id/analyze-gemini` or `/api/submissions/:id/verify-analysis`) returns the newly signed or verified envelope **in the HTTPS response only**.

---

## 2. System Roles & Access Control Matrix (RBAC)

1. **Guest / Anonymous Student (`studentAuth` with `firebase.sign_in_provider == 'anonymous'`)**:
   - Can `get` `config/landingPage`, `stats/public`, and `publicSessions/{sessionId}` (single document lookup only; `list` denied).
   - `publicSessions/{sessionId}` NEVER exposes `teacherId`, `teacherEmail`, or `customWeights`; it exposes only minimal session display fields + opaque `ownerRef` (`^own_[a-f0-9]{32}$`).
   - Can create ONE deterministic submission `submissions/{sessionId}_{studentAuthUid}` while `publicSessions/{sessionId}.isActive == true`, matching `ownerRef`, `studentAuthUid == request.auth.uid`, bounded sizes, and `submittedAt == request.time`. Cannot `update`, `delete`, or `list` submissions.
   - Can write own `sessions/{sessionId}/presence/{studentAuthUid}` heartbeat while session is active.
   - Can append create-only `sessions/{sessionId}/violationEvents/{uid}_{seq}` (`seq` integer `1..50`, bounded `< 1 KiB`, `advisoryOnly: true`). Proctoring signals are strictly **advisory** and never auto-fail students.

2. **Teacher (`email_verified == true`, non-anonymous, `teachers/{uid}.isDisabled == false`)**:
   - Self-registration allowed once (`!exists(teachers/{uid})`, `role == 'teacher'`, `isDisabled == false`, `uid == request.auth.uid`, `email == request.auth.token.email`).
   - Cannot escalate `role`, toggle `isDisabled`, or change `uid`/`email`/`createdAt`.
   - `isTeacherActive(uid)` fails closed (`exists(...) && get(...).data.isDisabled == false`). Disabled teachers lose read/write access across `sessions`, `publicSessions`, `ownerLinks`, `submissions`, `forms`, `reports`, and notifications.
   - Owns `sessions/{sessionId}`, `publicSessions/{sessionId}` (verified via `getAfter`), `ownerLinks/{ownerRef}` (verified atomically via `getAfter`), `forms/{formId}`, and `users/{uid}/notifications*`.

3. **Super Admin (`isAdmin()`)**:
   - Requires `isSignedIn() && request.auth.token.email_verified == true` AND (`request.auth.token.email == 'phillofikr@gmail.com'` OR active `admins/{uid}.isDisabled == false`) AND `teachers/{uid}` (if present) has `isDisabled == false`.
   - `/admins/{adminId}` enforces `allow write: if false; allow get: if request.auth.uid == adminId; allow list: if false;` (no client-side self-creation or privilege minting).

---

## 3. Platform Data Invariants & Enterprise Constraints

1. **Firestore Enterprise Quotas**:
   - `1 GiB` storage, `50,000` Read Units/day, `40,000` Write Units/day (1 KiB unit including index updates), `50,000` Realtime Update Units/day, `10 GiB/mo` network egress.
   - Large nested blobs (`answers`, `analysis`, `questions`, `violationEvents.details`) carry explicit field-level indexing exemptions in `firestore.indexes.json`.
   - Event-first monitoring + throttled heartbeats prevent exhausting daily Write/Update units.
2. **Strict `reports` & `imageUrl` Rules**:
   - Only authenticated active teachers or admins may create `reports/{reportId}` (`reporterUid == request.auth.uid`). If `sessionId` is provided, caller must own that session or be admin.
   - `imageUrl` is restricted exclusively to `https://...` (`<= 500` chars) or `data:image/(png|jpeg|webp);base64,...` (`<= 250,000` chars). `http:`, `javascript:`, `data:image/svg+xml`, and `data:text/html` are rejected in both rules and server validation.
3. **Free Gemini Models + PII Redaction**:
   - Server allows strictly `gemini-4-hydrogen` (primary) and `gemini-3.1-flash-lite` (fallback).
   - Every Gemini prompt passes through `redactStudentPii()` stripping names, emails, phone numbers, and school/province strings before leaving the server.
4. **Offline Firebase ID Token & App Check Verification**:
   - `firebaseTokenVerifier.ts` validates Google RS256 ID tokens against `https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com` (checking `aud`, `iss`, `exp`, `iat`, `auth_time`, `sub`, `kid` with Cache-Control + single unknown-`kid` refresh).
   - App Check validates `X-Firebase-AppCheck` against `https://firebaseappcheck.googleapis.com/v1/jwks` (`ALLOWED_APP_IDS`). Malformed tokens are ALWAYS rejected; dev bypass applies ONLY when `NODE_ENV !== 'production'`, `ALLOW_MISSING_APP_CHECK_IN_DEV === 'true'`, and the header is completely absent.

---

## 4. Expanded "Dirty Dozen+" Adversarial Test Matrix

1. **Super Admin Role Spoofing**: Client writes `role: "admin"` during `/teachers/{uid}` registration → **DENIED**.
2. **Teacher Session Hijacking**: Teacher A writes `teacherId: "teacher_B"` or updates Teacher B's `/sessions/{id}` → **DENIED**.
3. **Disabled Teacher / Disabled Admin Bypass**: User with `teachers/{uid}.isDisabled == true` or `admins/{uid}.isDisabled == true` attempts admin/teacher read or write → **DENIED** (fails closed).
4. **Cross-Tenant Submission Scraping**: Anonymous student or Teacher A runs `list` on `/submissions` or reads Teacher B's session → **DENIED**.
5. **ID Poisoning & Oversized Violation Spam**: Attacker posts 100KB doc ID or `violationEvents` with `seq: 51` or arbitrary `eventId` → **DENIED**.
6. **Student Submission Overwrite / Forged UID**: Student submits `submissionId` not equal to `${sessionId}_${uid}`, or tries to `update` / `delete` submission → **DENIED**.
7. **Client Timestamp Forgery**: Client passes past/future `createdAt`, `updatedAt`, `submittedAt`, or `occurredAt` != `request.time` → **DENIED**.
8. **PII Leak via `sessions` / `publicSessions`**: Anonymous guest attempts `getDoc(doc(db, 'sessions', id))` to read `teacherEmail`/`teacherId` → **DENIED**.
9. **Malicious `imageUrl` XSS Injection**: Client submits `imageUrl: "javascript:alert(1)"`, `"data:image/svg+xml;base64,..."`, or `>250KB` image in `/reports` → **DENIED**.
10. **Ghost Field / Option A Field Injection**: Client sets `trustedAnalysis`, `analysisStatus`, or `isVerifiedByMinistry` in `/submissions` → **DENIED**.
11. **Self-Created `/admins` Document**: Authenticated user attempts `setDoc(doc(db, 'admins', uid), ...)` → **DENIED** (`allow write: if false`).
12. **Replay Attack on Signed Analysis**: Attacker replays a captured `SignedAnalysisEnvelope` with same `jti` or tampered `answers` / `analysis` / `submissionId` → **REJECTED** (`401`/`400`, `signatureIntegrity: 'invalid'` or `'replayed'`).
13. **PII Leak & Paid Model Guard on Server**: Request tries to override Gemini model to a paid SKU or send unredacted student name/email into AI prompt → **BLOCKED & REDACTED**.
