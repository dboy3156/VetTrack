import { MED_JUSTIFICATION_PRESETS, type MedJustificationPreset } from "../../shared/medication-justification-presets.js";

export type { MedJustificationPreset };
export { MED_JUSTIFICATION_PRESETS };

export const MED_JUSTIFICATION_PRESET_MAP = new Map(
  MED_JUSTIFICATION_PRESETS.map((preset) => [preset.code, preset.label]),
);
