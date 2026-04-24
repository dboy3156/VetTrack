/**
 * Global walkthrough overlay — rendered at app root level so it persists
 * across route changes. The walkthrough logic lives here; dev-verify.tsx
 * just starts/stops it via the exported store functions.
 */
import { useState, useCallback, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type StepStatus = "pending" | "running" | "pass" | "fail" | "warn" | "manual";

export interface StepResult {
  stepIndex: number;
  name: string;
  status: StepStatus;
  message: string;
  fixHint?: string;
}

interface OverlayState {
  active: boolean;
  currentStep: number;
  totalSteps: number;
  stepName: string;
  waitingForUser: boolean;
  userPrompt: string;
  processingMsg: string;
}

// ─── Global singleton ─────────────────────────────────────────────────────────

let _setOverlay: ((state: Partial<OverlayState>) => void) | null = null;
let _continueResolve: (() => void) | null = null;

export function overlaySetState(state: Partial<OverlayState>) {
  _setOverlay?.(state);
}

export function overlayWaitForUser(prompt: string): Promise<void> {
  return new Promise<void>((resolve) => {
    _continueResolve = resolve;
    _setOverlay?.({ waitingForUser: true, userPrompt: prompt });
  });
}

export function overlayContinue() {
  const resolve = _continueResolve;
  if (resolve) {
    _continueResolve = null;
    _setOverlay?.({ waitingForUser: false, userPrompt: "" });
    resolve();
  }
}

export function overlayStop() {
  _continueResolve?.();
  _continueResolve = null;
  _setOverlay?.({
    active: false,
    waitingForUser: false,
    userPrompt: "",
    processingMsg: "",
  });
}

// ─── Highlight ring ────────────────────────────────────────────────────────────

function HighlightRing({ selector }: { selector: string | null }) {
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  useEffect(() => {
    if (!selector) { setRect(null); return; }
    const update = () => {
      const el = document.querySelector(selector);
      if (!el) { setRect(null); return; }
      const r = el.getBoundingClientRect();
      setRect({
        top: r.top + window.scrollY,
        left: r.left + window.scrollX,
        width: r.width,
        height: r.height,
      });
    };
    update();
    const timer = setInterval(update, 400);
    return () => clearInterval(timer);
  }, [selector]);

  if (!rect) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none z-[88] ring-4 ring-blue-500 animate-pulse rounded-xl"
      style={{
        position: "absolute",
        top: rect.top - 6,
        left: rect.left - 6,
        width: rect.width + 12,
        height: rect.height + 12,
      }}
    />
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WalkthroughOverlay() {
  const [state, setState] = useState<OverlayState>({
    active: false,
    currentStep: 0,
    totalSteps: 14,
    stepName: "",
    waitingForUser: false,
    userPrompt: "",
    processingMsg: "",
  });
  const [highlightSelector, setHighlightSelector] = useState<string | null>(null);

  // Register the setter in the singleton
  useEffect(() => {
    _setOverlay = (partial) => setState((prev) => ({ ...prev, ...partial }));
    return () => { _setOverlay = null; };
  }, []);

  // Expose highlight setter globally
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__vtSetHighlight = setHighlightSelector;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return () => { delete (window as any).__vtSetHighlight; };
  }, []);

  if (!state.active) return null;

  const progress = ((state.currentStep + 1) / state.totalSteps) * 100;

  return (
    <>
      {/* Absolute highlight layer */}
      <div className="pointer-events-none fixed inset-0 z-[88]" aria-hidden>
        <HighlightRing selector={highlightSelector} />
      </div>

      {/* Top progress bar */}
      <div
        className="fixed top-0 left-0 right-0 z-[100] bg-gray-900 text-white px-4 py-2 flex items-center gap-3"
        dir="rtl"
      >
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-xs font-bold text-red-400">● בודק</span>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate">{state.stepName || "..."}</p>
          <div className="h-1 bg-gray-700 rounded-full mt-1 overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-700"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-2 text-xs text-gray-400">
          <span>שלב {state.currentStep + 1} מתוך {state.totalSteps}</span>
          <button
            onClick={overlayStop}
            className="text-gray-300 hover:text-white ml-1 text-sm"
          >
            עצור ✕
          </button>
        </div>
      </div>

      {/* Floating continue button — bottom center, above nav bar */}
      {state.waitingForUser && (
        <div
          className="fixed bottom-24 left-0 right-0 z-[101] flex justify-center px-4"
          dir="rtl"
        >
          <div className="w-full max-w-sm bg-blue-600 rounded-2xl shadow-2xl p-3 space-y-2">
            <p className="text-white text-sm font-semibold text-center leading-snug">
              {state.userPrompt}
            </p>
            <button
              onClick={overlayContinue}
              className="w-full min-h-[52px] bg-white text-blue-700 rounded-xl font-bold text-base hover:bg-blue-50 active:bg-blue-100 transition-colors"
            >
              המשך ✓
            </button>
          </div>
        </div>
      )}

      {/* Processing message */}
      {!state.waitingForUser && state.processingMsg && (
        <div
          className="fixed bottom-24 left-0 right-0 z-[101] flex justify-center px-4 pointer-events-none"
          dir="rtl"
        >
          <div className="bg-gray-900/90 text-white rounded-2xl shadow-2xl px-4 py-3 text-sm font-semibold animate-pulse">
            {state.processingMsg}
          </div>
        </div>
      )}
    </>
  );
}
