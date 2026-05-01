import { z } from "zod";

export const createErIntakeSchema = z.object({
  species: z.string().trim().min(1).max(200),
  severity: z.enum(["low", "medium", "high", "critical"]),
  chiefComplaint: z.string().trim().min(1).max(2000),
  animalId: z.string().trim().min(1).optional(),
  ownerName: z.string().trim().max(200).optional(),
});
