import type { TranslationDictionary, TranslationParams } from "./types.js";

const PLACEHOLDER_RE = /\{(\w+)(?:,\s*(plural|select),\s*((?:[^{}]|\{[^{}]*\})*))?\}/g;

function parseOptions(raw: string): Array<{ matcher: string; value: string }> {
  const results: Array<{ matcher: string; value: string }> = [];
  const optionRe = /(\w+|\*|=\w+)\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = optionRe.exec(raw)) !== null) {
    results.push({ matcher: m[1], value: m[2] });
  }
  return results;
}

export function interpolate(template: string, params: TranslationParams = {}): string {
  return template.replace(PLACEHOLDER_RE, (_match, key: string, type?: string, optionsRaw?: string) => {
    const value = params[key];
    if (value === undefined) return _match;

    if (!type) return String(value);

    const options = parseOptions(optionsRaw ?? "");
    const strVal = String(value);

    if (type === "plural") {
      const num = typeof value === "number" ? value : Number(value);
      for (const opt of options) {
        if (opt.matcher.startsWith("=") && Number(opt.matcher.slice(1)) === num) return opt.value;
        if (opt.matcher === "one" && num === 1) return opt.value;
      }
      const other = options.find((o) => o.matcher === "other" || o.matcher === "*");
      return other?.value ?? strVal;
    }

    if (type === "select") {
      for (const opt of options) {
        if (opt.matcher === strVal) return opt.value;
      }
      const other = options.find((o) => o.matcher === "other" || o.matcher === "*");
      return other?.value ?? strVal;
    }

    return strVal;
  });
}

export function resolve(dict: TranslationDictionary, keyPath: string): string | undefined {
  const parts = keyPath.split(".");
  let current: unknown = dict;
  for (const part of parts) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : undefined;
}

export function translate(
  dict: TranslationDictionary,
  keyPath: string,
  params?: TranslationParams,
  options?: {
    fallbackDict?: TranslationDictionary;
    locale?: string;
    warn?: (message: string) => void;
  },
): string {
  const template = resolve(dict, keyPath) ?? resolve(options?.fallbackDict ?? {}, keyPath);
  if (!template) {
    (options?.warn ?? console.warn)(`[i18n] Missing translation key "${keyPath}" for locale "${options?.locale ?? "unknown"}"`);
    return keyPath;
  }
  return params ? interpolate(template, params) : template;
}

export { type Locale, type TranslationDictionary, type TranslationParams } from "./types.js";
