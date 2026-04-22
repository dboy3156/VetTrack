import { describe, it, expect } from "vitest";
import { validateMergedForecastForApproval } from "../src/lib/forecast/approveGate.ts";
import { applyManualQuantities, normalizeQuantityKey } from "../server/lib/forecast/mergeApproval.ts";
import type { ForecastResult } from "../server/lib/forecast/types.ts";
import { approvePayloadSchema, forecastParseRequestSchema } from "../server/lib/forecast/forecastZod.ts";

function basePatient(overrides?: Partial<ForecastResult["patients"][0]>): ForecastResult["patients"][0] {
  return {
    recordNumber: "1001",
    name: "Buddy",
    species: "Dog",
    breed: "",
    sex: "",
    age: "",
    color: "",
    weightKg: 10,
    ownerName: "Ada",
    ownerId: "",
    ownerPhone: "",
    flags: [],
    drugs: [
      {
        drugName: "Morphine",
        concentration: "10 mg/mL",
        packDescription: "",
        route: "IV",
        type: "prn",
        quantityUnits: null,
        unitLabel: "יח׳",
        flags: ["PRN_MANUAL"],
        administrationsPer24h: null,
        administrationsInWindow: null,
      },
    ],
    ...overrides,
  };
}

describe("Forecast merge + approve validation", () => {
  it("normalizes quantity key correctly", () => {
    expect(normalizeQuantityKey("00123", " Morphine ")).toBe("00123__morphine");
  });

  it("applyManualQuantities fills quantityUnits and clears PRN_MANUAL flag", () => {
    const base: ForecastResult = {
      windowHours: 24,
      weekendMode: false,
      parsedAt: new Date().toISOString(),
      totalFlags: 1,
      patients: [basePatient()],
    };
    const key = normalizeQuantityKey("1001", "Morphine");
    const merged = applyManualQuantities(base, { [key]: 4 });
    expect(merged.patients[0]!.drugs[0]!.quantityUnits).toBe(4);
    expect(merged.patients[0]!.drugs[0]!.flags.length).toBe(0);
  });

  it("approvePayloadSchema parses valid payload", () => {
    const key = normalizeQuantityKey("1001", "Morphine");
    const parsed = approvePayloadSchema.safeParse({
      parseId: "550e8400-e29b-41d4-a716-446655440000",
      manualQuantities: { [key]: 4 },
    });
    expect(parsed.success).toBe(true);
  });

  it("gate passes when all PRN quantities are filled", () => {
    const base: ForecastResult = {
      windowHours: 24,
      weekendMode: false,
      parsedAt: new Date().toISOString(),
      totalFlags: 1,
      patients: [basePatient()],
    };
    const key = normalizeQuantityKey("1001", "Morphine");
    const merged = applyManualQuantities(base, { [key]: 4 });
    const gate = validateMergedForecastForApproval(merged);
    expect(gate.ok).toBe(true);
  });

  it("gate blocks when PRN quantities are not filled", () => {
    const base: ForecastResult = {
      windowHours: 24,
      weekendMode: false,
      parsedAt: new Date().toISOString(),
      totalFlags: 1,
      patients: [basePatient()],
    };
    const blocked = validateMergedForecastForApproval(base);
    expect(blocked.ok).toBe(false);
  });

  it("gate passes when patient is PATIENT_UNKNOWN but quantities are filled", () => {
    const base: ForecastResult = {
      windowHours: 24,
      weekendMode: false,
      parsedAt: new Date().toISOString(),
      totalFlags: 1,
      patients: [basePatient()],
    };
    const patientUnknown: ForecastResult = {
      ...base,
      patients: [
        basePatient({
          flags: ["PATIENT_UNKNOWN"],
          drugs: [
            {
              ...base.patients[0]!.drugs[0]!,
              quantityUnits: 4,
              flags: [],
            },
          ],
        }),
      ],
    };
    const pu = validateMergedForecastForApproval(patientUnknown);
    expect(pu.ok).toBe(true);
  });

  it("gate blocks when PRN quantity is zero", () => {
    const base: ForecastResult = {
      windowHours: 24,
      weekendMode: false,
      parsedAt: new Date().toISOString(),
      totalFlags: 1,
      patients: [basePatient()],
    };
    const prnZero: ForecastResult = {
      ...base,
      patients: [
        basePatient({
          drugs: [{ ...base.patients[0]!.drugs[0]!, quantityUnits: 0, flags: [] }],
        }),
      ],
    };
    const z = validateMergedForecastForApproval(prnZero);
    expect(z.ok).toBe(false);
  });

  it("fractional manual quantity rounds down to 0 and keeps PRN_MANUAL flag; gate blocks", () => {
    const base: ForecastResult = {
      windowHours: 24,
      weekendMode: false,
      parsedAt: new Date().toISOString(),
      totalFlags: 1,
      patients: [basePatient()],
    };
    const key = normalizeQuantityKey("1001", "Morphine");
    const prnFrac = applyManualQuantities(base, { [key]: 0.9 });
    expect(prnFrac.patients[0]!.drugs[0]!.quantityUnits).toBe(0);
    expect(prnFrac.patients[0]!.drugs[0]!.flags.includes("PRN_MANUAL")).toBeTruthy();
    const fracGate = validateMergedForecastForApproval(prnFrac);
    expect(fracGate.ok).toBe(false);
  });

  it("gate blocks on DOSE_HIGH flag without ack, passes with pharmacist ack", () => {
    const base: ForecastResult = {
      windowHours: 24,
      weekendMode: false,
      parsedAt: new Date().toISOString(),
      totalFlags: 1,
      patients: [basePatient()],
    };
    const doseHigh: ForecastResult = {
      ...base,
      patients: [
        basePatient({
          drugs: [
            {
              ...base.patients[0]!.drugs[0]!,
              type: "regular",
              quantityUnits: 2,
              flags: ["DOSE_HIGH"],
            },
          ],
        }),
      ],
    };
    const dhBlocked = validateMergedForecastForApproval(doseHigh);
    expect(dhBlocked.ok).toBe(false);

    const dhLine = normalizeQuantityKey("1001", "Morphine");
    const dhOk = validateMergedForecastForApproval(doseHigh, {
      pharmacistDoseAckKeys: new Set([dhLine]),
    });
    expect(dhOk.ok).toBe(true);
  });

  it("forecastParseRequestSchema coerces multipart string fields", () => {
    const multipartLike = forecastParseRequestSchema.safeParse({
      windowHours: "72",
      weekendMode: "true",
    });
    expect(multipartLike.success).toBe(true);
    expect(multipartLike.success ? multipartLike.data.windowHours : null).toBe(72);
    expect(multipartLike.success ? multipartLike.data.weekendMode : null).toBe(true);
  });

  it("forecastParseRequestSchema parses JSON-like payload", () => {
    const jsonLike = forecastParseRequestSchema.safeParse({
      windowHours: 24,
      weekendMode: false,
      text: "hello",
    });
    expect(jsonLike.success).toBe(true);
  });
});
