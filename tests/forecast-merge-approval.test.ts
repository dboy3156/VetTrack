import assert from "node:assert/strict";
import { validateMergedForecastForApproval } from "../lib/forecast/approve-gate.ts";
import { applyManualQuantities, normalizeQuantityKey } from "../server/lib/forecast/mergeApproval.ts";
import type { ForecastResult } from "../server/lib/forecast/types.ts";
import { approvePayloadSchema, forecastParseRequestSchema } from "../server/lib/forecast/forecastZod.ts";

async function run(): Promise<void> {
  console.log("\n-- Forecast merge + approve validation");

  assert.equal(normalizeQuantityKey("00123", " Morphine "), "00123__morphine");

  const base: ForecastResult = {
    windowHours: 24,
    weekendMode: false,
    parsedAt: new Date().toISOString(),
    totalFlags: 1,
    patients: [
      {
        recordNumber: "1001",
        name: "Buddy",
        species: "Dog",
        breed: "",
        sex: "",
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
      },
    ],
  };

  const key = normalizeQuantityKey("1001", "Morphine");
  const merged = applyManualQuantities(base, { [key]: 4 });
  assert.equal(merged.patients[0]!.drugs[0]!.quantityUnits, 4);
  assert.equal(merged.patients[0]!.drugs[0]!.flags.length, 0);

  const parsed = approvePayloadSchema.safeParse({
    parseId: "550e8400-e29b-41d4-a716-446655440000",
    manualQuantities: { [key]: 4 },
  });
  assert.equal(parsed.success, true);

  const gate = validateMergedForecastForApproval(merged);
  assert.equal(gate.ok, true);

  const blocked = validateMergedForecastForApproval(base);
  assert.equal(blocked.ok, false);

  const patientUnknown: ForecastResult = {
    ...base,
    patients: [
      {
        ...base.patients[0]!,
        flags: ["PATIENT_UNKNOWN"],
        drugs: base.patients[0]!.drugs.map((d) => ({
          ...d,
          flags: [],
        })),
      },
    ],
  };
  const pu = validateMergedForecastForApproval(patientUnknown);
  assert.equal(pu.ok, false);

  const prnZero: ForecastResult = {
    ...base,
    patients: [
      {
        ...base.patients[0]!,
        drugs: [{ ...base.patients[0]!.drugs[0]!, quantityUnits: 0, flags: [] }],
      },
    ],
  };
  const z = validateMergedForecastForApproval(prnZero);
  assert.equal(z.ok, false);

  const multipartLike = forecastParseRequestSchema.safeParse({
    windowHours: "72",
    weekendMode: "true",
  });
  assert.equal(multipartLike.success, true);
  assert.equal(multipartLike.success ? multipartLike.data.windowHours : null, 72);
  assert.equal(multipartLike.success ? multipartLike.data.weekendMode : null, true);

  const jsonLike = forecastParseRequestSchema.safeParse({
    windowHours: 24,
    weekendMode: false,
    text: "hello",
  });
  assert.equal(jsonLike.success, true);

  console.log("  ✅ Forecast merge / zod approve schema / approve guard / parse body coercion");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
