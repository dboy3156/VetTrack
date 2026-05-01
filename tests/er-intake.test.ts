import { describe, it, expect } from "vitest";
import { createErIntakeSchema } from "../server/lib/er-intake-schema.js";

describe("createErIntakeSchema", () => {
  it("accepts valid minimal input", () => {
    const result = createErIntakeSchema.safeParse({
      species: "dog",
      severity: "high",
      chiefComplaint: "difficulty breathing",
    });
    expect(result.success).toBe(true);
  });

  it("accepts full input", () => {
    const result = createErIntakeSchema.safeParse({
      species: "cat",
      severity: "critical",
      chiefComplaint: "hit by car",
      animalId: "animal-123",
      ownerName: "John Smith",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing species", () => {
    const result = createErIntakeSchema.safeParse({
      severity: "high",
      chiefComplaint: "vomiting",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid severity", () => {
    const result = createErIntakeSchema.safeParse({
      species: "dog",
      severity: "very-bad",
      chiefComplaint: "vomiting",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty chiefComplaint", () => {
    const result = createErIntakeSchema.safeParse({
      species: "dog",
      severity: "low",
      chiefComplaint: "",
    });
    expect(result.success).toBe(false);
  });
});
