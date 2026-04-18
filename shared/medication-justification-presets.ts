export interface MedJustificationPreset {
  code: string;
  label: string;
}

export const MED_JUSTIFICATION_PRESETS: MedJustificationPreset[] = [
  { code: "NON_RESPONSIVE_STANDARD_DOSE", label: "Non-responsive to standard dose" },
  { code: "EMERGENCY_CODE_BLUE", label: "Emergency / Code Blue" },
  { code: "SEVERE_PAIN_BREAKTHROUGH", label: "Severe pain breakthrough requiring escalation" },
  { code: "ANESTHETIC_COMPLICATION_RISK", label: "Anesthetic complication risk adjustment" },
  { code: "RENAL_HEPATIC_CONSIDERATION", label: "Renal/hepatic consideration" },
  { code: "WEIGHT_REASSESSMENT", label: "Weight reassessment after admission" },
];
