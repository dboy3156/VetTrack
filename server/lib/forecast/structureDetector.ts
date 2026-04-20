import type { RawPatientBlock } from "./types.js";

/** First numeric token in a string — common for SmartFlow record # in header or row. */
export function extractRecordNumberHint(text: string): string | null {
  const m = text.match(/\b(\d{4,10})\b/);
  return m?.[1] ?? null;
}

/**
 * Split ward report text into patient blocks.
 * Primary: paragraphs separated by blank lines (header + drug lines).
 * Fallback: each non-empty line is its own block (header = line, no drug lines) for single-column pastes.
 */
export function detectStructure(raw: string): RawPatientBlock[] {
  const normalized = raw.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const paragraphs = normalized
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const blocks: RawPatientBlock[] = [];

  for (const p of paragraphs) {
    const lines = p.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    blocks.push({
      headerLine: lines[0]!,
      drugLines: lines.slice(1),
    });
  }

  if (blocks.length > 0) return blocks;

  const lines = normalized.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    blocks.push({ headerLine: line, drugLines: [] });
  }
  return blocks;
}
