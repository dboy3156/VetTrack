import {
  clearLocaleCache,
  getLocaleDictionaries,
  getLocaleReadCount,
  loadLocale,
} from "../lib/i18n/loader.js";
import { interpolate, translate } from "../lib/i18n/index.js";

let passed = 0;
let failed = 0;

function ok(label: string): void {
  console.log(`  PASS: ${label}`);
  passed++;
}

function fail(label: string, detail?: string): void {
  console.error(`  FAIL: ${label}${detail ? ` - ${detail}` : ""}`);
  failed++;
}

function assert(condition: unknown, label: string, detail?: string): void {
  if (condition) ok(label);
  else fail(label, detail);
}

function section(name: string): void {
  console.log(`\n-- ${name}`);
}

section("Fallback + Missing Key Warning");
clearLocaleCache();
const heOnly = { greet: { hello: "שלום" } };
const enFallback = { greet: { hello: "Hello", goodbye: "Goodbye" } };
const warnMessages: string[] = [];
const warn = (message: string) => warnMessages.push(message);

const fromFallback = translate(heOnly, "greet.goodbye", undefined, {
  fallbackDict: enFallback,
  locale: "he",
  warn,
});
assert(fromFallback === "Goodbye", "Falls back to English dictionary when key missing in locale");

const missingEverywhere = translate(heOnly, "greet.unknown", undefined, {
  fallbackDict: enFallback,
  locale: "he",
  warn,
});
assert(missingEverywhere === "greet.unknown", "Falls back to key when missing in locale + fallback");
assert(
  warnMessages.some((m) => m.includes("greet.unknown") && m.includes("he")),
  "Missing key warning includes key and locale",
  JSON.stringify(warnMessages),
);

section("Interpolation + Pluralization");
const interpolated = interpolate("Hello {name}", { name: "Dan" });
assert(interpolated === "Hello Dan", "Interpolation replaces parameters");

const pluralTemplate = "{count, plural, one {# item} other {# items}}";
const one = interpolate(pluralTemplate, { count: 1 }).replace("#", "1");
const many = interpolate(pluralTemplate, { count: 4 }).replace("#", "4");
assert(one === "1 item", "Pluralization uses 'one' branch");
assert(many === "4 items", "Pluralization uses 'other' branch");

section("Locale Switching + Loader Cache");
clearLocaleCache();
const enBundle = getLocaleDictionaries("en");
const heBundle = getLocaleDictionaries("he");
assert(enBundle.locale === "en", "Locale switching resolves English");
assert(heBundle.locale === "he", "Locale switching resolves Hebrew");

const enBefore = getLocaleReadCount("en");
const heBefore = getLocaleReadCount("he");
loadLocale("en");
loadLocale("he");
assert(getLocaleReadCount("en") === enBefore, "English locale is served from cache after first load");
assert(getLocaleReadCount("he") === heBefore, "Hebrew locale is served from cache after first load");

console.log(`\n${"-".repeat(48)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
