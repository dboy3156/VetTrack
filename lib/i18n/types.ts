export type Locale = "en" | "he";

export type TranslationParams = Record<string, string | number | boolean>;

export interface TranslationDictionary {
  [key: string]: string | TranslationDictionary;
}

export const SUPPORTED_LOCALES: readonly Locale[] = ["en", "he"] as const;
export const DEFAULT_LOCALE: Locale = "en";
