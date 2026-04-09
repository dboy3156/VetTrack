import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { QrCode, LogIn, AlertTriangle, ChevronRight, X } from "lucide-react";

const ONBOARDING_KEY = "vettrack_onboarding_v1";

const STEPS = [
  {
    icon: QrCode,
    iconBg: "bg-blue-50 dark:bg-blue-950/50",
    iconColor: "text-blue-600 dark:text-blue-400",
    tag: "Step 1 of 3",
    title: "Scan your first item",
    description:
      "Tap the blue Scan button at the bottom of the screen to read any equipment QR code. The app instantly loads that item's status and history.",
    tip: "The Scan button is always visible in the centre of the bottom bar — you can scan from any screen.",
  },
  {
    icon: LogIn,
    iconBg: "bg-indigo-50 dark:bg-indigo-950/50",
    iconColor: "text-indigo-600 dark:text-indigo-400",
    tag: "Step 2 of 3",
    title: "Track your equipment",
    description:
      "Open any item and tap 'Check Out' to claim it while you're using it. Tap 'Return' when you're done so the team always knows where things are.",
    tip: "Your checked-out items appear in the 'Mine' tab on the bottom navigation.",
  },
  {
    icon: AlertTriangle,
    iconBg: "bg-red-50 dark:bg-red-950/50",
    iconColor: "text-red-600 dark:text-red-400",
    tag: "Step 3 of 3",
    title: "Report issues instantly",
    description:
      "Spotted faulty or broken equipment? Tap 'Report Issue' on the item detail page. Your team gets notified immediately so nothing is missed.",
    tip: "You can also report issues from the menu icon at the top right of any screen.",
  },
];

export function OnboardingWalkthrough() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!localStorage.getItem(ONBOARDING_KEY)) {
      setVisible(true);
    }
  }, []);

  function dismiss() {
    localStorage.setItem(ONBOARDING_KEY, "1");
    setVisible(false);
  }

  function next() {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      dismiss();
    }
  }

  if (!visible) return null;

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      data-testid="onboarding-overlay"
    >
      <div
        className="w-full max-w-sm bg-card rounded-2xl shadow-2xl border border-border overflow-hidden"
        style={{ animation: "fadeIn 0.2s ease" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Progress dots + close */}
        <div className="flex items-center justify-between px-5 pt-5 pb-0">
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === step
                    ? "w-6 bg-primary"
                    : i < step
                    ? "w-3 bg-primary/40"
                    : "w-3 bg-muted-foreground/20"
                }`}
                aria-label={`Go to step ${i + 1}`}
              />
            ))}
          </div>
          <button
            onClick={dismiss}
            className="w-11 h-11 flex items-center justify-center -mr-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            aria-label="Skip walkthrough"
            data-testid="btn-onboarding-dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step body */}
        <div className="px-5 pt-4 pb-3">
          <div
            className={`w-14 h-14 rounded-2xl ${current.iconBg} flex items-center justify-center mb-4`}
          >
            <Icon className={`w-7 h-7 ${current.iconColor}`} />
          </div>
          <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground mb-1">
            {current.tag}
          </p>
          <h2 className="text-lg font-bold text-foreground leading-snug mb-2">
            {current.title}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {current.description}
          </p>
        </div>

        {/* Tip callout */}
        <div className="mx-5 mb-4 rounded-xl bg-muted/60 border border-border px-3 py-2.5">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            <span className="font-semibold text-foreground">Tip: </span>
            {current.tip}
          </p>
        </div>

        {/* Actions */}
        <div className="px-5 pb-6 flex items-center justify-between gap-3">
          <button
            onClick={dismiss}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors py-2 min-h-[44px] px-1"
            data-testid="btn-onboarding-skip"
          >
            Skip
          </button>
          <Button
            className="gap-1.5 h-11 px-5"
            onClick={next}
            data-testid="btn-onboarding-next"
          >
            {isLast ? "Got it!" : "Next"}
            {!isLast && <ChevronRight className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
