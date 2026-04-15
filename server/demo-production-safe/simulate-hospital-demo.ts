/**
 * VetTrack — 3-Day Hospital Demo Seed
 * Run with: tsx server/demo-production-safe/simulate-hospital-demo.ts
 *
 * Inserts ONLY missing demo users, creates demo equipment with deterministic
 * IDs, and generates a believable 3-day activity timeline via existing
 * scanLogs + equipment-state patterns.
 *
 * Safe: no schema changes, no deletes, no refactors.
 * Idempotent: re-run without duplicating data.
 * Reversible: rollback-hospital-demo.ts removes all demo data.
 */
import "dotenv/config";
import { db, pool, users, equipment, scanLogs, shifts } from "../db.js";
import { like, sql, count } from "drizzle-orm";
import { subHours, subMinutes, subDays, format } from "date-fns";

// ═══════════════════════════════════════════════════════════════════════════════
// Marker prefixes — used for idempotent seed + bounded rollback
// ═══════════════════════════════════════════════════════════════════════════════
const DEMO_USER_PFX = "demo-user-";
const DEMO_CLERK_PFX = "demo-clerk-";
const DEMO_EQ_PFX = "demo-eq-";
const DEMO_LOG_PFX = "demo-log-";
const DEMO_SHIFT_PFX = "demo-shift-";

// ═══════════════════════════════════════════════════════════════════════════════
// Time helpers (anchored to script execution time)
// ═══════════════════════════════════════════════════════════════════════════════
const NOW = new Date();
const hAgo = (h: number) => subHours(NOW, h);
const mAgo = (m: number) => subMinutes(NOW, m);

// ═══════════════════════════════════════════════════════════════════════════════
// Deterministic ID builders
// ═══════════════════════════════════════════════════════════════════════════════
const pad = (n: number) => String(n).padStart(3, "0");
const uId = (i: number) => `${DEMO_USER_PFX}${pad(i)}`;
const uClerk = (i: number) => `${DEMO_CLERK_PFX}${pad(i)}`;
const uEmail = (i: number) => `demo${i}@vettrack.dev`;
const eId = (i: number) => `${DEMO_EQ_PFX}${pad(i)}`;
const lId = (eq: number, ev: number) => `${DEMO_LOG_PFX}${eq}-${ev}`;
const sId = (u: number, d: number) => `${DEMO_SHIFT_PFX}${u}-${d}`;

// ═══════════════════════════════════════════════════════════════════════════════
// Issue notes (exact Hebrew values)
// ═══════════════════════════════════════════════════════════════════════════════
const ISSUE = {
  NO_BATTERY: "אין סוללה",
  BAD_SCREEN: "מסך לא תקין",
  BAD_SENSOR: "סנסור לא תקין",
  BROKEN: "שבור",
  BAD_LEADS: "לידים לא תקינים",
};

// ═══════════════════════════════════════════════════════════════════════════════
// User Roster (43 users)
// ═══════════════════════════════════════════════════════════════════════════════
interface RosterEntry {
  name: string;
  role: "admin" | "technician" | "viewer";
  isSenior?: boolean;
}

