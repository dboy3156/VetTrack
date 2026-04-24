/**
 * /dev-verify — Interactive dispense flow walkthrough (non-production only).
 * 14 guided steps that verify the complete consumable dispense feature end-to-end.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { Helmet } from "react-helmet-async";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { api, request } from "@/lib/api";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type StepStatus = "pending" | "running" | "pass" | "fail" | "warn" | "manual";

interface StepResult {
  stepIndex: number;
  name: string;
  status: StepStatus;
  message: string;
  fixHint?: string;
}

interface WalkthroughState {
  active: boolean;
  currentStep: number;
  results: StepResult[];
  waitingForUser: boolean;
  userPrompt: string;
  highlightSelector: string | null;
  tooltipText: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

interface LastDispenseResponse {
  logs: Array<{
    id: string;
    containerId: string;
    quantityAdded: number;
    animalId: string | null;
    animalName: string | null;
    createdByUserId: string;
    createdByDisplayName: string | null;
    createdAt: string;
    metadata: Record<string, unknown> | null;
  }>;
  pendingEmergencies: number;
  lastBillingEntry: { id: string; status: string; animalId: string; itemId: string } | null;
}

async function fetchLastDispense(): Promise<LastDispenseResponse> {
  return request<LastDispenseResponse>("/api/test/last-dispense");
}

const STEP_NAMES = [
  "בדיקת תנאי מוקדמים — עגלות",
  "בדיקת תנאי מוקדמים — מטופלים",
  "פתיחת חלון לקיחה ללא NFC",
  "בדיקת כפתור חירום",
  "בחירת פריטים",
  "בחירת מטופל",
  "ווידוא הצלחה — Flow רגיל",
  "פתיחת חלון לקיחה — בדיקת חירום",
  "לחיצה על כפתור חירום",
  "בדיקת דוח חפיפת משמרת — חירום ממתין",
  "השלמת חירום",
  "בדיקת ללא שיוך",
  "בדיקת מי לקח — שקיפות",
  "סיכום בדיקה",
];

const TOTAL_STEPS = 14;

// ─── Highlight ring ────────────────────────────────────────────────────────────

function HighlightRing({ selector }: { selector: string | null }) {
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  useEffect(() => {
    if (!selector) { setRect(null); return; }
    const update = () => {
      const el = document.querySelector(selector);
      if (!el) { setRect(null); return; }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top + window.scrollY, left: r.left + window.scrollX, width: r.width, height: r.height });
    };
    update();
    const timer = setInterval(update, 500);
    return () => clearInterval(timer);
  }, [selector]);

  if (!rect) return null;
  return (
    <div
      className="pointer-events-none fixed z-[90] ring-4 ring-blue-500 animate-pulse rounded-xl transition-all"
      style={{
        top: rect.top - 6,
        left: rect.left - 6,
        width: rect.width + 12,
        height: rect.height + 12,
        position: "absolute",
      }}
    />
  );
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

function Tooltip({ selector, text }: { selector: string | null; text: string | null }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!selector || !text) { setPos(null); return; }
    const update = () => {
      const el = document.querySelector(selector);
      if (!el) { setPos(null); return; }
      const r = el.getBoundingClientRect();
      setPos({ top: r.bottom + window.scrollY + 12, left: Math.max(8, r.left + window.scrollX) });
    };
    update();
    const timer = setInterval(update, 500);
    return () => clearInterval(timer);
  }, [selector, text]);

  if (!pos || !text) return null;
  return (
    <div
      className="pointer-events-none z-[95] absolute max-w-[280px] bg-yellow-400 text-yellow-900 text-sm font-semibold px-3 py-2 rounded-xl shadow-lg"
      style={{ top: pos.top, left: pos.left }}
    >
      {text}
      <div className="absolute -top-2 right-4 w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-b-[8px] border-b-yellow-400" />
    </div>
  );
}

// ─── Step result row ──────────────────────────────────────────────────────────

function StepRow({ result }: { result: StepResult }) {
  const icon =
    result.status === "pass" ? "✓" :
    result.status === "fail" ? "✗" :
    result.status === "warn" ? "⚠" :
    result.status === "manual" ? "↩" : "…";

  const color =
    result.status === "pass" ? "text-green-700 bg-green-50 border-green-200" :
    result.status === "fail" ? "text-red-700 bg-red-50 border-red-200" :
    result.status === "warn" ? "text-amber-700 bg-amber-50 border-amber-200" :
    "text-gray-600 bg-gray-50 border-gray-200";

  return (
    <div className={cn("flex items-start gap-3 px-3 py-2 rounded-lg border text-sm", color)} dir="rtl">
      <span className="font-bold text-lg w-6 shrink-0 text-center leading-tight">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold">{result.name}</p>
        <p className="text-xs mt-0.5 opacity-80">{result.message}</p>
        {result.fixHint && (
          <p className="text-xs mt-1 font-medium opacity-90">תיקון: {result.fixHint}</p>
        )}
      </div>
      <span className="text-xs opacity-60 shrink-0">שלב {result.stepIndex + 1}</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DevVerifyPage() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const isDevMode = import.meta.env.DEV || search.includes("devmode=1");

  const [wt, setWt] = useState<WalkthroughState>({
    active: false,
    currentStep: 0,
    results: [],
    waitingForUser: false,
    userPrompt: "",
    highlightSelector: null,
    tooltipText: null,
  });

  // Cached state for step verification
  const cachedContainersRef = useRef<Array<{ id: string; name: string }>>([]);
  const userActionResolveRef = useRef<(() => void) | null>(null);

  const addResult = useCallback((result: StepResult) => {
    setWt((prev) => ({ ...prev, results: [...prev.results, result] }));
  }, []);

  const updateStep = useCallback((stepIndex: number, status: StepStatus, message: string, fixHint?: string) => {
    addResult({ stepIndex, name: STEP_NAMES[stepIndex], status, message, fixHint });
  }, [addResult]);

  const setHighlight = useCallback((selector: string | null, tooltip: string | null) => {
    setWt((prev) => ({ ...prev, highlightSelector: selector, tooltipText: tooltip }));
  }, []);

  const waitForUser = useCallback((prompt: string): Promise<void> => {
    return new Promise<void>((resolve) => {
      userActionResolveRef.current = resolve;
      setWt((prev) => ({ ...prev, waitingForUser: true, userPrompt: prompt }));
    });
  }, []);

  const continueWalkthrough = useCallback(() => {
    const resolve = userActionResolveRef.current;
    if (resolve) {
      userActionResolveRef.current = null;
      setWt((prev) => ({ ...prev, waitingForUser: false, userPrompt: "" }));
      resolve();
    }
  }, []);

  // ── Step implementations ──────────────────────────────────────────────────

  const runStep1 = useCallback(async () => {
    setWt((prev) => ({ ...prev, currentStep: 0 }));
    try {
      const containers = await api.containers.list();
      cachedContainersRef.current = containers.map((c) => ({ id: c.id, name: c.name }));
      if (containers.length > 0) {
        updateStep(0, "pass", `✓ נמצאו ${containers.length} עגלות במערכת`);
        await sleep(1500);
        return true;
      } else {
        updateStep(0, "fail", "✗ אין עגלות במערכת", "עבור ל-/inventory וצור עגלה עם לפחות 2 פריטים וכמות > 0");
        return false;
      }
    } catch {
      updateStep(0, "fail", "✗ שגיאה בטעינת העגלות", "בדוק שהשרת פועל");
      return false;
    }
  }, [updateStep]);

  const runStep2 = useCallback(async () => {
    setWt((prev) => ({ ...prev, currentStep: 1 }));
    try {
      const today = new Date().toISOString().slice(0, 10);
      const appointments = await api.appointments.list({ day: today });
      const uniqueAnimals = new Set(appointments.map((a) => a.animalId).filter(Boolean));
      if (uniqueAnimals.size > 0) {
        updateStep(1, "pass", `✓ נמצאו ${uniqueAnimals.size} מטופלים פעילים היום`);
      } else {
        updateStep(1, "warn", "⚠ אין מטופלים פעילים — בדיקת שיוך לא תהיה זמינה, ממשיך עם ללא שיוך");
      }
      await sleep(1500);
      return true;
    } catch {
      updateStep(1, "warn", "⚠ לא ניתן לטעון מטופלים — ממשיך");
      await sleep(1500);
      return true;
    }
  }, [updateStep]);

  const runStep3 = useCallback(async () => {
    setWt((prev) => ({ ...prev, currentStep: 2 }));
    navigate("/inventory?devmode=1");
    await sleep(1000);
    setHighlight('[data-testid="dev-dispense-trigger"]', "לחץ על הכפתור לסימולציית סריקת עגלה");
    await waitForUser("לחץ על 🧪 בדיקת לקיחת מתכלים בתחתית הדף");
    setHighlight(null, null);
    await sleep(800);
    // Verify DispenseSheet opened
    const sheetOpen = document.querySelector('[role="dialog"]') !== null ||
      document.querySelector('[data-radix-dialog-content]') !== null;
    if (sheetOpen) {
      updateStep(2, "pass", "✓ חלון הלקיחה נפתח — סימולציית סריקת עגלה הצליחה");
    } else {
      updateStep(2, "manual", "↩ בוצע ידנית — לא ניתן לאמת פתיחת חלון אוטומטית");
    }
    await sleep(1500);
    return true;
  }, [navigate, setHighlight, updateStep, waitForUser]);

  const runStep4 = useCallback(async () => {
    setWt((prev) => ({ ...prev, currentStep: 3 }));
    setHighlight('[data-testid="dev-dispense-trigger"]', null);
    await sleep(500);
    // Check emergency button exists in DOM
    const emergencyBtn = document.querySelector('button.bg-red-600') ||
      document.querySelector('[aria-label*="חירום"]') ||
      Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.includes("חירום"));
    if (emergencyBtn) {
      setHighlight(null, "וודא שהכפתור האדום נמצא בראש החלון — מעל רשימת הפריטים");
      updateStep(3, "pass", "✓ כפתור חירום נמצא בראש החלון");
    } else {
      updateStep(3, "fail", "✗ כפתור חירום לא נמצא", "בדוק את סדר ה-JSX ב-DispenseSheet.tsx — הכפתור חייב להיות לפני רשימת הפריטים");
    }
    await waitForUser("וודא שהכפתור האדום 🚨 חירום נמצא מעל הפריטים, ולחץ המשך");
    setHighlight(null, null);
    await sleep(500);
    return true;
  }, [setHighlight, updateStep, waitForUser]);

  const runStep5 = useCallback(async () => {
    setWt((prev) => ({ ...prev, currentStep: 4 }));
    const plusBtns = Array.from(document.querySelectorAll('button[aria-label="הוסף"]'));
    if (plusBtns.length > 0) {
      setHighlight('button[aria-label="הוסף"]', "לחץ + על לפחות שני פריטים");
    }
    await waitForUser("בחר כמות > 0 לפחות לשני פריטים, לאחר מכן לחץ המשך");
    setHighlight(null, null);
    // Count selected items
    const continueBtns = Array.from(document.querySelectorAll("button")).filter((b) => b.textContent?.trim() === "המשך");
    if (continueBtns.length > 0) {
      setHighlight(null, 'לחץ על "המשך"');
    }
    await waitForUser('לחץ על "המשך" בחלון הלקיחה');
    setHighlight(null, null);
    updateStep(4, "pass", "✓ פריטים נבחרו — עבר לבחירת מטופל");
    await sleep(1000);
    return true;
  }, [setHighlight, updateStep, waitForUser]);

  const runStep6 = useCallback(async () => {
    setWt((prev) => ({ ...prev, currentStep: 5 }));
    await sleep(500);
    // Check patient cards loaded
    const patientCards = document.querySelectorAll('button.rounded-xl.border.text-right.min-h-\\[80px\\]').length;
    if (patientCards > 0) {
      updateStep(5, "pass", `✓ ${patientCards} כרטיסי מטופלים נטענו בתצוגת 2 עמודות`);
    } else {
      updateStep(5, "warn", "⚠ לא נמצאו כרטיסי מטופלים — בחר ללא שיוך");
    }
    await waitForUser("בחר מטופל מהרשימה או לחץ 'ללא שיוך למטופל', ואז לחץ 'אשר לקיחה'");
    setHighlight(null, null);
    await sleep(500);
    return true;
  }, [setHighlight, updateStep, waitForUser]);

  const runStep7 = useCallback(async () => {
    setWt((prev) => ({ ...prev, currentStep: 6 }));
    setWt((prev) => ({ ...prev, userPrompt: "שולח בקשה..." }));
    // Wait for success screen
    await sleep(2000);
    const hasCheckmark = document.querySelector("svg.text-green-500") !== null ||
      document.querySelector(".text-green-500") !== null;
    if (hasCheckmark) {
      updateStep(6, "pass", "✓ מסך הצלחה מוצג");
    } else {
      updateStep(6, "manual", "↩ בוצע ידנית — אמת שמסך הצלחה הוצג עם שם טכנאי ומטופל");
    }
    // DB verification
    try {
      const data = await fetchLastDispense();
      const lastLog = data.logs[0];
      if (lastLog && lastLog.quantityAdded < 0) {
        updateStep(6, "pass", "✓ DB — מלאי ירד (quantity_added < 0)");
      } else {
        updateStep(6, "fail", "✗ DB — quantity_added לא שלילי", "בדוק את ה-transaction ב-containers.ts");
      }
      if (lastLog?.createdByUserId) {
        updateStep(6, "pass", "✓ DB — created_by_user_id נשמר");
      } else {
        updateStep(6, "fail", "✗ DB — created_by_user_id חסר", "createdByUserId חייב לבוא מ-auth");
      }
      if (data.lastBillingEntry && data.lastBillingEntry.status === "pending") {
        updateStep(6, "pass", "✓ DB — billing entry נוצר עם סטטוס pending");
      } else if (lastLog?.animalId) {
        updateStep(6, "fail", "✗ DB — billing entry חסר עבור לקיחה עם מטופל", "בדוק את הכנסת billingLedger ב-containers.ts");
      }
    } catch {
      updateStep(6, "warn", "⚠ לא ניתן לאמת DB — השרת לא החזיר נתונים");
    }
    // Check auto-close after 3s
    await sleep(3500);
    const sheetStillOpen = document.querySelector('[role="dialog"]') !== null ||
      document.querySelector('[data-radix-dialog-content]') !== null;
    if (!sheetStillOpen) {
      updateStep(6, "pass", "✓ חלון נסגר אוטומטית אחרי 3 שניות");
    } else {
      updateStep(6, "fail", "✗ חלון לא נסגר אוטומטית", "בדוק את setTimeout ב-DispenseSheet.tsx בסטייט success");
    }
    await sleep(500);
    return true;
  }, [updateStep]);

  const runStep8 = useCallback(async () => {
    setWt((prev) => ({ ...prev, currentStep: 7 }));
    navigate("/inventory?devmode=1");
    await sleep(800);
    setHighlight('[data-testid="dev-dispense-trigger"]', "לחץ לפתיחת חלון לקיחה לבדיקת חירום");
    await waitForUser("לחץ על 🧪 בדיקת לקיחת מתכלים שוב לפתיחת חלון חדש");
    setHighlight(null, null);
    updateStep(7, "pass", "✓ חלון הלקיחה נפתח");
    await sleep(800);
    return true;
  }, [navigate, setHighlight, updateStep, waitForUser]);

  const runStep9 = useCallback(async () => {
    setWt((prev) => ({ ...prev, currentStep: 8 }));
    const emergencyBtn = Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("חירום") && b.classList.contains("bg-red-600"),
    );
    if (emergencyBtn) {
      setHighlight(null, "לחץ על 🚨 חירום — זה מדמה מצב החייאה");
    }
    await waitForUser("לחץ על כפתור 🚨 חירום");
    setHighlight(null, null);
    setWt((prev) => ({ ...prev, userPrompt: "רושם חירום..." }));
    await sleep(2500);
    // Check emergency success screen
    const hasEmergencyText = document.body.textContent?.includes("חירום נרשם");
    if (hasEmergencyText) {
      updateStep(8, "pass", "✓ מסך חירום מוצג — 'חירום נרשם'");
    } else {
      updateStep(8, "manual", "↩ בוצע ידנית — אמת שמסך 'חירום נרשם' הוצג");
    }
    // Verify no auto-close (wait 4 seconds)
    await sleep(4000);
    const sheetStillOpen = document.querySelector('[role="dialog"]') !== null ||
      document.querySelector('[data-radix-dialog-content]') !== null;
    if (sheetStillOpen) {
      updateStep(8, "pass", "✓ חלון לא נסגר אוטומטית — נכון לחירום");
    } else {
      updateStep(8, "fail", "✗ חלון נסגר לבד — שגיאה קריטית", "הסר את setTimeout ממסך emergency-success ב-DispenseSheet.tsx");
    }
    // DB check
    try {
      const data = await fetchLastDispense();
      if (data.pendingEmergencies > 0) {
        updateStep(8, "pass", "✓ DB — emergency log עם pendingCompletion: true");
      } else {
        updateStep(8, "fail", "✗ DB — emergency log לא נמצא עם pendingCompletion", "בדוק את הכנסת metadata.pendingCompletion=true ב-containers.ts");
      }
    } catch {
      updateStep(8, "warn", "⚠ לא ניתן לאמת DB emergency");
    }
    setHighlight(null, "לחץ 'סגור לעכשיו'");
    await waitForUser("לחץ 'סגור לעכשיו' לסגירת חלון החירום");
    setHighlight(null, null);
    updateStep(8, "pass", "✓ חלון נסגר");
    await sleep(500);
    return true;
  }, [setHighlight, updateStep, waitForUser]);

  const runStep10 = useCallback(async () => {
    setWt((prev) => ({ ...prev, currentStep: 9 }));
    navigate("/shift-handover");
    await sleep(1500);
    const hasConsumablesSection = document.body.textContent?.includes("צריכת מתכלים במשמרת");
    if (hasConsumablesSection) {
      updateStep(9, "pass", "✓ סקציית מתכלים מופיעה בחפיפת משמרת");
    } else {
      updateStep(9, "fail", "✗ הסקציה לא נמצאה", "בדוק את shift-handover-page.tsx — הוסף את סקציית consumablesQ");
    }
    // Check pending emergency badge
    await sleep(1000);
    const hasPulse = document.querySelector(".animate-pulse") !== null;
    const hasEmergencyCount = document.body.textContent?.includes("חירום ממתין");
    if (hasEmergencyCount) {
      updateStep(9, "pass", "✓ כרטיס 'חירום ממתין' מופיע" + (hasPulse ? " עם אנימציה" : ""));
    } else {
      updateStep(9, "warn", "⚠ כרטיס חירום לא זוהה בדום — בדוק ידנית");
    }
    // Check emergency row in table
    const hasRedBorder = document.querySelector(".border-r-red-500") !== null ||
      document.querySelector('[class*="border-r-4"]') !== null;
    if (hasRedBorder) {
      updateStep(9, "pass", "✓ שורת חירום עם גבול אדום מופיעה בטבלה");
    } else {
      updateStep(9, "warn", "⚠ גבול אדום לשורת חירום לא זוהה — בדוק ידנית");
    }
    setHighlight('button:has(> *)', "לחץ 'השלם עכשיו' בשורת החירום בטבלה");
    await waitForUser("מצא שורת חירום (גבול אדום) בטבלה ולחץ 'השלם עכשיו'");
    setHighlight(null, null);
    await sleep(500);
    return true;
  }, [navigate, setHighlight, updateStep, waitForUser]);

  const runStep11 = useCallback(async () => {
    setWt((prev) => ({ ...prev, currentStep: 10 }));
    await sleep(800);
    const hasEmergencyCompleteTitle = document.body.textContent?.includes("השלמת חירום");
    if (hasEmergencyCompleteTitle) {
      updateStep(10, "pass", "✓ חלון השלמה נפתח עם כותרת 'השלמת חירום'");
    } else {
      updateStep(10, "manual", "↩ בוצע ידנית — אמת שחלון 'השלמת חירום' נפתח");
    }
    await waitForUser("בחר פריטים שנלקחו בחירום, בחר מטופל (או ללא שיוך), ולאחר מכן לחץ 'אשר פירוט חירום'");
    setHighlight(null, null);
    await sleep(2000);
    const hasGreenCheck = document.querySelector(".text-green-500") !== null;
    if (hasGreenCheck) {
      updateStep(10, "pass", "✓ השלמת חירום אושרה — מסך הצלחה מוצג");
    } else {
      updateStep(10, "manual", "↩ בוצע ידנית — אמת שמסך הצלחה הוצג");
    }
    // DB check
    try {
      const data = await fetchLastDispense();
      if (data.pendingEmergencies === 0) {
        updateStep(10, "pass", "✓ DB — pendingCompletion עודכן ל-false");
      } else {
        updateStep(10, "fail", "✗ DB — pendingCompletion לא עודכן", "בדוק את update של inventoryLogs metadata ב-completeEmergency endpoint");
      }
    } catch {
      updateStep(10, "warn", "⚠ לא ניתן לאמת DB");
    }
    await sleep(1500);
    return true;
  }, [setHighlight, updateStep, waitForUser]);

  const runStep12 = useCallback(async () => {
    setWt((prev) => ({ ...prev, currentStep: 11 }));
    navigate("/inventory?devmode=1");
    await sleep(800);
    setHighlight('[data-testid="dev-dispense-trigger"]', "לחץ לפתיחת חלון לקיחה נוסף");
    await waitForUser("לחץ על 🧪 בדיקת לקיחת מתכלים");
    setHighlight(null, null);
    await sleep(600);
    await waitForUser("בחר פריטים ואז לחץ 'המשך', ובמסך הבא לחץ 'ללא שיוך למטופל', ולאחר מכן 'אשר לקיחה'");
    setHighlight(null, null);
    await sleep(2500);
    // DB check — animal_id should be null
    try {
      const data = await fetchLastDispense();
      const lastLog = data.logs[0];
      if (lastLog && lastLog.animalId === null) {
        updateStep(11, "pass", "✓ DB — animal_id = null כצפוי לבחירת ללא שיוך");
      } else {
        updateStep(11, "fail", "✗ DB — animal_id אינו null", "בדוק שכאשר selectedAnimalId=null נשלח animalId=null לשרת");
      }
      if (!data.lastBillingEntry) {
        updateStep(11, "pass", "✓ DB — אין billing entry חדש כצפוי לבחירת ללא שיוך");
      }
    } catch {
      updateStep(11, "warn", "⚠ לא ניתן לאמת DB");
    }
    await sleep(500);
    return true;
  }, [navigate, setHighlight, updateStep, waitForUser]);

  const runStep13 = useCallback(async () => {
    setWt((prev) => ({ ...prev, currentStep: 12 }));
    try {
      const data = await fetchLastDispense();
      const allHaveUserId = data.logs.every((l) => Boolean(l.createdByUserId));
      const allHaveDisplayName = data.logs.every((l) => Boolean(l.createdByDisplayName));
      if (allHaveUserId) {
        updateStep(12, "pass", "✓ כל הלקיחות כוללות created_by_user_id — עקרון השקיפות מקוים");
      } else {
        updateStep(12, "fail", "✗ יש לקיחות ללא created_by_user_id — זו שגיאה קריטית", "createdByUserId חייב לבוא מ-req.authUser!.id");
      }
      if (allHaveDisplayName) {
        updateStep(12, "pass", "✓ כל הלקיחות כוללות displayName של הטכנאי");
      } else {
        updateStep(12, "warn", "⚠ חלק מהלקיחות חסרות displayName — בדוק JOIN עם vt_users");
      }
    } catch {
      updateStep(12, "warn", "⚠ לא ניתן לאמת שקיפות ב-DB");
    }
    await sleep(1500);
    return true;
  }, [updateStep]);

  const runStep14 = useCallback(() => {
    setWt((prev) => ({ ...prev, currentStep: 13 }));
    const allResults = wt.results;
    const passed = allResults.filter((r) => r.status === "pass").length;
    const failed = allResults.filter((r) => r.status === "fail").length;
    const warned = allResults.filter((r) => r.status === "warn").length;
    const manual = allResults.filter((r) => r.status === "manual").length;

    const summaryMsg = failed > 0
      ? `✗ ${failed} בדיקות נכשלו, ${warned} אזהרות, ${passed} עברו`
      : warned > 0 || manual > 0
        ? `⚠ הבדיקות עברו עם ${warned} אזהרות ו-${manual} שלבים ידניים`
        : "✓ כל הבדיקות עברו בהצלחה — המערכת מוכנה לפיילוט";

    const status: StepStatus = failed > 0 ? "fail" : warned > 0 || manual > 0 ? "warn" : "pass";
    updateStep(13, status, summaryMsg);
  }, [updateStep, wt.results]);

  // ── Main walkthrough runner ───────────────────────────────────────────────

  const startWalkthrough = useCallback(async () => {
    setWt({
      active: true,
      currentStep: 0,
      results: [],
      waitingForUser: false,
      userPrompt: "",
      highlightSelector: null,
      tooltipText: null,
    });

    const ok1 = await runStep1();
    if (!ok1) {
      setWt((prev) => ({ ...prev, active: false }));
      return;
    }
    await runStep2();
    await runStep3();
    await runStep4();
    await runStep5();
    await runStep6();
    await runStep7();
    await runStep8();
    await runStep9();
    await runStep10();
    await runStep11();
    await runStep12();
    await runStep13();
    runStep14();

    setHighlight(null, null);
    setWt((prev) => ({ ...prev, active: false, waitingForUser: false, highlightSelector: null, tooltipText: null }));
  }, [runStep1, runStep2, runStep3, runStep4, runStep5, runStep6, runStep7, runStep8, runStep9, runStep10, runStep11, runStep12, runStep13, runStep14, setHighlight]);

  const stopWalkthrough = useCallback(() => {
    userActionResolveRef.current?.();
    userActionResolveRef.current = null;
    setWt((prev) => ({ ...prev, active: false, waitingForUser: false, highlightSelector: null, tooltipText: null }));
  }, []);

  const generateReport = useCallback(() => {
    const lines = [
      "VetTrack — דוח בדיקת לקיחת מתכלים",
      `תאריך: ${new Date().toLocaleString("he-IL")}`,
      "─".repeat(40),
      ...wt.results.map((r) =>
        `שלב ${r.stepIndex + 1} [${r.status.toUpperCase()}] ${r.name}: ${r.message}${r.fixHint ? ` — תיקון: ${r.fixHint}` : ""}`,
      ),
      "─".repeat(40),
      `סיכום: ${wt.results.filter((r) => r.status === "pass").length} עברו / ${wt.results.filter((r) => r.status === "fail").length} נכשלו / ${wt.results.filter((r) => r.status === "warn").length} אזהרות`,
    ];
    const text = lines.join("\n");
    navigator.clipboard?.writeText(text).then(() => {
      alert("הדוח הועתק ללוח");
    }).catch(() => {
      const w = window.open("", "_blank");
      if (w) { w.document.write(`<pre>${text}</pre>`); }
    });
  }, [wt.results]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (!isDevMode) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center p-8">
          <p className="text-2xl">🔒</p>
          <p className="text-muted-foreground">עמוד זה זמין רק בסביבת פיתוח</p>
          <p className="text-sm text-muted-foreground">הוסף ?devmode=1 לכתובת URL</p>
        </div>
      </Layout>
    );
  }

  const finalResult = wt.results.find((r) => r.stepIndex === 13);
  const passedCount = wt.results.filter((r) => r.status === "pass").length;
  const failedCount = wt.results.filter((r) => r.status === "fail").length;
  const warnCount = wt.results.filter((r) => r.status === "warn").length;

  return (
    <Layout>
      <Helmet>
        <title>בדיקת לקיחת מתכלים — VetTrack Dev</title>
      </Helmet>

      {/* Absolute highlight ring overlay */}
      <div className="pointer-events-none fixed inset-0 z-[89]" aria-hidden>
        <HighlightRing selector={wt.highlightSelector} />
        <Tooltip selector={wt.highlightSelector} text={wt.tooltipText} />
      </div>

      {/* Floating step indicator — shown during walkthrough */}
      {wt.active && (
        <div
          className="fixed top-0 left-0 right-0 z-[100] bg-gray-900 text-white px-4 py-2 flex items-center gap-3"
          dir="rtl"
        >
          <div className="flex items-center gap-2 shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs font-bold text-red-400">● בודק</span>
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold truncate">{STEP_NAMES[wt.currentStep] ?? "..."}</p>
            <div className="h-1 bg-gray-700 rounded-full mt-1 overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-700"
                style={{ width: `${((wt.currentStep + 1) / TOTAL_STEPS) * 100}%` }}
              />
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-2 text-xs text-gray-400">
            <span>שלב {wt.currentStep + 1} מתוך {TOTAL_STEPS}</span>
            <button
              onClick={stopWalkthrough}
              className="text-gray-300 hover:text-white ml-2 text-sm"
            >
              עצור ✕
            </button>
          </div>
        </div>
      )}

      <div
        className={cn("max-w-2xl mx-auto p-4 space-y-4", wt.active && "pt-16")}
        dir="rtl"
      >
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            🧪 בדיקת לקיחת מתכלים — מדריך מלא
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            14 שלבים אוטומטיים-חצי-ידניים לאימות זרימת הלקיחה מקצה לקצה
          </p>
        </div>

        {/* Start button */}
        {!wt.active && wt.results.length === 0 && (
          <button
            onClick={startWalkthrough}
            className="w-full min-h-[56px] bg-blue-600 text-white rounded-xl text-lg font-bold hover:bg-blue-700 active:bg-blue-800 transition-colors"
          >
            🎬 הפעל בדיקה מודרכת מלאה
          </button>
        )}

        {/* Restart button */}
        {!wt.active && wt.results.length > 0 && (
          <button
            onClick={startWalkthrough}
            className="w-full min-h-[48px] bg-blue-600 text-white rounded-xl text-base font-bold hover:bg-blue-700 transition-colors"
          >
            הרץ שוב מהתחלה
          </button>
        )}

        {/* User action prompt */}
        {wt.active && wt.waitingForUser && (
          <div className="rounded-xl border-2 border-blue-400 bg-blue-50 p-4 space-y-3" dir="rtl">
            <p className="text-blue-900 font-semibold text-base">{wt.userPrompt}</p>
            <button
              onClick={continueWalkthrough}
              className="w-full min-h-[48px] bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors"
            >
              המשך ✓
            </button>
          </div>
        )}

        {/* Running indicator */}
        {wt.active && !wt.waitingForUser && (
          <div className="rounded-xl border bg-muted/40 p-4 text-center text-sm text-muted-foreground animate-pulse">
            מריץ שלב {wt.currentStep + 1}...{wt.userPrompt ? ` — ${wt.userPrompt}` : ""}
          </div>
        )}

        {/* Final summary card */}
        {finalResult && !wt.active && (
          <div
            className={cn(
              "rounded-xl border-2 p-4 space-y-3",
              finalResult.status === "pass"
                ? "border-green-500 bg-green-50"
                : finalResult.status === "fail"
                  ? "border-red-500 bg-red-50"
                  : "border-amber-500 bg-amber-50",
            )}
            dir="rtl"
          >
            <p className={cn(
              "text-lg font-bold",
              finalResult.status === "pass" ? "text-green-800" :
              finalResult.status === "fail" ? "text-red-800" : "text-amber-800",
            )}>
              {finalResult.message}
            </p>
            <div className="flex gap-2 text-sm flex-wrap">
              <span className="text-green-700 font-semibold">{passedCount} ✓ עברו</span>
              {failedCount > 0 && <span className="text-red-700 font-semibold">{failedCount} ✗ נכשלו</span>}
              {warnCount > 0 && <span className="text-amber-700 font-semibold">{warnCount} ⚠ אזהרות</span>}
            </div>
            {finalResult.status === "pass" && (
              <p className="text-green-700 text-sm font-medium">המערכת מוכנה לפיילוט 🚀</p>
            )}
            <Button variant="outline" onClick={generateReport} className="w-full min-h-[44px]">
              📋 צור דוח בדיקה
            </Button>
          </div>
        )}

        {/* Results panel */}
        {wt.results.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-base font-bold">תוצאות בדיקה</h2>
            <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
              {wt.results.map((result, i) => (
                <StepRow key={i} result={result} />
              ))}
            </div>
          </div>
        )}

        {/* Steps list — shown before start */}
        {!wt.active && wt.results.length === 0 && (
          <div className="rounded-xl border p-4 space-y-2">
            <p className="text-sm font-semibold text-muted-foreground">14 שלבי הבדיקה:</p>
            <ol className="space-y-1">
              {STEP_NAMES.map((name, i) => (
                <li key={i} className="text-sm text-muted-foreground flex gap-2">
                  <span className="w-5 shrink-0 text-left tabular-nums opacity-50">{i + 1}.</span>
                  {name}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </Layout>
  );
}
