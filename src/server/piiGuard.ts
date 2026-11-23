/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const ALLOWED_FREE_GEMINI_MODELS = [
  'gemini-4-hydrogen',
  'gemini-3.1-flash-lite',
] as const;

export type AllowedFreeGeminiModel = (typeof ALLOWED_FREE_GEMINI_MODELS)[number];

export const PRIMARY_FREE_GEMINI_MODEL: AllowedFreeGeminiModel = 'gemini-4-hydrogen';
export const FALLBACK_FREE_GEMINI_MODEL: AllowedFreeGeminiModel = 'gemini-3.1-flash-lite';

export function assertAllowedGeminiModel(model: string): AllowedFreeGeminiModel {
  if ((ALLOWED_FREE_GEMINI_MODELS as readonly string[]).includes(model)) {
    return model as AllowedFreeGeminiModel;
  }
  throw new Error(
    `Forbidden Gemini model "${model}". Only free-tier models (${ALLOWED_FREE_GEMINI_MODELS.join(', ')}) are permitted.`
  );
}

const EMAIL_PATTERN = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const PHONE_PATTERN = /(?:\+?\d{1,3}[\s.-]?)?(?:0[567]\d{8}|\d{2,3}[\s.-]\d{2,3}[\s.-]\d{2,4}|\+\d{8,15})/g;
const LABELED_PII_PATTERN = /(?:الاسم(?:\s+الكامل)?|التلميذ(?:ة)?|المؤسسة|الثانوية|الأكاديمية|المديرية|البريد(?:\s+الإلكتروني)?|الهاتف)\s*[:：]\s*[^\n،؛]+/gi;

const PII_FIELD_KEYS = new Set([
  'studentname',
  'student_name',
  'fullname',
  'full_name',
  'email',
  'studentemail',
  'teacheremail',
  'teacher_email',
  'phone',
  'phonenumber',
  'e164phone',
  'institution',
  'school',
  'province',
  'regionalacademy',
  'studentauthuid',
  'uid',
  'teacherid',
  'teacher_id',
]);

export interface PiiRedactionHints {
  studentName?: string;
  institution?: string;
  province?: string;
  email?: string;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function redactStudentPiiFromText(text: string, hints?: PiiRedactionHints): string {
  if (!text || typeof text !== 'string') return '';
  let clean = text
    .replace(EMAIL_PATTERN, '[بريد_محجوب]')
    .replace(PHONE_PATTERN, '[هاتف_محجوب]')
    .replace(LABELED_PII_PATTERN, '[معطى_شخصي_محجوب]');

  const hintValues = [hints?.studentName, hints?.institution, hints?.province, hints?.email]
    .map((v) => String(v || '').trim())
    .filter((v) => v.length >= 3);

  for (const val of hintValues) {
    const re = new RegExp(escapeRegExp(val), 'gi');
    clean = clean.replace(re, '[محجوب_للخصوصية]');
  }
  return clean;
}

export function redactStudentAnswersForAI(
  answers: unknown,
  hints?: PiiRedactionHints
): Record<string, unknown> {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    return {};
  }

  const scrub = (val: unknown): unknown => {
    if (typeof val === 'string') {
      return redactStudentPiiFromText(val, hints);
    }
    if (Array.isArray(val)) {
      return val.map((item) => scrub(item));
    }
    if (val && typeof val === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        if (PII_FIELD_KEYS.has(k.toLowerCase())) {
          continue;
        }
        out[k] = scrub(v);
      }
      return out;
    }
    return val;
  };

  return scrub(answers) as Record<string, unknown>;
}
