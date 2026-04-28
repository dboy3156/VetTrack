import { describe, it, expect } from "vitest";
import { z } from "zod";

/** Mirrors server/routes/integrations.ts mappingReviewPatchSchema — keep in sync. */
const mappingReviewPatchSchema = z.object({
  reviewStatus: z.enum(["approved", "rejected"]),
});

describe("integration mapping review API contract", () => {
  it("accepts approved and rejected", () => {
    expect(mappingReviewPatchSchema.safeParse({ reviewStatus: "approved" }).success).toBe(true);
    expect(mappingReviewPatchSchema.safeParse({ reviewStatus: "rejected" }).success).toBe(true);
  });

  it("rejects pending and arbitrary strings", () => {
    expect(mappingReviewPatchSchema.safeParse({ reviewStatus: "pending" }).success).toBe(false);
    expect(mappingReviewPatchSchema.safeParse({ reviewStatus: "maybe" }).success).toBe(false);
  });
});