const ROSTER: RosterEntry[] = [
  // Admins (0-1)
  { name: "דן ארז Demo", role: "admin" },
  { name: "אסיל פרהוד Demo", role: "admin" },
  // Senior Technicians (2-10) — user.role=technician, shift.role=senior_technician
  { name: "שני גליקסברג Demo", role: "technician", isSenior: true },
  { name: "אנסטסיה פצ'ניקוב Demo", role: "technician", isSenior: true },
  { name: "שי דגני Demo", role: "technician", isSenior: true },
  { name: "כרמל פלג Demo", role: "technician", isSenior: true },
  { name: "סלימאן ברקאת Demo", role: "technician", isSenior: true },
  { name: "שחר שגב Demo", role: "technician", isSenior: true },
  { name: "סוזאן כלש Demo", role: "technician", isSenior: true },
  { name: "אופרי אלקלאי Demo", role: "technician", isSenior: true },
  { name: "אוקסנה נורוב Demo", role: "technician", isSenior: true },
  // Technicians (11-37)
  { name: "קאי אניטה גאו Demo", role: "technician" },
  { name: "יעל יאיר Demo", role: "technician" },
  { name: "לב סיזוב Demo", role: "technician" },
  { name: "קארין קריביצקי Demo", role: "technician" },
  { name: "שני גבאי Demo", role: "technician" },
  { name: "שרית כספי Demo", role: "technician" },
  { name: "דולב בקשי Demo", role: "technician" },
  { name: "עדן סנקר Demo", role: "technician" },
  { name: "טל כהן Demo", role: "technician" },
  { name: "בוריס צ'יצ'ינוב Demo", role: "technician" },
  { name: "נינה לנזוי Demo", role: "technician" },
  { name: "מתילדה ניקולה Demo", role: "technician" },
  { name: "ליאור אליהו Demo", role: "technician" },
  { name: "נסר מוסא Demo", role: "technician" },
  { name: "שיראז אלמוגרבי Demo", role: "technician" },
  { name: "רחאב יוסף Demo", role: "technician" },
  { name: "רובא נפאע Demo", role: "technician" },
  { name: "מרינה וידזון Demo", role: "technician" },
  { name: "יובל אביאני Demo", role: "technician" },
  { name: "רותם בר לב Demo", role: "technician" },
  { name: "ליהי חלפין Demo", role: "technician" },
  { name: "מאיי צ׳לצ׳וק Demo", role: "technician" },
  { name: "ריטה דראוי Demo", role: "technician" },
  { name: "לינוי ברהום Demo", role: "technician" },
  { name: "מעיין ניסנדון Demo", role: "technician" },
  { name: "גיא רובין Demo", role: "technician" },
  { name: "אופל גרושקובסקי Demo", role: "technician" },
  // Viewers (38-42)
  { name: "דניאלה בן־אושר Demo", role: "viewer" },
  { name: "אילנה פליפצ'נקו Demo", role: "viewer" },
  { name: "שלי בן דוד Demo", role: "viewer" },
  { name: "נתלי ואקנין Demo", role: "viewer" },
  { name: "לילך לוי Demo", role: "viewer" },
];

// ═══════════════════════════════════════════════════════════════════════════════
// Equipment definitions (51 items)
//
// Each item defines its FINAL state + the scan-log events that led to it.
// Events use the exact same note/status patterns as the checkout/return/scan
// handlers in server/routes/equipment.ts.
//
// State categories:
//   available  ~30% = 15  (status=ok, not checked out)
//   in_use     ~39% = 20  (checked out, within expected return)
//   overdue    ~16% = 8   (checked out, past expectedReturnMinutes)
//   issue      ~16% = 8   (status=issue, 2 also checked out)
// ═══════════════════════════════════════════════════════════════════════════════
interface Checkout { u: number; at: Date; loc: string }
interface Evt { s: string; n: string; t: Date; u: number }
interface EqDef {
  name: string;
  loc: string;
  erm: number | null;
  status: "ok" | "issue";
  ls: Date;
  co: Checkout | null;
  issue: string | null;
  ev: Evt[];
}

