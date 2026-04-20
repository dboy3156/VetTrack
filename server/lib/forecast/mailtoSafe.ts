/** ~8k chars is a conservative ceiling for mailto URLs across browsers / mail clients. */
const MAILTO_SAFE_MAX_CHARS = 7800;

const TRUNC_NOTE_EN = "\n\n[Truncated — full order is archived in VetTrack.]";
const TRUNC_NOTE_HE = '\n\n[קוצץ — ההזמנה המלאה נשמרת ב-VetTrack.]';

/**
 * Build a mailto URL under a safe length by truncating the body when needed.
 * Prefer SMTP for large payloads in production when possible.
 */
export function buildForecastMailtoUrl(params: {
  pharmacyEmail: string;
  subject: string;
  body: string;
  locale?: string;
}): { url: string; truncated: boolean } {
  const note = params.locale?.toLowerCase().startsWith("he") ? TRUNC_NOTE_HE : TRUNC_NOTE_EN;
  let body = params.body;
  let truncated = false;

  const assemble = (): string =>
    `mailto:${params.pharmacyEmail}?${new URLSearchParams({ subject: params.subject, body }).toString()}`;

  let url = assemble();
  while (url.length > MAILTO_SAFE_MAX_CHARS && body.length > 120) {
    truncated = true;
    body = body.slice(0, Math.floor(body.length * 0.82)) + note;
    url = assemble();
  }

  if (url.length > MAILTO_SAFE_MAX_CHARS) {
    truncated = true;
    body =
      params.body.slice(0, Math.max(80, Math.floor(MAILTO_SAFE_MAX_CHARS / 8))) +
      note;
    url = assemble();
  }

  return { url, truncated };
}
