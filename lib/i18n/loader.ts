import { readFileSync } from "fs";
import { resolve as pathResolve, dirname } from "path";
import { fileURLToPath } from "url";
import type { Locale, TranslationDictionary } from "./types.js";
import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const cache = new Map<Locale, TranslationDictionary>();
const readCounts = new Map<Locale, number>();

function isLocale(value: string): value is Locale {
  return SUPPORTED_LOCALES.includes(value as Locale);
}

export function normalizeLocale(locale?: string | null): Locale {
  const normalized = locale?.split(",")[0]?.split("-")[0]?.toLowerCase().trim() ?? "";
  if (isLocale(normalized)) return normalized;
  if (normalized) {
    console.warn(`[i18n] Invalid locale "${locale}", falling back to "${DEFAULT_LOCALE}"`);
  }
  return DEFAULT_LOCALE;
}

export function loadLocale(locale: Locale): TranslationDictionary {
  const cached = cache.get(locale);
  if (cached) return cached;

  if (!SUPPORTED_LOCALES.includes(locale)) {
    console.warn(`[i18n] Unsupported locale "${locale}", falling back to "${DEFAULT_LOCALE}"`);
    return loadLocale(DEFAULT_LOCALE);
  }

  const filePath = pathResolve(__dirname, `../../locales/${locale}.json`);
  const raw = readFileSync(filePath, "utf-8");
  const dict: TranslationDictionary = JSON.parse(raw);
  cache.set(locale, dict);
  readCounts.set(locale, (readCounts.get(locale) ?? 0) + 1);
  return dict;
}

export function getLocaleDictionaries(locale?: string | null): {
  locale: Locale;
  primary: TranslationDictionary;
  fallback: TranslationDictionary;
} {
  const normalizedLocale = normalizeLocale(locale);
  return {
    locale: normalizedLocale,
    primary: loadLocale(normalizedLocale),
    fallback: loadLocale(DEFAULT_LOCALE),
  };
}

export function getLocaleReadCount(locale: Locale): number {
  return readCounts.get(locale) ?? 0;
}

export function clearLocaleCache(): void {
  cache.clear();
  readCounts.clear();
}
