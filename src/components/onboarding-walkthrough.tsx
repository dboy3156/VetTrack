import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { QrCode, LogIn, AlertTriangle, ChevronRight, X } from "lucide-react";

const ONBOARDING_KEY = "vettrack_onboarding_v1";

const STEPS = [
  {
    icon: QrCode,
    iconBg: "bg-teal-50",
    iconColor: "text-teal-600",
    title: "Scan QR codes",
    description: "Tap the Scan button or use any QR scanner to instantly identify and log equipment status.",
  },
  {
    icon: LogIn,
    iconBg: "bg-blue-50",
    iconColor: "text-blue-600",
    title: "Check out equipment",
    description: "Claim ownership of equipment you're using so your team always knows where it is.",
  },
  {
    icon: AlertTriangle,
    iconBg: "bg-red-50",
    iconColor: "text-red-600",
    title: "Report issues fast",
    description: "Spotted a problem? Flag it immediately so the right person gets notified.",
  },
];

interface OnboardingWalkthroughProps {
  show: boolean;
}

export function OnboardingWalkthrough({ show }: OnboardingWalkthroughProps) {
  const [step, setStep] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem(ONBOARDING_KEY)) {
      setDismissed(true);
    }
  }, []);

  function dismiss() {
    localStorage.setItem(ONBOARDING_KEY, "1");
    setDismissed(true);
  }

  function next() {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      dismiss();
    }
  }

  if (!show || dismissed) return null;

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-teal-50/50" data-testid="onboarding-walkthrough">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex gap-1">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? "w-6 bg-primary" : "w-2 bg-primary/20"
                }`}
              />
            ))}
          </div>
          <button
            onClick={dismiss}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Dismiss walkthrough"
            data-testid="btn-onboarding-dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-xl ${current.iconBg} flex items-center justify-center shrink-0`}>
            <Icon className={`w-5 h-5 ${current.iconColor}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm leading-tight">{current.title}</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{current.description}</p>
          </div>
        </div>

        <div className="flex items-center justify-between mt-4">
          <span className="text-xs text-muted-foreground">{step + 1} of {STEPS.length}</span>
          <Button
            size="sm"
            className="gap-1.5 h-8"
            onClick={next}
            data-testid="btn-onboarding-next"
          >
            {isLast ? "Got it!" : "Next"}
            {!isLast && <ChevronRight className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
