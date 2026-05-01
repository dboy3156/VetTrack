import { z } from "zod";

const erSeverityEnum = z.enum(["low", "medium", "high", "critical"]);

/** POST /api/er/intake body — shared by route + tests (plan Task 3). */
export const createErIntakeSchema = z.object({
  species: z.string().trim().min(1).max(100),
  severity: erSeverityEnum,
  chiefComplaint: z.string().trim().min(1).max(500),
  animalId: z.string().trim().min(1).optional(),
  ownerName: z.string().trim().max(200).optional(),
});