const ITEMS: EqDef[] = [
  // ── מוניטור נייד #1-#5 (ICU, erm=720) ──────────────────────────────────────
  // #1 in_use — checked out 1h ago to חדר בדיקה 1
  { name: "מוניטור נייד #1", loc: "ICU", erm: 720, status: "ok", ls: hAgo(1),
    co: { u: 11, at: hAgo(1), loc: "חדר בדיקה 1" }, issue: null,
    ev: [{ s: "ok", n: "Checked out — חדר בדיקה 1", t: hAgo(1), u: 11 }] },
  // #2 OVERDUE 3 days — DEMO MOMENT
  { name: "מוניטור נייד #2", loc: "ICU", erm: 720, status: "ok", ls: hAgo(72),
    co: { u: 15, at: hAgo(72), loc: "נוירולוגיה" }, issue: null,
    ev: [
      { s: "ok", n: "Checked out — נוירולוגיה", t: hAgo(72), u: 15 },
      { s: "ok", n: "נראה בנוירולוגיה — לא הוחזר", t: hAgo(48), u: 2 },
    ] },
  // #3 in_use — checked out 5h ago to חדר בדיקה 2
  { name: "מוניטור נייד #3", loc: "ICU", erm: 720, status: "ok", ls: hAgo(5),
    co: { u: 14, at: hAgo(5), loc: "חדר בדיקה 2" }, issue: null,
    ev: [{ s: "ok", n: "Checked out — חדר בדיקה 2", t: hAgo(5), u: 14 }] },
  // #4 in_use — DEMO MOMENT: missing user context
  { name: "מוניטור נייד #4", loc: "ICU", erm: 720, status: "ok", ls: hAgo(5),
    co: { u: 0, at: hAgo(7), loc: "אשפוז" }, issue: null,
    ev: [
      { s: "ok", n: "Checked out — אשפוז", t: hAgo(7), u: 0 },
      { s: "ok", n: "נמצא ללא שיוך — אשפוז", t: hAgo(5), u: 0 },
    ] },
  // #5 issue+in_use — סנסור לא תקין
  { name: "מוניטור נייד #5", loc: "ICU", erm: 720, status: "issue", ls: hAgo(2),
    co: { u: 18, at: hAgo(10), loc: "חדר בדיקה 4" }, issue: ISSUE.BAD_SENSOR,
    ev: [
      { s: "ok", n: "Checked out — חדר בדיקה 4", t: hAgo(10), u: 18 },
      { s: "issue", n: ISSUE.BAD_SENSOR, t: hAgo(2), u: 18 },
    ] },

  // ── מוניטור שולחני #1-#4 (ICU, erm=720) ────────────────────────────────────
  // #1 in_use
  { name: "מוניטור שולחני #1", loc: "ICU", erm: 720, status: "ok", ls: hAgo(2),
    co: { u: 13, at: hAgo(2), loc: "ICU" }, issue: null,
    ev: [{ s: "ok", n: "Checked out — ICU", t: hAgo(2), u: 13 }] },
  // #2 in_use (senior)
  { name: "מוניטור שולחני #2", loc: "ICU", erm: 720, status: "ok", ls: hAgo(6),
    co: { u: 3, at: hAgo(6), loc: "ICU" }, issue: null,
    ev: [{ s: "ok", n: "Checked out — ICU", t: hAgo(6), u: 3 }] },
  // #3 issue+in_use — DEMO MOMENT: אין סוללה
  { name: "מוניטור שולחני #3", loc: "ICU", erm: 720, status: "issue", ls: hAgo(1),
    co: { u: 16, at: hAgo(8), loc: "ICU" }, issue: ISSUE.NO_BATTERY,
    ev: [
      { s: "ok", n: "Checked out — ICU", t: hAgo(8), u: 16 },
      { s: "issue", n: ISSUE.NO_BATTERY, t: hAgo(1), u: 16 },
    ] },
  // #4 available
  { name: "מוניטור שולחני #4", loc: "ICU", erm: 720, status: "ok", ls: hAgo(36),
    co: null, issue: null, ev: [] },

  // ── מד ל"ד (פינקי) ICU #1-#3 (ICU, erm=10) ────────────────────────────────
  // #1 in_use
  { name: "מד ל\"ד (פינקי) ICU #1", loc: "ICU", erm: 10, status: "ok", ls: mAgo(5),
    co: { u: 19, at: mAgo(5), loc: "ICU" }, issue: null,
    ev: [{ s: "ok", n: "Checked out — ICU", t: mAgo(5), u: 19 }] },
  // #2 overdue — 48h ago
  { name: "מד ל\"ד (פינקי) ICU #2", loc: "ICU", erm: 10, status: "ok", ls: hAgo(48),
    co: { u: 20, at: hAgo(48), loc: "כלבייה" }, issue: null,
    ev: [{ s: "ok", n: "Checked out — כלבייה", t: hAgo(48), u: 20 }] },
  // #3 in_use
  { name: "מד ל\"ד (פינקי) ICU #3", loc: "ICU", erm: 10, status: "ok", ls: mAgo(6),
    co: { u: 21, at: mAgo(6), loc: "ICU" }, issue: null,
    ev: [{ s: "ok", n: "Checked out — ICU", t: mAgo(6), u: 21 }] },

  // ── מד ל"ד (פינקי) אשפוז #1-#3 (אשפוז, erm=10) ───────────────────────────
  // #1 in_use
  { name: "מד ל\"ד (פינקי) אשפוז #1", loc: "אשפוז", erm: 10, status: "ok", ls: mAgo(4),
    co: { u: 22, at: mAgo(4), loc: "חתוליה" }, issue: null,
    ev: [{ s: "ok", n: "Checked out — חתוליה", t: mAgo(4), u: 22 }] },
  // #2 in_use
  { name: "מד ל\"ד (פינקי) אשפוז #2", loc: "אשפוז", erm: 10, status: "ok", ls: mAgo(7),
    co: { u: 23, at: mAgo(7), loc: "בידוד" }, issue: null,
    ev: [{ s: "ok", n: "Checked out — בידוד", t: mAgo(7), u: 23 }] },
  // #3 issue — לידים לא תקינים
  { name: "מד ל\"ד (פינקי) אשפוז #3", loc: "אשפוז", erm: 10, status: "issue", ls: hAgo(12),
    co: null, issue: ISSUE.BAD_LEADS,
    ev: [{ s: "issue", n: ISSUE.BAD_LEADS, t: hAgo(12), u: 24 }] },

  // ── קרדל אשפוז #1-#2 (אשפוז, erm=null) ───────────────────────────────────
  // #1 in_use
  { name: "קרדל אשפוז #1", loc: "אשפוז", erm: null, status: "ok", ls: hAgo(3),
    co: { u: 25, at: hAgo(3), loc: "כלבייה" }, issue: null,
    ev: [{ s: "ok", n: "Checked out — כלבייה", t: hAgo(3), u: 25 }] },
  // #2 issue — שבור
  { name: "קרדל אשפוז #2", loc: "אשפוז", erm: null, status: "issue", ls: hAgo(6),
    co: null, issue: ISSUE.BROKEN,
    ev: [{ s: "issue", n: ISSUE.BROKEN, t: hAgo(6), u: 26 }] },

  // ── קרדל כירורגיה #1-#2 (כירורגיה, erm=null) ──────────────────────────────
  // #1 in_use (senior)
  { name: "קרדל כירורגיה #1", loc: "כירורגיה", erm: null, status: "ok", ls: hAgo(1),
    co: { u: 4, at: hAgo(1), loc: "חדר ניתוח 2" }, issue: null,
    ev: [{ s: "ok", n: "Checked out — חדר ניתוח 2", t: hAgo(1), u: 4 }] },
  // #2 available
  { name: "קרדל כירורגיה #2", loc: "כירורגיה", erm: null, status: "ok", ls: hAgo(28),
    co: null, issue: null, ev: [] },

  // ── גלוקומטר ICU #1-#5 (ICU, erm=3) ───────────────────────────────────────
  // #1 in_use
  { name: "גלוקומטר ICU #1", loc: "ICU", erm: 3, status: "ok", ls: mAgo(1),
    co: { u: 27, at: mAgo(1), loc: "ICU" }, issue: null,
    ev: [{ s: "ok", n: "Checked out — ICU", t: mAgo(1), u: 27 }] },
  // #2 in_use
  { name: "גלוקומטר ICU #2", loc: "ICU", erm: 3, status: "ok", ls: mAgo(2),
    co: { u: 28, at: mAgo(2), loc: "ICU" }, issue: null,
    ev: [{ s: "ok", n: "Checked out — ICU", t: mAgo(2), u: 28 }] },
  // #3 available
  { name: "גלוקומטר ICU #3", loc: "ICU", erm: 3, status: "ok", ls: hAgo(14),
    co: null, issue: null, ev: [] },
  // #4 overdue — 28h ago
  { name: "גלוקומטר ICU #4", loc: "ICU", erm: 3, status: "ok", ls: hAgo(28),
    co: { u: 29, at: hAgo(28), loc: "אונקולוגיה" }, issue: null,
    ev: [{ s: "ok", n: "Checked out — אונקולוגיה", t: hAgo(28), u: 29 }] },
  // #5 issue — סנסור לא תקין
  { name: "גלוקומטר ICU #5", loc: "ICU", erm: 3, status: "issue", ls: hAgo(4),
    co: null, issue: ISSUE.BAD_SENSOR,
    ev: [{ s: "issue", n: ISSUE.BAD_SENSOR, t: hAgo(4), u: 30 }] },

  // ── גלוקומטר אשפוז #1-#5 (אשפוז, erm=3) ─────────────────────────────────
  // #1 in_use
  { name: "גלוקומטר אשפוז #1", loc: "אשפוז", erm: 3, status: "ok", ls: mAgo(1),
    co: { u: 31, at: mAgo(1), loc: "כלבייה" }, issue: null,
    ev: [{ s: "ok", n: "Checked out — כלבייה", t: mAgo(1), u: 31 }] },
  // #2 in_use
  { name: "גלוקומטר אשפוז #2", loc: "אשפוז", erm: 3, status: "ok", ls: mAgo(2),
    co: { u: 32, at: mAgo(2), loc: "חתוליה" }, issue: null,
    ev: [{ s: "ok", n: "Checked out — חתוליה", t: mAgo(2), u: 32 }] },
  // #3 overdue — 6h ago
  { name: "גלוקומטר אשפוז #3", loc: "אשפוז", erm: 3, status: "ok", ls: hAgo(6),
    co: { u: 33, at: hAgo(6), loc: "חדר בדיקה 3" }, issue: null,
    ev: [{ s: "ok", n: "Checked out — חדר בדיקה 3", t: hAgo(6), u: 33 }] },
  // #4 available
  { name: "גלוקומטר אשפוז #4", loc: "אשפוז", erm: 3, status: "ok", ls: hAgo(20),
    co: null, issue: null, ev: [] },
  // #5 available
  { name: "גלוקומטר אשפוז #5", loc: "אשפוז", erm: 3, status: "ok", ls: hAgo(18),
    co: null, issue: null, ev: [] },

  // ── מגלחת ICU #1-#4 (ICU, erm=15) ─────────────────────────────────────────
  // #1 in_use
  { name: "מגלחת ICU #1", loc: "ICU", erm: 15, status: "ok", ls: mAgo(8),
    co: { u: 34, at: mAgo(8), loc: "ICU" }, issue: null,
    ev: [{ s: "ok", n: "Checked out — ICU", t: mAgo(8), u: 34 }] },
  // #2 available (past checkout+return cycle)
  { name: "מגלחת ICU #2", loc: "ICU", erm: 15, status: "ok", ls: hAgo(3),
    co: null, issue: null,
    ev: [
      { s: "ok", n: "Checked out — ICU", t: hAgo(24), u: 13 },
      { s: "ok", n: "Returned — available", t: hAgo(3), u: 13 },
    ] },
  // #3 OVERDUE 3 days — DEMO MOMENT
  { name: "מגלחת ICU #3", loc: "ICU", erm: 15, status: "ok", ls: hAgo(36),
    co: { u: 17, at: hAgo(72), loc: "דרמטולוגיה" }, issue: null,
    ev: [
      { s: "ok", n: "Checked out — דרמטולוגיה", t: hAgo(72), u: 17 },
      { s: "ok", n: "נראה בדרמטולוגיה — לא הוחזר", t: hAgo(36), u: 5 },
    ] },
  // #4 issue — DEMO MOMENT: שבור (senior reported)
  { name: "מגלחת ICU #4", loc: "ICU", erm: 15, status: "issue", ls: hAgo(18),
    co: null, issue: ISSUE.BROKEN,
    ev: [{ s: "issue", n: ISSUE.BROKEN, t: hAgo(18), u: 5 }] },

  // ── מגלחת אשפוז #1-#4 (אשפוז, erm=15) ────────────────────────────────────
  // #1 in_use
  { name: "מגלחת אשפוז #1", loc: "אשפוז", erm: 15, status: "ok", ls: mAgo(10),
    co: { u: 35, at: mAgo(10), loc: "כלבייה" }, issue: null,
    ev: [{ s: "ok", n: "Checked out — כלבייה", t: mAgo(10), u: 35 }] },
  // #2 overdue — 25h ago
  { name: "מגלחת אשפוז #2", loc: "אשפוז", erm: 15, status: "ok", ls: hAgo(25),
    co: { u: 36, at: hAgo(25), loc: "בידוד" }, issue: null,
    ev: [{ s: "ok", n: "Checked out — בידוד", t: hAgo(25), u: 36 }] },
  // #3 available
  { name: "מגלחת אשפוז #3", loc: "אשפוז", erm: 15, status: "ok", ls: hAgo(10),
    co: null, issue: null, ev: [] },
  // #4 issue — אין סוללה
  { name: "מגלחת אשפוז #4", loc: "אשפוז", erm: 15, status: "issue", ls: hAgo(3),
    co: null, issue: ISSUE.NO_BATTERY,
    ev: [{ s: "issue", n: ISSUE.NO_BATTERY, t: hAgo(3), u: 37 }] },

  // ── מכונת הנשמה ICU #1-#3 (ICU, erm=720) ──────────────────────────────────
  // #1 in_use (senior)
  { name: "מכונת הנשמה ICU #1", loc: "ICU", erm: 720, status: "ok", ls: hAgo(3),
    co: { u: 2, at: hAgo(3), loc: "ICU" }, issue: null,
    ev: [{ s: "ok", n: "Checked out — ICU", t: hAgo(3), u: 2 }] },
  // #2 OVERDUE — DEMO MOMENT: ICU stuck device (senior, 50h ago)
  { name: "מכונת הנשמה ICU #2", loc: "ICU", erm: 720, status: "ok", ls: hAgo(24),
    co: { u: 6, at: hAgo(50), loc: "ICU" }, issue: null,
    ev: [
      { s: "ok", n: "Checked out — ICU", t: hAgo(50), u: 6 },
      { s: "ok", n: "עדיין בשימוש — ICU", t: hAgo(24), u: 6 },
    ] },
  // #3 available
  { name: "מכונת הנשמה ICU #3", loc: "ICU", erm: 720, status: "ok", ls: hAgo(30),
    co: null, issue: null, ev: [] },

  // ── מכונת הנשמה כירורגיה #1-#2 (כירורגיה, erm=720) ────────────────────────
  // #1 in_use (senior)
  { name: "מכונת הנשמה כירורגיה #1", loc: "כירורגיה", erm: 720, status: "ok", ls: hAgo(8),
    co: { u: 7, at: hAgo(8), loc: "חדר ניתוח 1" }, issue: null,
    ev: [{ s: "ok", n: "Checked out — חדר ניתוח 1", t: hAgo(8), u: 7 }] },
  // #2 available
  { name: "מכונת הנשמה כירורגיה #2", loc: "כירורגיה", erm: 720, status: "ok", ls: hAgo(44),
    co: null, issue: null, ev: [] },

  // ── מנשם חירום #1-#2 (ICU, erm=720) ───────────────────────────────────────
  // #1 in_use
  { name: "מנשם חירום #1", loc: "ICU", erm: 720, status: "ok", ls: hAgo(5),
    co: { u: 18, at: hAgo(5), loc: "ICU" }, issue: null,
    ev: [{ s: "ok", n: "Checked out — ICU", t: hAgo(5), u: 18 }] },
  // #2 available
  { name: "מנשם חירום #2", loc: "ICU", erm: 720, status: "ok", ls: hAgo(40),
    co: null, issue: null, ev: [] },

  // ── Blower #1-#2 (אשפוז, erm=null) ────────────────────────────────────────
  // #1 available
  { name: "Blower #1", loc: "אשפוז", erm: null, status: "ok", ls: hAgo(16),
    co: null, issue: null, ev: [] },
  // #2 issue — מסך לא תקין
  { name: "Blower #2", loc: "אשפוז", erm: null, status: "issue", ls: hAgo(24),
    co: null, issue: ISSUE.BAD_SCREEN,
    ev: [{ s: "issue", n: ISSUE.BAD_SCREEN, t: hAgo(24), u: 20 }] },

  // ── דיפיברילטור ICU (ICU, erm=null) ───────────────────────────────────────
  { name: "דיפיברילטור ICU", loc: "ICU", erm: null, status: "ok", ls: hAgo(8),
    co: null, issue: null, ev: [] },

  // ── דופלר ICU #1-#2 (ICU, erm=10) ─────────────────────────────────────────
  // #1 overdue — 40h ago
  { name: "דופלר ICU #1", loc: "ICU", erm: 10, status: "ok", ls: hAgo(40),
    co: { u: 13, at: hAgo(40), loc: "אופטמולוגיה" }, issue: null,
    ev: [{ s: "ok", n: "Checked out — אופטמולוגיה", t: hAgo(40), u: 13 }] },
  // #2 DEMO MOMENT: recently returned (8 min ago)
  { name: "דופלר ICU #2", loc: "ICU", erm: 10, status: "ok", ls: mAgo(8),
    co: null, issue: null,
    ev: [
      { s: "ok", n: "Checked out — סוסים", t: hAgo(2), u: 9 },
      { s: "ok", n: "Returned — available", t: mAgo(8), u: 9 },
    ] },

  // ── ביקרדיה ICU (ICU, erm=null) ───────────────────────────────────────────
  { name: "ביקרדיה ICU", loc: "ICU", erm: null, status: "ok", ls: hAgo(12),
    co: null, issue: null, ev: [] },

  // ── לקטטומטר ICU (ICU, erm=null) ──────────────────────────────────────────
  { name: "לקטטומטר ICU", loc: "ICU", erm: null, status: "ok", ls: hAgo(22),
    co: null, issue: null, ev: [] },
];

