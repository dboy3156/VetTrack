import { z } from "zod";

/** Limits to reduce abuse via oversized approve payloads */

const MAX_PATIENTS = 120;
const MAX_DRUGS_PER_PATIENT = 220;
const MAX_MANUAL_KEYS = 400;
const SHORT = 2000;
const MED = 6000;

export const drugTypeSchema = z.enum(["regular", "cri", "prn", "ld"]);

export const flagReasonSchema = z.enum([
  "DOSE_HIGH",
  "DOSE_LOW",
  "FREQ_MISSING",
  "DRUG_UNKNOWN",
  "PRN_MANUAL",
  "PATIENT_UNKNOWN",
  "LOW_CONFIDENCE",
  "LINE_AMBIGUOUS",
  "FLUID_VS_DRUG_UNCLEAR",
  "WEIGHT_UNKNOWN",
  "WEIGHT_UNCERTAIN",
  "DUPLICATE_LINE",
  "ALL_DRUGS_EXCLUDED",
]);

export const forecastDrugEntrySchema = z.object({
  drugName: z.string().max(200),
  concentration: z.string().max(SHORT),
  packDescription: z.string().max(MED),
  route: z.string().max(120),
  type: drugTypeSchema,
  quantityUnits: z.number().finite().nullable(),
  unitLabel: z.string().max(80),
  flags: z.array(flagReasonSchema).max(20),
  /** Present on new parses; older stored sessions may omit (coerced to null). */
  administrationsPer24h: z.preprocess(
    (v) => (v === undefined ? null : v),
    z.number().finite().nullable(),
  ),
  administrationsInWindow: z.preprocess(
    (v) => (v === undefined ? null : v),
    z.number().finite().nullable(),
  ),
});

export const forecastPatientEntrySchema = z.object({
  recordNumber: z.string().max(80),
  name: z.string().max(200),
  species: z.string().max(120),
  breed: z.string().max(120),
  sex: z.string().max(40),
  age: z.preprocess((v) => (v === undefined || v === null ? "" : v), z.string().max(120)),
  color: z.string().max(120),
  weightKg: z.number().finite(),
  ownerName: z.string().max(200),
  ownerId: z.string().max(120),
  ownerPhone: z.string().max(80),
  drugs: z.array(forecastDrugEntrySchema).max(MAX_DRUGS_PER_PATIENT),
  flags: z.array(flagReasonSchema).max(30),
});

export const forecastResultSchema = z.object({
  windowHours: z.union([z.literal(24), z.literal(72)]),
  weekendMode: z.boolean(),
  patients: z.array(forecastPatientEntrySchema).max(MAX_PATIENTS),
  totalFlags: z.number().int().min(0).max(50000),
  parsedAt: z.string().max(80),
  parseFailures: z
    .array(
      z.object({
        fileName: z.string().max(255),
        message: z.string().max(400),
      }),
    )
    .max(100)
    .optional(),
});

/** Accepts JSON bodies and multipart field strings from `multipart/form-data`. */
export const forecastParseRequestSchema = z.object({
  text: z.string().optional(),
  windowHours: z.preprocess((val) => {
    if (val === undefined || val === "") return undefined;
    const n = typeof val === "string" ? Number(val) : typeof val === "number" ? val : NaN;
    if (n === 24 || n === 72) return n;
    return undefined;
  }, z.union([z.literal(24), z.literal(72)]).optional()),
  weekendMode: z.preprocess((val) => {
    if (val === undefined || val === "") return undefined;
    if (typeof val === "boolean") return val;
    if (val === "true") return true;
    if (val === "false") return false;
    return undefined;
  }, z.boolean().optional()),
});

export const approvePayloadSchema = z.object({
  parseId: z.string().uuid(),
  /** Keys are `normalizeQuantityKey(record, drug)` for lines with DOSE_HIGH / DOSE_LOW. */
  pharmacistDoseAcks: z.array(z.string().max(400)).optional(),
  /** Keys `${recordNumber}|${flag}` — patient-level warnings explicitly acknowledged in the audit tab. */
  patientFlagAcks: z.array(z.string().max(400)).max(2000).optional(),
  /** `normalizeQuantityKey` for drug lines the pharmacist marked Confirmed in the audit tab. */
  confirmedDrugKeys: z.array(z.string().max(400)).max(MAX_MANUAL_KEYS).optional(),
  manualQuantities: z
    .record(z.string().max(300), z.number().finite().nonnegative())
    .superRefine((rec, ctx) => {
      const keys = Object.keys(rec);
      if (keys.length > MAX_MANUAL_KEYS) {
        ctx.addIssue({
          code: z.ZodIssueCode.too_big,
          maximum: MAX_MANUAL_KEYS,
          type: "array",
          inclusive: true,
          message: `Too many manual quantity keys (${keys.length})`,
        });
      }
      for (const k of keys) {
        if (k.length > 300) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Manual quantity key too long`,
          });
          return;
        }
      }
    }),
  auditTrace: z.record(
    z.string(),
    z.object({ forecastedQty: z.number().nullable(), onHandQty: z.number().int().min(0) }),
  ).optional(),
  patientWeightOverrides: z.record(z.string(), z.number().positive()).optional(),
});
