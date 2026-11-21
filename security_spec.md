# Security Specification: PhiloScan Role-Based Access Control (RBAC)

This security specification and testing matrix establishes the Zero-Trust security postures and data separation models for the PhiloScan platform under Google Firebase/Firestore.

## 1. System Roles and Access Matrix (RBAC)

1. **Unauthenticated Student / Guest**:
   - Can read configurations/about pages.
   - Can *create* submissions if they supply a valid, active session ID.
   - Can *get* a specific session to check if it's open/valid, but **cannot** list sessions or read other students' submissions.
   - Absolute deny on all structural modifications.

2. **Teacher (Authenticated User)**:
   - Owns `/teachers/{userId}` profile doc. Cannot self-upgrade to `role: "admin"`.
   - Has full read/write management of `/sessions/{sessionId}` where `teacherId == request.auth.uid`.
   - Has read access to any `/submissions/{submissionId}` that belongs to one of their sessions (`resource.data.teacherId == request.auth.uid`).
   - Can moderate (update/delete) student responses or classifications inside their own submissions.

3. **Super Admin (Authenticated Admin User)**:
   - Registered under `/admins/{userId}`.
   - Global read/write bypass across all collections:
     - Can view/manage all teacher profiles at `/teachers/{teacherId}`.
     - Can override or delete any `/sessions/{sessionId}`.
     - Can review or purge any student records at `/submissions/{submissionId}`.

---

## 2. Platform Data Invariants

1. **Session Ownership**: A Session cannot be created with a `teacherId` other than the current user's authenticated email/UID unless requested by a Super Admin.
2. **Strict Document IDs**: Document IDs (such as `{sessionId}` or `{submissionId}`) must adhere to strict size and alphanumeric constraints to prevent resource injection or ID poisoning attacks.
3. **Role Lock**: A teacher cannot change their own `role` property in `/teachers/{userId}` to gain administrative privileges.
4. **Authenticity of Date/Time**: All timestamp fields such as `createdAt` and `updatedAt` are strictly synchronized with `request.time`. Relying on client-provided date structures is globally prohibited.

---

## 3. The "Dirty Dozen" Malicious Payloads (Pillar 2 / Phase 0 Verification)

These payloads are designed to inspect the resilience of our security rules:

### Payload 1: Super Admin Identity Spoofing (Defeated by Phase 3 block)
*Requesting client tries to register their profile in the `/teachers` collection with a custom `role: "admin"` claim.*
```json
{
  "email": "malicious@user.com",
  "fullName": "Imposter Admin",
  "role": "admin"
}
```

### Payload 2: Teacher Session Hijacking (Defeated by Master Gate comparison)
*A Teacher (`auth.uid = "teacher_A"`) tries to update a session owned by `teacher_B` (`auth.uid = "teacher_B"`).*
```json
{
  "teacherId": "teacher_B",
  "class": "Scraped Classroom",
  "isActive": true
}
```

### Payload 3: Illegal Status Shortcutting (Defeated by Terminal State Lock)
*Attempting to unlock/reactivate a session or change attributes of a terminal completed session.*
```json
{
  "isActive": true,
  "class": "Hacked Status Overwrite"
}
```

### Payload 4: Student Data Scraping / Query Scrubbing (Defeated by Query Enforcer)
*A user tries to list all student submissions globally via `getDocs(collection(db, 'submissions'))` without restricting queries to their specific owned sessions.*
```json
// Allowed query: queries checking .where("teacherId", "==", request.auth.uid)
// Forbidden action: blanket list scans.
```

### Payload 5: ID Poisoning (Defeated by ID Validation)
*An attacker attempts to inject a 100KB junk-character string as a session code to cause storage exhaustion or indexing overhead.*
```json
{
  "db_write_path": "/sessions/REALLY_LONG_MALICIOUS_STRING_100KB_JUNK_DATA_ATTACK..."
}
```

### Payload 6: Sibling Submission Modification (Defeated by Ownership Checks)
*Teacher A tries to modify or delete a student record that was submitted to Teacher B's session.*
```json
{
  "id": "student_under_teacher_b",
  "studentName": "Falsified Name"
}
```

### Payload 7: Client Timestamp Forgery (Defeated by Temporal Integrity)
*Telling the database that a session or submission was created in the year 2020 or 2030 to confuse diagnostic timelines.*
```json
{
  "createdAt": "2020-01-01T00:00:00Z"
}
```

### Payload 8: PII Leak via Standard Reading (Defeated by Split Profile and isOwner Check)
*An unauthenticated guest tries to fetch a teacher's personal email or profile directly.*
```json
// Attempting: getDoc(doc(db, 'teachers', 'some_teacher_uid')) from a non-owner/anonymous context.
```

### Payload 9: Empty Document Creation / Field Deletion (Defeated by Perfect Size Match)
*An attacker posts an empty document or schema-less payload to corrupt calculations.*
```json
{}
```

### Payload 10: Ghost Field Injection (Defeated by Shadow Update Test / affectedKeys)
*Updating a session to inject an unauthorized payload attribute like `isVerifiedByMinistry: true` to elevate privileges.*
```json
{
  "class": "Class A",
  "isActive": true,
  "isVerifiedByMinistry": true
}
```

### Payload 11: Self-Created Super Admin Document (Defeated by Admin Write Lock)
*An authenticated user tries to directly write a document with their UID inside the `/admins` collection.*
```json
{
  "email": "hacker@domain.com",
  "fullName": "Fake Super Admin",
  "role": "admin"
}
```

### Payload 12: Anonymous Answer Hijacking/Tampering (Defeated by Create-Only Rule)
*A student or anonymous visitor tries to edit or delete their already-submitted response after viewing the initial automated analysis.*
```json
{
  "answers": {
    "q1": "Modified Answers After Cheat Check"
  }
}
```