// ═══════════════════════════════════════════════════════════════════════════════
// Seed functions
// ═══════════════════════════════════════════════════════════════════════════════

async function countDemo() {
  const [u] = await db.select({ c: count() }).from(users).where(like(users.id, `${DEMO_USER_PFX}%`));
  const [e] = await db.select({ c: count() }).from(equipment).where(like(equipment.id, `${DEMO_EQ_PFX}%`));
  const [l] = await db.select({ c: count() }).from(scanLogs).where(like(scanLogs.id, `${DEMO_LOG_PFX}%`));
  const [s] = await db.select({ c: count() }).from(shifts).where(like(shifts.id, `${DEMO_SHIFT_PFX}%`));
  return { users: u.c, equipment: e.c, logs: l.c, shifts: s.c };
}

async function seedUsers() {
  const existing = await db.select({ name: users.name }).from(users);
  const nameSet = new Set(existing.map((u) => u.name));

  for (let i = 0; i < ROSTER.length; i++) {
    const r = ROSTER[i];
    if (nameSet.has(r.name)) continue;
    await db.insert(users).values({
      id: uId(i),
      clerkId: uClerk(i),
      email: uEmail(i),
      name: r.name,
      displayName: r.name,
      role: r.role,
      status: "active",
    }).onConflictDoNothing({ target: users.clerkId });
  }
}

