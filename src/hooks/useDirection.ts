// src/hooks/useDirection.ts
import { useSettings } from "@/hooks/use-settings";
import { getDirection } from "@/lib/i18n";

/**
 * Returns "rtl" when the app locale is Hebrew, "ltr" otherwise.
 * Use this to drive dir= attributes and conditional border-s / border-e classes.
 */
export function useDirection(): "rtl" | "ltr" {
  const { settings } = useSettings();
  return getDirection(settings.locale);
}
