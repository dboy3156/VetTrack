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
import { Slider } from "@/components/ui/slider";
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
  SunDim,
  Send,
} from "lucide-react";
import { useLocation } from "wouter";
import { playFeedbackTone, playMuteTone } from "@/lib/sounds";
import { toast } from "sonner";

export default function SettingsPage() {
  const { settings, update, reset } = useSettings();
  const { name, email } = useAuth();
  const [, navigate] = useLocation();
  const push = usePushNotifications();

  const handleLogout = () => {
    const keysToRemove = Object.keys(localStorage).filter((k) =>
      k.startsWith("vettrack")
    );
    keysToRemove.forEach((k) => localStorage.removeItem(k));
    navigate("/landing");
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
    <Layout title="Settings">
      <div className="space-y-6 pb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">Customize your VetTrack experience</p>
        </div>

        {/* Display */}
        <section className="space-y-2">
          <SettingsSectionHeader label="Display" />
          <div className="space-y-2">
            <SettingsToggle
              icon={settings.darkMode ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
              label="Dark Mode"
              description="Reduce eye strain in low light"
              checked={settings.darkMode}
              onCheckedChange={(v) => update({ darkMode: v })}
              data-testid="settings-dark-mode"
            />
            <SettingsSelect
              icon={<AlignJustify className="w-5 h-5" />}
              label="Display Size"
              description="Adjust spacing and layout density"
              value={settings.density}
              options={[
                { value: "comfortable", label: "Comfortable" },
                { value: "compact", label: "Compact" },
              ]}
              onValueChange={(v) => update({ density: v as "comfortable" | "compact" })}
              data-testid="settings-density"
            />
            <div className="flex items-center gap-4 px-4 py-3.5 rounded-xl bg-muted/40">
              <span className="flex-shrink-0 text-muted-foreground">
                <SunDim className="w-5 h-5" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground leading-tight">Brightness</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Dim or brighten the app ({settings.brightness}%)
                </p>
                <div className="mt-2 pr-1">
                  <Slider
                    min={30}
                    max={100}
                    step={5}
                    value={[settings.brightness]}
                    onValueChange={([v]) => update({ brightness: v })}
                    data-testid="settings-brightness"
                    className="w-full"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Push Notifications */}
        {push.supported && (
          <section className="space-y-2">
            <SettingsSectionHeader label="Push Notifications" />
            <div className="space-y-2">
              <div className="flex items-center gap-4 px-4 py-3.5 rounded-xl bg-muted/40">
                <span className="flex-shrink-0 text-muted-foreground">
                  {push.subscribed ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground leading-tight">Device Notifications</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {push.permission === "denied"
                      ? "Permission denied — enable in browser settings"
                      : push.subscribed
                      ? "This device will receive alerts even when the app is closed"
                      : "Receive alerts on this device, even when the app is closed"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={push.subscribed ? "outline" : "default"}
                  disabled={push.loading || push.permission === "denied"}
                  data-testid="push-toggle-btn"
                  onClick={async () => {
                    if (push.subscribed) {
                      const ok = await push.unsubscribe();
                      if (ok) toast.success("Push notifications disabled");
                      else toast.error(push.error || "Failed to disable");
                    } else {
                      const ok = await push.subscribe({
                        soundEnabled: settings.soundEnabled,
                        alertsEnabled: settings.criticalAlertsSound,
                      });
                      if (ok) toast.success("Push notifications enabled");
                      else if (push.permission === "denied") toast.error("Permission denied");
                      else toast.error(push.error || "Failed to enable");
                    }
                  }}
                >
                  {push.subscribed ? "Disable" : "Enable"}
                </Button>
              </div>
              {push.subscribed && (
                <div className="flex items-center gap-4 px-4 py-3.5 rounded-xl bg-muted/40">
                  <span className="flex-shrink-0 text-muted-foreground">
                    <Send className="w-5 h-5" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground leading-tight">Test Notification</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Send a test push to verify it's working</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={push.loading}
                    data-testid="push-test-btn"
                    onClick={async () => {
                      const ok = await push.sendTestNotification();
                      if (ok) toast.success("Test notification sent");
                      else toast.error(push.error || "Failed to send test");
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
          <SettingsSectionHeader label="Sound" />
          <div className="space-y-2">
            <SettingsToggle
              icon={settings.soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
              label="Master Sound"
              description="Enable or disable all sounds"
              checked={settings.soundEnabled}
              onCheckedChange={handleSoundToggle}
              data-testid="settings-sound"
            />
            <SettingsToggle
              icon={<BellRing className="w-5 h-5" />}
              label="Critical Alerts"
              description="Play audio for urgent equipment alerts"
              checked={settings.criticalAlertsSound}
              onCheckedChange={handleCriticalAlertsToggle}
              data-testid="settings-critical-sound"
            />
          </div>
        </section>

        {/* Date & Time */}
        <section className="space-y-2">
          <SettingsSectionHeader label="Date & Time" />
          <div className="space-y-2">
            <SettingsSelect
              icon={<Clock className="w-5 h-5" />}
              label="Time Format"
              description="How times are displayed"
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
              label="Date Format"
              description="How dates are displayed"
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
          <SettingsSectionHeader label="Reset" />
          <div className="rounded-xl bg-muted/40 px-4 py-4">
            <p className="text-sm text-foreground font-medium mb-1">Reset to Defaults</p>
            <p className="text-xs text-muted-foreground mb-3">
              Restore all settings to their original values. This cannot be undone.
            </p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2" data-testid="settings-reset-btn">
                  <RotateCcw className="w-4 h-4" />
                  Reset to Defaults
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset all settings?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will restore all settings to their default values, including dark mode, sound, and display preferences. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
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
          <SettingsSectionHeader label="Account" />
          <div className="rounded-xl bg-muted/40 px-4 py-4 space-y-3">
            {(name || email) && (
              <div>
                {name && <p className="text-sm font-medium text-foreground">{name}</p>}
                {email && <p className="text-xs text-muted-foreground">{email}</p>}
              </div>
            )}
            <Button
              variant="destructive"
              className="gap-2 w-full sm:w-auto"
              onClick={handleLogout}
              data-testid="settings-logout"
            >
              <LogOut className="w-4 h-4" />
              Log Out
            </Button>
          </div>
        </section>
      </div>
    </Layout>
  );
}
