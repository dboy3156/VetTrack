import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";

export type Density = "compact" | "comfortable";
export type Language = "en" | "es" | "fr" | "de";
export type TimeFormat = "12h" | "24h";
export type DateFormat = "MM/DD/YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD";

export interface Settings {
  darkMode: boolean;
  density: Density;
  soundEnabled: boolean;
  criticalAlertsSound: boolean;
  language: Language;
  timeFormat: TimeFormat;
  dateFormat: DateFormat;
}

const STORAGE_KEY = "vettrack-settings";

const DEFAULT_SETTINGS: Settings = {
  darkMode: false,
  density: "comfortable",
  soundEnabled: true,
  criticalAlertsSound: true,
  language: "en",
  timeFormat: "12h",
  dateFormat: "MM/DD/YYYY",
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore storage errors
  }
}

function applySettings(settings: Settings) {
  const html = document.documentElement;
  if (settings.darkMode) {
    html.classList.add("dark");
  } else {
    html.classList.remove("dark");
  }
  html.setAttribute("data-density", settings.density);
}

interface SettingsContextType {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  reset: () => void;
}

const SettingsContext = createContext<SettingsContextType>({
  settings: DEFAULT_SETTINGS,
  update: () => {},
  reset: () => {},
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => {
    const loaded = loadSettings();
    applySettings(loaded);
    return loaded;
  });

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      applySettings(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    saveSettings(DEFAULT_SETTINGS);
    applySettings(DEFAULT_SETTINGS);
    setSettings(DEFAULT_SETTINGS);
  }, []);

  useEffect(() => {
    applySettings(settings);
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, update, reset }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