async function seedEquipmentAndLogs() {
  for (let i = 0; i < ITEMS.length; i++) {
    const it = ITEMS[i];
    const id = eId(i);

    const coFields = it.co
      ? {
          checkedOutById: uId(it.co.u),
          checkedOutByEmail: uEmail(it.co.u),
          checkedOutAt: it.co.at,
          checkedOutLocation: it.co.loc,
        }
      : {
          checkedOutById: null,
          checkedOutByEmail: null,
          checkedOutAt: null,
          checkedOutLocation: null,
        };

    const values = {
      id,
      name: it.name,
      location: it.loc,
      status: it.status,
      lastSeen: it.ls,
      lastStatus: it.status,
      expectedReturnMinutes: it.erm,
      createdAt: subDays(NOW, 30),
      ...coFields,
    };

    await db
      .insert(equipment)
      .values(values)
      .onConflictDoUpdate({
        target: equipment.id,
        set: {
          name: it.name,
          location: it.loc,
          status: it.status,
          lastSeen: it.ls,
          lastStatus: it.status,
          expectedReturnMinutes: it.erm,
          ...coFields,
        },
      });

    for (let e = 0; e < it.ev.length; e++) {
      const ev = it.ev[e];
      await db
        .insert(scanLogs)
        .values({
          id: lId(i, e),
          equipmentId: id,
          userId: uId(ev.u),
          userEmail: uEmail(ev.u),
          status: ev.s,
          note: ev.n,
          timestamp: ev.t,
        })
        .onConflictDoNothing({ target: scanLogs.id });
    }
  }
}

