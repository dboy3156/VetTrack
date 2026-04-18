import { minimumJustificationLength, type JustificationTier } from "../../shared/medication-justification.js";
import { MED_JUSTIFICATION_PRESET_MAP } from "../config/medJustificationPresets.js";

export class MedJustificationError extends Error {
  constructor(
    public readonly code: "JUSTIFICATION_TOO_SHORT" | "JUSTIFICATION_SPAM" | "JUSTIFICATION_INVALID_PRESET",
    message: string,
  ) {
    super(message);
    this.name = "MedJustificationError";
  }
}

const LETTER_REGEX = /\p{L}/u;
const WORD_LIKE_REGEX = /\p{L}{2,}/u;
const REPEATED_CHAR_RUN_REGEX = /(.)\1{4,}/u;

function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function letterRatio(text: string): number {
  const chars = Array.from(text);
  if (chars.length === 0) return 0;
  const letters = chars.filter((char) => LETTER_REGEX.test(char)).length;
  return letters / chars.length;
}

export function validateJustificationText(input: string, tier: JustificationTier): string {
  const text = normalizeText(input);
  const minLen = minimumJustificationLength(tier);

  if (text.length < minLen) {
    throw new MedJustificationError("JUSTIFICATION_TOO_SHORT", `Justification must be at least ${minLen} characters`);
  }

  if (text.length === 0) {
    return text;
  }

  if (REPEATED_CHAR_RUN_REGEX.test(text)) {
    throw new MedJustificationError("JUSTIFICATION_SPAM", "Justification appears repetitive");
  }

  const maxCharCount = Math.max(...Array.from(text).map((char) => text.split(char).length - 1));
  if (maxCharCount / text.length > 0.4) {
    throw new MedJustificationError("JUSTIFICATION_SPAM", "Justification appears repetitive");
  }

  if (letterRatio(text) < 0.5 || !WORD_LIKE_REGEX.test(text)) {
    throw new MedJustificationError("JUSTIFICATION_SPAM", "Justification must include meaningful words");
  }

  return text;
}

export function resolvePresetLabel(code: string): string {
  const label = MED_JUSTIFICATION_PRESET_MAP.get(code);
  if (!label) {
    throw new MedJustificationError("JUSTIFICATION_INVALID_PRESET", "Unknown medication justification preset");
  }
  return label;
}
