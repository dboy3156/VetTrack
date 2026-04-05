import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Moon, Bell, Shield, Trash2 } from "lucide-react";

function SettingItem({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: any;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-start gap-3">
        <div className="mt-1 text-muted-foreground">
          <Icon className="w-4 h-4" />
        </div>

        <div>
          <div className="text-sm font-medium">{title}</div>
          {description && (
            <div className="text-xs text-muted-foreground">
              {description}
            </div>
          )}
        </div>
      </div>

      <div>{children}</div>
    </div>
  );
}

export default function Settings() {
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");
  const [notifications, setNotifications] = useState(true);
  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved) {
      setTheme(saved as any);
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;

    if (theme === "dark") {
      root.classList.add("dark");
    } else if (theme === "light") {
      root.classList.remove("dark");
    } else {
      const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      if (isDark) {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    }

    localStorage.setItem("theme", theme);
  }, [theme]);
  
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your preferences and system configuration
        </p>
      </div>

      {/* Appearance */}
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-5">

          <div className="mb-4 text-xs font-semibold text-muted-foreground uppercase">
            Appearance
          </div>

          <SettingItem
            icon={Moon}
            title="Dark Mode"
            description="Toggle between light and dark theme"
          >
            <div className="flex gap-2">
              {["light", "dark", "system"].map((mode) => (
                <button
                  key={mode}
                  onClick={() => setTheme(mode as any)}
                  className={`px-3 py-1 rounded-lg text-xs border ${
                    theme === mode
                      ? "bg-primary text-white"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </SettingItem>

        </CardContent>
      </Card>

      {/* Notifications */}
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-5">

          <div className="mb-4 text-xs font-semibold text-muted-foreground uppercase">
            Notifications
          </div>

          <SettingItem
            icon={Bell}
            title="Email Alerts"
            description="Receive notifications about equipment issues"
          >
            <Switch
              checked={notifications}
              onCheckedChange={setNotifications}
            />
          </SettingItem>

        </CardContent>
      </Card>

      {/* Security */}
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-5">

          <div className="mb-4 text-xs font-semibold text-muted-foreground uppercase">
            Security
          </div>

          <SettingItem
            icon={Shield}
            title="Change Password"
            description="Update your account credentials"
          >
            <Button variant="outline" size="sm">
              Change
            </Button>
          </SettingItem>

        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="rounded-2xl border-red-200 shadow-sm">
        <CardContent className="p-5">

          <div className="mb-4 text-xs font-semibold text-red-600 uppercase">
            Danger Zone
          </div>

          <SettingItem
            icon={Trash2}
            title="Reset System"
            description="This action cannot be undone"
          >
            <Button variant="destructive" size="sm">
              Reset
            </Button>
          </SettingItem>

        </CardContent>
      </Card>

    </div>
  );
}