async function seedShifts() {
  const seniors = ROSTER.map((r, i) => ({ ...r, i })).filter((r) => r.isSenior);
  const dayDates = [0, 1, 2].map((d) => format(subDays(NOW, d), "yyyy-MM-dd"));

  for (const sr of seniors) {
    for (let d = 0; d < dayDates.length; d++) {
      const morning = d % 2 === 0;
      await db
        .insert(shifts)
        .values({
          id: sId(sr.i, d),
          date: dayDates[d],
          startTime: morning ? "07:00" : "15:00",
          endTime: morning ? "15:00" : "23:00",
          employeeName: sr.name,
          role: "senior_technician",
        })
        .onConflictDoNothing({ target: shifts.id });
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║  VetTrack — 3-Day Hospital Demo Seed         ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  const before = await countDemo();

  await seedUsers();
  console.log("  ✓ Users processed");

  await seedEquipmentAndLogs();
  console.log("  ✓ Equipment + scan logs processed");

  await seedShifts();
  console.log("  ✓ Shifts processed");

  const after = await countDemo();

  const inUse = ITEMS.filter((it) => it.co && it.status === "ok" && !isOverdue(it)).length;
  const overdue = ITEMS.filter((it) => it.co && it.status === "ok" && isOverdue(it)).length;
  const issues = ITEMS.filter((it) => it.status === "issue").length;
  const totalEvents = ITEMS.reduce((sum, it) => sum + it.ev.length, 0);

  console.log("\n═══════════════════════════════════════════════");
  console.log("  Summary");
  console.log("═══════════════════════════════════════════════");
  console.log(`  Users inserted:      ${after.users - before.users} (total demo: ${after.users})`);
  console.log(`  Equipment created:   ${after.equipment - before.equipment} (total demo: ${after.equipment})`);
  console.log(`  In use:              ${inUse}`);
  console.log(`  Overdue:             ${overdue}`);
  console.log(`  Issues:              ${issues}`);
  console.log(`  Events created:      ${after.logs - before.logs} (total demo: ${after.logs})`);
  console.log(`  Shifts created:      ${after.shifts - before.shifts} (total demo: ${after.shifts})`);
  console.log(`  Total event slots:   ${totalEvents}`);
  console.log("═══════════════════════════════════════════════\n");
}

function isOverdue(it: EqDef): boolean {
  if (!it.co || it.erm == null) return false;
  return it.co.at.getTime() + it.erm * 60_000 < NOW.getTime();
}

main()
  .catch((err) => {
    console.error("\n❌ Seed failed:", err);
    process.exit(1);
  })
  .finally(() => pool.end());
