import { useState } from "react";
import { Layout } from "@/components/layout";
import { SettingsSectionHeader, SettingsToggle, SettingsSelect } from "@/components/settings-controls";
import { useSettings } from "@/hooks/use-settings";
import { useAuth } from "@/hooks/use-auth";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Moon,
  Volume2,
  VolumeX,
  BellRing,
  Bell,
  BellOff,
  Clock,
  Calendar,
  RotateCcw,
  LogOut,
  Sun,
  AlignJustify,
  Send,
} from "lucide-react";
import { playFeedbackTone, playMuteTone } from "@/lib/sounds";
import { toast } from "sonner";

export default function SettingsPage() {
  const { settings, update, reset } = useSettings();
  const { name, email, signOut } = useAuth();
  const push = usePushNotifications();

  const handleLogout = async () => {
    await signOut();
  };

  const handleSoundToggle = async (v: boolean) => {
    if (v) {
      await playFeedbackTone();
    } else {
      await playMuteTone();
    }
    update({ soundEnabled: v });
    if (push.subscribed) {
      push.updateSettings({ soundEnabled: v }).catch(() => {});
    }
  };

  const handleCriticalAlertsToggle = async (v: boolean) => {
    if (settings.soundEnabled) {
      if (v) {
        await playFeedbackTone();
      } else {
        await playMuteTone();
      }
    }
    update({ criticalAlertsSound: v });
    if (push.subscribed) {
      push.updateSettings({ alertsEnabled: v }).catch(() => {});
    }
  };

  return (
    <Layout title="הגדרות">
      <div className="space-y-6 pb-8 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground">הגדרות</h1>
          <p className="text-sm text-muted-foreground mt-1">התאם אישית את חווית השימוש ב-VetTrack</p>
        </div>

        {/* Display */}
        <section className="space-y-2">
          <SettingsSectionHeader label="תצוגה" />
          <div className="space-y-2">
            <SettingsToggle
              icon={settings.darkMode ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
              label="מצב לילה"
              description="מפחית עומס על העיניים בתאורה חלשה"
              checked={settings.darkMode}
              onCheckedChange={(v) => update({ darkMode: v })}
              data-testid="settings-dark-mode"
            />
            <SettingsSelect
              icon={<AlignJustify className="w-5 h-5" />}
              label="גודל תצוגה"
              description="כוונון הרווחים וצפיפות הפריסה"
              value={settings.density}
              options={[
                { value: "comfortable", label: "רגיל" },
                { value: "compact", label: "קומפקטי" },
              ]}
              onValueChange={(v) => update({ density: v as "comfortable" | "compact" })}
              data-testid="settings-density"
            />
          </div>
        </section>

        {/* Push Notifications */}
        {push.supported && (
          <section className="space-y-2">
            <SettingsSectionHeader label="התראות Push" />
            <div className="space-y-2">
              <div className="flex items-center gap-4 px-4 py-3.5 rounded-xl bg-card border border-border/60">
                <span className="flex-shrink-0 text-muted-foreground">
                  {push.subscribed ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground leading-tight">התראות במכשיר</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {push.permission === "denied"
                      ? "הרשאה נדחתה — אפשר בהגדרות הדפדפן"
                      : push.subscribed
                      ? "מכשיר זה יקבל התראות גם כשהאפליקציה סגורה"
                      : "קבל התראות במכשיר זה, גם כשהאפליקציה סגורה"}
                  </p>
                </div>
                <Button
                  size="sm"
                  className="h-11 text-xs"
                  variant={push.subscribed ? "outline" : "default"}
                  disabled={push.loading || push.permission === "denied"}
                  data-testid="push-toggle-btn"
                  onClick={async () => {
                    if (push.subscribed) {
                      const ok = await push.unsubscribe();
                      if (ok) toast.success("התראות Push כובו");
                      else toast.error(push.error || "הכיבוי נכשל");
                    } else {
                      const ok = await push.subscribe({
                        soundEnabled: settings.soundEnabled,
                        alertsEnabled: settings.criticalAlertsSound,
                      });
                      if (ok) toast.success("התראות Push הופעלו");
                      else if (push.permission === "denied") toast.error("הרשאה נדחתה");
                      else toast.error(push.error || "ההפעלה נכשלה");
                    }
                  }}
                >
                  {push.subscribed ? "כבה" : "הפעל"}
                </Button>
              </div>
              {push.subscribed && (
                <div className="flex items-center gap-4 px-4 py-3.5 rounded-xl bg-card border border-border/60">
                  <span className="flex-shrink-0 text-muted-foreground">
                    <Send className="w-5 h-5" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground leading-tight">בדיקת התראות</p>
                    <p className="text-xs text-muted-foreground mt-0.5">שלח התראת ניסיון כדי לוודא תקינות</p>
                  </div>
                  <Button
                    size="sm"
                    className="h-11 text-xs"
                    variant="outline"
                    disabled={push.loading}
                    data-testid="push-test-btn"
                    onClick={async () => {
                      const ok = await push.sendTestNotification();
                      if (ok) toast.success("התראת בדיקה נשלחה");
                      else toast.error(push.error || "שליחת הבדיקה נכשלה");
                    }}
                  >
                    Send Test
                  </Button>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Sound */}
        <section className="space-y-2">
          <SettingsSectionHeader label="שמע" />
          <div className="space-y-2">
            <SettingsToggle
              icon={settings.soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
              label="שמע ראשי"
              description="הפעל או כבה את כל הצלילים"
              checked={settings.soundEnabled}
              onCheckedChange={handleSoundToggle}
              data-testid="settings-sound"
            />
            <SettingsToggle
              icon={<BellRing className="w-5 h-5" />}
              label="התראות קריטיות"
              description="הפעל שמע להתראות ציוד דחופות"
              checked={settings.criticalAlertsSound}
              onCheckedChange={handleCriticalAlertsToggle}
              data-testid="settings-critical-sound"
            />
          </div>
        </section>

        {/* Date & Time */}
        <section className="space-y-2">
          <SettingsSectionHeader label="תאריך ושעה" />
          <div className="space-y-2">
            <SettingsSelect
              icon={<Clock className="w-5 h-5" />}
              label="פורמט שעה"
              description="איך השעות מוצגות"
              value={settings.timeFormat}
              options={[
                { value: "12h", label: "12-hour (AM/PM)" },
                { value: "24h", label: "24-hour" },
              ]}
              onValueChange={(v) => update({ timeFormat: v as "12h" | "24h" })}
              data-testid="settings-time-format"
            />
            <SettingsSelect
              icon={<Calendar className="w-5 h-5" />}
              label="פורמט תאריך"
              description="איך התאריכים מוצגים"
              value={settings.dateFormat}
              options={[
                { value: "MM/DD/YYYY", label: "MM/DD/YYYY" },
                { value: "DD/MM/YYYY", label: "DD/MM/YYYY" },
                { value: "YYYY-MM-DD", label: "YYYY-MM-DD" },
              ]}
              onValueChange={(v) => update({ dateFormat: v as "MM/DD/YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD" })}
              data-testid="settings-date-format"
            />
          </div>
        </section>

        {/* Reset */}
        <section className="space-y-2">
          <SettingsSectionHeader label="איפוס" />
          <div className="rounded-xl bg-card border border-border/60 px-4 py-4">
            <p className="text-sm text-foreground font-medium mb-1">שחזר לברירת מחדל</p>
            <p className="text-xs text-muted-foreground mb-3">
              שחזור כל ההגדרות לערכי ברירת המחדל. לא ניתן לבטל פעולה זו.
            </p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 border-border/60 h-11 text-xs" data-testid="settings-reset-btn">
                  <RotateCcw className="w-4 h-4" />
                  שחזר לברירת מחדל
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>לאפס את כל ההגדרות?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will restore all settings to their default values, including dark mode, sound, and display preferences. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>ביטול</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={reset}
                    className="bg-destructive hover:bg-destructive/90"
                    data-testid="settings-reset-confirm"
                  >
                    Reset
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </section>

        {/* Account */}
        <section className="space-y-2">
          <SettingsSectionHeader label="חשבון" />
          <div className="rounded-xl bg-card border border-border/60 px-4 py-4 space-y-3">
            {(name || email) && (
              <div>
                {name && <p className="text-sm font-medium text-foreground">{name}</p>}
                {email && <p className="text-xs text-muted-foreground">{email}</p>}
              </div>
            )}
            <Button
              variant="outline"
              className="gap-2 w-full sm:w-auto border-border/60 text-muted-foreground hover:text-foreground"
              onClick={handleLogout}
              data-testid="settings-logout"
            >
              <LogOut className="w-4 h-4" />
              התנתק
            </Button>
          </div>
        </section>

        {/* About */}
        <section className="space-y-2">
          <SettingsSectionHeader label="אודות" />
          <div className="rounded-xl bg-card border border-border/60 px-4 py-4 space-y-1">
            <p className="text-sm font-medium text-foreground">VetTrack</p>
            <p className="text-xs text-muted-foreground">
              Version <span data-testid="app-version">{__APP_VERSION__}</span>
            </p>
            <a
              href="/CHANGELOG.md"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary underline-offset-2 hover:underline"
              data-testid="changelog-link"
            >
              See what&apos;s new
            </a>
          </div>
        </section>
      </div>
    </Layout>
  );
}
