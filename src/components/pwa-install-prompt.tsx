import { useState } from "react";
import { X, Download, Share, PlusSquare } from "lucide-react";
import { usePwaInstall } from "@/hooks/use-pwa-install";

// Shows once per session for eligible users:
//   • Android/Chrome: native "Add to Home Screen" prompt
//   • iOS Safari: manual guidance (Add to Home Screen via Share sheet)
// Hidden when already running as an installed PWA.
export function PwaInstallPrompt() {
  const { isStandalone, isIos, canInstall, promptInstall, iosGuidanceDismissed, dismissIosGuidance } =
    usePwaInstall();

  // One-time session-level dismiss for the Android/Chrome banner
  const [androidDismissed, setAndroidDismissed] = useState(false);

  // Don't show anything when already installed
  if (isStandalone) return null;

  // ── Android / Chrome install banner ──────────────────────────────────────
  if (canInstall && !androidDismissed) {
    return (
      <div
        role="banner"
        aria-label="Install VetTrack"
        data-testid="pwa-install-banner"
        className="fixed bottom-0 inset-x-0 z-50 pb-safe"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0px)" }}
      >
        <div className="mx-4 mb-4 rounded-2xl border border-border bg-background/95 shadow-xl backdrop-blur-md p-4 flex items-start gap-3">
          <img
            src="/icons/icon-192.png"
            alt=""
            className="w-12 h-12 rounded-xl shrink-0"
          />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-foreground leading-snug">
              Install VetTrack
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
              Add to your home screen for faster access — even offline.
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={async () => {
                  await promptInstall();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold"
              >
                <Download className="w-3.5 h-3.5" />
                Install
              </button>
              <button
                onClick={() => setAndroidDismissed(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium"
              >
                Not now
              </button>
            </div>
          </div>
          <button
            onClick={() => setAndroidDismissed(true)}
            aria-label="Dismiss install banner"
            className="text-muted-foreground hover:text-foreground shrink-0 -mt-1 -mr-1 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // ── iOS Safari guidance ──────────────────────────────────────────────────
  if (isIos && !iosGuidanceDismissed) {
    return (
      <div
        role="banner"
        aria-label="Add VetTrack to Home Screen"
        data-testid="pwa-ios-guidance"
        className="fixed bottom-0 inset-x-0 z-50"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0px)" }}
      >
        <div className="mx-4 mb-4 rounded-2xl border border-border bg-background/95 shadow-xl backdrop-blur-md p-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <p className="font-semibold text-sm text-foreground">
              Add to Home Screen
            </p>
            <button
              onClick={dismissIosGuidance}
              aria-label="Dismiss iOS install guidance"
              className="text-muted-foreground hover:text-foreground p-1 -mt-1 -mr-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Install VetTrack for full-screen access and offline support:
          </p>
          <ol className="mt-2 space-y-1.5 text-xs text-foreground">
            <li className="flex items-center gap-2">
              <Share className="w-3.5 h-3.5 shrink-0 text-primary" />
              Tap the <strong>Share</strong> button in Safari
            </li>
            <li className="flex items-center gap-2">
              <PlusSquare className="w-3.5 h-3.5 shrink-0 text-primary" />
              Select <strong>Add to Home Screen</strong>
            </li>
          </ol>
        </div>
      </div>
    );
  }

  return null;
}
