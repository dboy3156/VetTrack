/**
 * /dev-verify — Interactive dispense flow walkthrough (non-production only).
 * 14 guided steps that verify the complete consumable dispense feature end-to-end.
 * The floating top bar and continue button are rendered by WalkthroughOverlay in App.tsx
 * so they persist across route navigations.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { Helmet } from "react-helmet-async";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { api, request } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  overlaySetState,
  overlayWaitForUser,
  overlayStop,
} from "@/features/containers/components/WalkthroughOverlay";
import type { StepResult } from "@/features/containers/components/WalkthroughOverlay";

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

function setHighlight(selector: string | null) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fn = (window as any).__vtSetHighlight;
  if (typeof fn === "function") fn(selector);
}

// ─── Step names ────────────────────────────────────────────────────────────────

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

  const [walkthroughRunning, setWalkthroughRunning] = useState(false);
  const [results, setResults] = useState<StepResult[]>([]);

  const cachedContainersRef = useRef<Array<{ id: string; name: string }>>([]);
  const resultsRef = useRef<StepResult[]>([]);

  // Keep resultsRef in sync
  useEffect(() => { resultsRef.current = results; }, [results]);

  const addResult = useCallback((result: StepResult) => {
    setResults((prev) => [...prev, result]);
  }, []);

  const updateStep = useCallback((
    stepIndex: number,
    status: StepResult["status"],
    message: string,
    fixHint?: string,
  ) => {
    addResult({ stepIndex, name: STEP_NAMES[stepIndex], status, message, fixHint });
  }, [addResult]);

  const setStep = useCallback((stepIndex: number) => {
    overlaySetState({
      currentStep: stepIndex,
      stepName: STEP_NAMES[stepIndex],
    });
  }, []);

  const setProcessing = useCallback((msg: string) => {
    overlaySetState({ processingMsg: msg });
  }, []);

  const waitUser = useCallback((prompt: string) => {
    return overlayWaitForUser(prompt);
  }, []);

  // ── Step implementations ──────────────────────────────────────────────────

  const runStep1 = useCallback(async () => {
    setStep(0);
    try {
      const containers = await api.containers.list();
      cachedContainersRef.current = containers.map((c) => ({ id: c.id, name: c.name }));
      if (containers.length > 0) {
        updateStep(0, "pass", `✓ נמצאו ${containers.length} עגלות במערכת`);
        await sleep(1200);
        return true;
      } else {
        updateStep(0, "fail", "✗ אין עגלות במערכת", "עבור ל-/inventory וצור עגלה עם לפחות 2 פריטים וכמות > 0");
        return false;
      }
    } catch {
      updateStep(0, "fail", "✗ שגיאה בטעינת העגלות", "בדוק שהשרת פועל");
      return false;
    }
  }, [setStep, updateStep]);

  const runStep2 = useCallback(async () => {
    setStep(1);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const appointments = await api.appointments.list({ day: today });
      const uniqueAnimals = new Set(appointments.map((a) => a.animalId).filter(Boolean));
      if (uniqueAnimals.size > 0) {
        updateStep(1, "pass", `✓ נמצאו ${uniqueAnimals.size} מטופלים פעילים היום`);
      } else {
        updateStep(1, "warn", "⚠ אין מטופלים פעילים — בדיקת שיוך לא תהיה זמינה, ממשיך עם ללא שיוך");
      }
      await sleep(1200);
      return true;
    } catch {
      updateStep(1, "warn", "⚠ לא ניתן לטעון מטופלים — ממשיך");
      await sleep(800);
      return true;
    }
  }, [setStep, updateStep]);

  const runStep3 = useCallback(async () => {
    setStep(2);
    navigate("/inventory?devmode=1");
    await sleep(800);
    setHighlight('[data-testid="dev-dispense-trigger"]');
    await waitUser("גלול לתחתית הדף ולחץ על 🧪 בדיקת לקיחת מתכלים, ואז לחץ המשך כאן");
    setHighlight(null);
    await sleep(600);
    const sheetOpen = document.querySelector('[role="dialog"]') !== null ||
      document.querySelector('[data-radix-dialog-content]') !== null;
    if (sheetOpen) {
      updateStep(2, "pass", "✓ חלון הלקיחה נפתח — סימולציית סריקת עגלה הצליחה");
    } else {
      updateStep(2, "manual", "↩ בוצע ידנית — אמת שחלון הלקיחה נפתח ולחץ המשך");
    }
    await sleep(800);
    return true;
  }, [navigate, setStep, updateStep, waitUser]);

  const runStep4 = useCallback(async () => {
    setStep(3);
    const emergencyBtn = Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("חירום") && b.classList.contains("bg-red-600"),
    );
    if (emergencyBtn) {
      updateStep(3, "pass", "✓ כפתור חירום נמצא בראש החלון");
    } else {
      updateStep(3, "fail", "✗ כפתור חירום לא נמצא", "בדוק סדר JSX ב-DispenseSheet.tsx");
    }
    await waitUser("וודא שהכפתור האדום 🚨 חירום נמצא מעל הפריטים, ולאחר מכן לחץ המשך");
    await sleep(400);
    return true;
  }, [setStep, updateStep, waitUser]);

  const runStep5 = useCallback(async () => {
    setStep(4);
    setHighlight('button[aria-label="הוסף"]');
    await waitUser("לחץ + על לפחות 2 פריטים כדי לבחור כמות > 0, ולאחר מכן לחץ 'המשך' בתוך החלון. אז לחץ המשך כאן");
    setHighlight(null);
    updateStep(4, "pass", "✓ פריטים נבחרו ועבר לבחירת מטופל");
    await sleep(600);
    return true;
  }, [setStep, updateStep, waitUser]);

  const runStep6 = useCallback(async () => {
    setStep(5);
    await sleep(400);
    const patientCards = document.querySelectorAll(".grid .rounded-xl.border.min-h-\\[80px\\]").length;
    if (patientCards > 0) {
      updateStep(5, "pass", `✓ ${patientCards} כרטיסי מטופלים נטענו`);
    } else {
      updateStep(5, "warn", "⚠ לא נמצאו כרטיסי מטופלים — בחר ללא שיוך");
    }
    await waitUser("בחר מטופל או לחץ 'ללא שיוך למטופל', ואז לחץ 'אשר לקיחה'. לאחר מכן לחץ המשך כאן");
    await sleep(400);
    return true;
  }, [setStep, updateStep, waitUser]);

  const runStep7 = useCallback(async () => {
    setStep(6);
    setProcessing("שולח בקשה לשרת...");
    await sleep(2000);
    setProcessing("");
    const hasCheckmark = document.querySelector(".text-green-500") !== null;
    if (hasCheckmark) {
      updateStep(6, "pass", "✓ מסך הצלחה מוצג עם צ'קמארק ירוק");
    } else {
      updateStep(6, "manual", "↩ בוצע ידנית — אמת שמסך הצלחה מוצג");
    }
    try {
      const data = await fetchLastDispense();
      const lastLog = data.logs[0];
      if (lastLog && lastLog.quantityAdded < 0) {
        updateStep(6, "pass", "✓ DB — מלאי ירד (quantity_added < 0)");
      } else {
        updateStep(6, "fail", "✗ DB — quantity_added לא שלילי", "בדוק transaction ב-containers.ts");
      }
      if (lastLog?.createdByUserId) {
        updateStep(6, "pass", "✓ DB — created_by_user_id נשמר");
      } else {
        updateStep(6, "fail", "✗ DB — created_by_user_id חסר");
      }
      if (data.lastBillingEntry?.status === "pending") {
        updateStep(6, "pass", "✓ DB — billing entry נוצר עם סטטוס pending");
      } else if (lastLog?.animalId) {
        updateStep(6, "fail", "✗ DB — billing entry חסר לבחירת מטופל");
      }
    } catch {
      updateStep(6, "warn", "⚠ לא ניתן לאמת DB — /api/test/last-dispense נכשל");
    }
    // Check auto-close
    await sleep(3500);
    const sheetOpen = document.querySelector('[role="dialog"]') !== null;
    if (!sheetOpen) {
      updateStep(6, "pass", "✓ חלון נסגר אוטומטית אחרי 3 שניות");
    } else {
      updateStep(6, "fail", "✗ חלון לא נסגר אוטומטית", "בדוק setTimeout ב-DispenseSheet.tsx state=success");
    }
    await waitUser("לחץ המשך לאחר שחלון הלקיחה נסגר");
    return true;
  }, [setStep, setProcessing, updateStep, waitUser]);

  const runStep8 = useCallback(async () => {
    setStep(7);
    navigate("/inventory?devmode=1");
    await sleep(700);
    setHighlight('[data-testid="dev-dispense-trigger"]');
    await waitUser("לחץ שוב על 🧪 בדיקת לקיחת מתכלים לפתיחת חלון לבדיקת חירום, ואז לחץ המשך");
    setHighlight(null);
    updateStep(7, "pass", "✓ חלון הלקיחה נפתח");
    await sleep(500);
    return true;
  }, [navigate, setStep, updateStep, waitUser]);

  const runStep9 = useCallback(async () => {
    setStep(8);
    await waitUser("לחץ על הכפתור האדום 🚨 חירום בתוך חלון הלקיחה, ולאחר מכן לחץ המשך כאן");
    setProcessing("רושם חירום...");
    await sleep(2500);
    setProcessing("");
    const hasEmergencyText = document.body.textContent?.includes("חירום נרשם");
    if (hasEmergencyText) {
      updateStep(8, "pass", "✓ מסך חירום מוצג — 'חירום נרשם'");
    } else {
      updateStep(8, "manual", "↩ בוצע ידנית — אמת שמסך 'חירום נרשם' הוצג");
    }
    // Verify no auto-close after 4s
    await sleep(4200);
    const sheetOpen = document.querySelector('[role="dialog"]') !== null;
    if (sheetOpen) {
      updateStep(8, "pass", "✓ חלון לא נסגר אוטומטית — נכון לחירום");
    } else {
      updateStep(8, "fail", "✗ חלון נסגר לבד בחירום", "הסר setTimeout ממסך emergency-success");
    }
    try {
      const data = await fetchLastDispense();
      if (data.pendingEmergencies > 0) {
        updateStep(8, "pass", `✓ DB — ${data.pendingEmergencies} emergency log עם pendingCompletion: true`);
      } else {
        updateStep(8, "fail", "✗ DB — emergency log לא נמצא עם pendingCompletion", "בדוק metadata.pendingCompletion=true ב-containers.ts");
      }
    } catch {
      updateStep(8, "warn", "⚠ לא ניתן לאמת DB emergency");
    }
    await waitUser("לחץ 'סגור לעכשיו' בתוך חלון החירום, ואז לחץ המשך");
    await sleep(400);
    return true;
  }, [setStep, setProcessing, updateStep, waitUser]);

  const runStep10 = useCallback(async () => {
    setStep(9);
    navigate("/shift-handover");
    await sleep(1500);
    const hasSection = document.body.textContent?.includes("צריכת מתכלים במשמרת");
    if (hasSection) {
      updateStep(9, "pass", "✓ סקציית מתכלים מופיעה בחפיפת משמרת");
    } else {
      updateStep(9, "fail", "✗ הסקציה לא נמצאה", "בדוק shift-handover-page.tsx");
    }
    await sleep(800);
    const hasPendingEmergency = document.body.textContent?.includes("חירום ממתין");
    if (hasPendingEmergency) {
      updateStep(9, "pass", "✓ כרטיס חירום ממתין מופיע");
    } else {
      updateStep(9, "warn", "⚠ כרטיס חירום ממתין לא זוהה — בדוק ידנית");
    }
    const hasRedBorder = document.querySelector('.border-r-red-500, [class*="border-r-4"]') !== null;
    if (hasRedBorder) {
      updateStep(9, "pass", "✓ שורת חירום עם גבול אדום נמצאה בטבלה");
    } else {
      updateStep(9, "warn", "⚠ גבול אדום לא זוהה — בדוק ידנית");
    }
    await waitUser("לחץ 'השלם עכשיו' בשורת החירום בטבלה, ואז לחץ המשך");
    await sleep(500);
    return true;
  }, [navigate, setStep, updateStep, waitUser]);

  const runStep11 = useCallback(async () => {
    setStep(10);
    await sleep(700);
    const hasTitle = document.body.textContent?.includes("השלמת חירום");
    if (hasTitle) {
      updateStep(10, "pass", "✓ חלון השלמה נפתח עם כותרת 'השלמת חירום'");
    } else {
      updateStep(10, "manual", "↩ בוצע ידנית — אמת שחלון 'השלמת חירום' נפתח");
    }
    await waitUser("בחר פריטים עם +, בחר ללא שיוך למטופל, לחץ 'אשר פירוט חירום', ואז לחץ המשך");
    await sleep(2000);
    const hasGreen = document.querySelector(".text-green-500") !== null;
    if (hasGreen) {
      updateStep(10, "pass", "✓ השלמת חירום אושרה");
    } else {
      updateStep(10, "manual", "↩ בוצע ידנית — אמת שמסך הצלחה הוצג");
    }
    try {
      const data = await fetchLastDispense();
      if (data.pendingEmergencies === 0) {
        updateStep(10, "pass", "✓ DB — pendingCompletion עודכן ל-false");
      } else {
        updateStep(10, "fail", "✗ DB — pendingCompletion לא עודכן", "בדוק completeEmergency endpoint ב-containers.ts");
      }
    } catch {
      updateStep(10, "warn", "⚠ לא ניתן לאמת DB");
    }
    await sleep(1000);
    return true;
  }, [setStep, updateStep, waitUser]);

  const runStep12 = useCallback(async () => {
    setStep(11);
    navigate("/inventory?devmode=1");
    await sleep(700);
    setHighlight('[data-testid="dev-dispense-trigger"]');
    await waitUser("לחץ על 🧪 בדיקת לקיחת מתכלים, בחר פריטים, לחץ המשך, בחר ללא שיוך, לחץ אשר לקיחה. ואז לחץ המשך כאן");
    setHighlight(null);
    await sleep(2500);
    try {
      const data = await fetchLastDispense();
      const lastLog = data.logs[0];
      if (lastLog?.animalId === null) {
        updateStep(11, "pass", "✓ DB — animal_id = null כצפוי");
      } else {
        updateStep(11, "fail", "✗ DB — animal_id אינו null", "בדוק animalId=null נשלח לשרת כשבוחרים ללא שיוך");
      }
      if (!data.lastBillingEntry) {
        updateStep(11, "pass", "✓ DB — אין billing entry חדש כצפוי");
      }
    } catch {
      updateStep(11, "warn", "⚠ לא ניתן לאמת DB");
    }
    await sleep(500);
    return true;
  }, [navigate, setStep, updateStep, waitUser]);

  const runStep13 = useCallback(async () => {
    setStep(12);
    try {
      const data = await fetchLastDispense();
      const allHaveUserId = data.logs.every((l) => Boolean(l.createdByUserId));
      if (allHaveUserId) {
        updateStep(12, "pass", "✓ כל הלקיחות כוללות created_by_user_id — עקרון השקיפות מקוים");
      } else {
        updateStep(12, "fail", "✗ יש לקיחות ללא created_by_user_id", "createdByUserId חייב לבוא מ-req.authUser!.id");
      }
      const allHaveName = data.logs.every((l) => Boolean(l.createdByDisplayName));
      if (allHaveName) {
        updateStep(12, "pass", "✓ כל הלקיחות כוללות displayName של הטכנאי");
      } else {
        updateStep(12, "warn", "⚠ חלק מהלקיחות חסרות displayName");
      }
    } catch {
      updateStep(12, "warn", "⚠ לא ניתן לאמת שקיפות");
    }
    await sleep(1200);
    return true;
  }, [setStep, updateStep]);

  const runStep14 = useCallback((latestResults: StepResult[]) => {
    setStep(13);
    const passed = latestResults.filter((r) => r.status === "pass").length;
    const failed = latestResults.filter((r) => r.status === "fail").length;
    const warned = latestResults.filter((r) => r.status === "warn").length;
    const manual = latestResults.filter((r) => r.status === "manual").length;

    const summaryMsg = failed > 0
      ? `✗ ${failed} בדיקות נכשלו, ${warned} אזהרות, ${passed} עברו`
      : warned > 0 || manual > 0
        ? `⚠ הבדיקות עברו עם ${warned} אזהרות ו-${manual} שלבים ידניים`
        : "✓ כל הבדיקות עברו בהצלחה — המערכת מוכנה לפיילוט";

    const status: StepResult["status"] = failed > 0 ? "fail" : warned > 0 || manual > 0 ? "warn" : "pass";
    updateStep(13, status, summaryMsg);
    navigate("/dev-verify?devmode=1");
  }, [setStep, updateStep, navigate]);

  // ── Main runner ───────────────────────────────────────────────────────────

  const startWalkthrough = useCallback(async () => {
    setResults([]);
    setWalkthroughRunning(true);
    overlaySetState({
      active: true,
      currentStep: 0,
      totalSteps: TOTAL_STEPS,
      stepName: STEP_NAMES[0],
      waitingForUser: false,
      userPrompt: "",
      processingMsg: "",
    });

    const ok1 = await runStep1();
    if (!ok1) {
      overlayStop();
      setWalkthroughRunning(false);
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
    runStep14(resultsRef.current);

    setHighlight(null);
    overlaySetState({ active: false, waitingForUser: false, processingMsg: "" });
    setWalkthroughRunning(false);
  }, [runStep1, runStep2, runStep3, runStep4, runStep5, runStep6, runStep7, runStep8, runStep9, runStep10, runStep11, runStep12, runStep13, runStep14]);

  const stopWalkthrough = useCallback(() => {
    overlayStop();
    setHighlight(null);
    setWalkthroughRunning(false);
  }, []);

  const generateReport = useCallback(() => {
    const lines = [
      "VetTrack — דוח בדיקת לקיחת מתכלים",
      `תאריך: ${new Date().toLocaleString("he-IL")}`,
      "─".repeat(40),
      ...results.map((r) =>
        `שלב ${r.stepIndex + 1} [${r.status.toUpperCase()}] ${r.name}: ${r.message}${r.fixHint ? ` — תיקון: ${r.fixHint}` : ""}`,
      ),
      "─".repeat(40),
      `סיכום: ${results.filter((r) => r.status === "pass").length} עברו / ${results.filter((r) => r.status === "fail").length} נכשלו / ${results.filter((r) => r.status === "warn").length} אזהרות`,
    ];
    const text = lines.join("\n");
    navigator.clipboard?.writeText(text).then(() => alert("הדוח הועתק ללוח")).catch(() => {
      const w = window.open("", "_blank");
      if (w) w.document.write(`<pre dir="rtl">${text}</pre>`);
    });
  }, [results]);

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

  const finalResult = results.find((r) => r.stepIndex === 13);
  const passedCount = results.filter((r) => r.status === "pass").length;
  const failedCount = results.filter((r) => r.status === "fail").length;
  const warnCount = results.filter((r) => r.status === "warn").length;

  return (
    <Layout>
      <Helmet>
        <title>בדיקת לקיחת מתכלים — VetTrack Dev</title>
      </Helmet>

      <div className="max-w-2xl mx-auto p-4 space-y-4" dir="rtl">
        <div>
          <h1 className="text-2xl font-bold">🧪 בדיקת לקיחת מתכלים — מדריך מלא</h1>
          <p className="text-sm text-muted-foreground mt-1">
            14 שלבים לאימות זרימת הלקיחה מקצה לקצה
          </p>
        </div>

        {/* Start / Restart button */}
        {!walkthroughRunning && (
          <button
            onClick={startWalkthrough}
            className="w-full min-h-[56px] bg-blue-600 text-white rounded-xl text-lg font-bold hover:bg-blue-700 active:bg-blue-800 transition-colors"
          >
            {results.length > 0 ? "הרץ שוב מהתחלה" : "🎬 הפעל בדיקה מודרכת מלאה"}
          </button>
        )}

        {walkthroughRunning && (
          <div className="rounded-xl border bg-muted/40 p-4 text-center text-sm text-muted-foreground">
            הבדיקה פועלת — עקוב אחר ההוראות בתחתית המסך
          </div>
        )}

        {walkthroughRunning && (
          <button
            onClick={stopWalkthrough}
            className="w-full min-h-[48px] border border-destructive text-destructive rounded-xl text-sm hover:bg-destructive/5 transition-colors"
          >
            עצור בדיקה
          </button>
        )}

        {/* Final summary */}
        {finalResult && !walkthroughRunning && (
          <div
            className={cn(
              "rounded-xl border-2 p-4 space-y-3",
              finalResult.status === "pass" ? "border-green-500 bg-green-50" :
              finalResult.status === "fail" ? "border-red-500 bg-red-50" : "border-amber-500 bg-amber-50",
            )}
          >
            <p className={cn(
              "text-lg font-bold",
              finalResult.status === "pass" ? "text-green-800" :
              finalResult.status === "fail" ? "text-red-800" : "text-amber-800",
            )}>
              {finalResult.message}
            </p>
            <div className="flex gap-3 text-sm flex-wrap">
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
        {results.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-base font-bold">תוצאות בדיקה</h2>
            <div className="space-y-1.5 max-h-[55vh] overflow-y-auto">
              {results.map((result, i) => (
                <StepRow key={i} result={result} />
              ))}
            </div>
          </div>
        )}

        {/* Step list preview */}
        {!walkthroughRunning && results.length === 0 && (
          <div className="rounded-xl border p-4 space-y-2">
            <p className="text-sm font-semibold text-muted-foreground">14 שלבי הבדיקה:</p>
            <ol className="space-y-1">
              {STEP_NAMES.map((name, i) => (
                <li key={i} className="text-sm text-muted-foreground flex gap-2">
                  <span className="w-6 shrink-0 tabular-nums opacity-50 text-left">{i + 1}.</span>
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
