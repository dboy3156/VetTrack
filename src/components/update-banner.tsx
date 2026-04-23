import { useEffect, useState } from "react";
import { X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { t } from "@/lib/i18n";
import { authFetch } from "@/lib/auth-fetch";
import { safeStorageGetItem, safeStorageSetItem } from "@/lib/safe-browser";

const STORAGE_KEY = "vettrack-last-seen-version";

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function UpdateBanner() {
  const { isSignedIn, userId } = useAuth();
  const [bannerVersion, setBannerVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!isSignedIn || !userId) return;
    authFetch("/api/version")
      .then((r) => r.json())
      .then((data: { version: string }) => {
        const serverVersion = data.version;
        const lastSeen = safeStorageGetItem(STORAGE_KEY);
        if (!lastSeen || compareVersions(serverVersion, lastSeen) > 0) {
          setBannerVersion(serverVersion);
        }
      })
      .catch(() => {});
  }, [isSignedIn, userId]);

  const dismiss = () => {
    if (bannerVersion) {
      safeStorageSetItem(STORAGE_KEY, bannerVersion);
    }
    setBannerVersion(null);
  };

  if (!bannerVersion) return null;

  return (
    <div
      className="w-full flex items-center justify-between gap-3 px-4 py-2 bg-primary text-primary-foreground border-b border-primary/80"
      data-testid="update-banner"
      role="status"
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <Sparkles className="w-4 h-4 flex-shrink-0" />
        <span>
          {t.updateBanner.newVersion(bannerVersion)}
          <Link
            href="/whats-new"
            className="underline underline-offset-2 hover:opacity-80"
            data-testid="update-banner-link"
          >
            {t.updateBanner.seeWhatsNew}
          </Link>
        </span>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0 text-primary-foreground hover:bg-primary-foreground/20 hover:text-primary-foreground"
        onClick={dismiss}
        aria-label={t.updateBanner.dismissAria}
        data-testid="update-banner-dismiss"
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}
