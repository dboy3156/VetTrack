import { describe, it, expect } from "vitest";
import {
  clearLocaleCache,
  getLocaleDictionaries,
  getLocaleReadCount,
  loadLocale,
} from "../lib/i18n/loader.js";
import { interpolate, translate } from "../lib/i18n/index.js";

describe("Fallback + Missing Key Warning", () => {
  it("Falls back to English dictionary when key missing in locale", () => {
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
    expect(fromFallback === "Goodbye").toBeTruthy();
  });

  it("Falls back to key when missing in locale + fallback", () => {
    clearLocaleCache();
    const heOnly = { greet: { hello: "שלום" } };
    const enFallback = { greet: { hello: "Hello", goodbye: "Goodbye" } };
    const warnMessages: string[] = [];
    const warn = (message: string) => warnMessages.push(message);

    const missingEverywhere = translate(heOnly, "greet.unknown", undefined, {
      fallbackDict: enFallback,
      locale: "he",
      warn,
    });
    expect(missingEverywhere === "greet.unknown").toBeTruthy();
  });

  it("Missing key warning includes key and locale", () => {
    clearLocaleCache();
    const heOnly = { greet: { hello: "שלום" } };
    const enFallback = { greet: { hello: "Hello", goodbye: "Goodbye" } };
    const warnMessages: string[] = [];
    const warn = (message: string) => warnMessages.push(message);

    translate(heOnly, "greet.unknown", undefined, {
      fallbackDict: enFallback,
      locale: "he",
      warn,
    });
    expect(
      warnMessages.some((m) => m.includes("greet.unknown") && m.includes("he")),
    ).toBeTruthy();
  });
});

describe("Interpolation + Pluralization", () => {
  it("Interpolation replaces parameters", () => {
    const interpolated = interpolate("Hello {name}", { name: "Dan" });
    expect(interpolated === "Hello Dan").toBeTruthy();
  });

  it("Pluralization uses 'one' branch", () => {
    const pluralTemplate = "{count, plural, one {# item} other {# items}}";
    const one = interpolate(pluralTemplate, { count: 1 }).replace("#", "1");
    expect(one === "1 item").toBeTruthy();
  });

  it("Pluralization uses 'other' branch", () => {
    const pluralTemplate = "{count, plural, one {# item} other {# items}}";
    const many = interpolate(pluralTemplate, { count: 4 }).replace("#", "4");
    expect(many === "4 items").toBeTruthy();
  });
});

describe("Locale Switching + Loader Cache", () => {
  it("Locale switching resolves English", () => {
    clearLocaleCache();
    const enBundle = getLocaleDictionaries("en");
    expect(enBundle.locale === "en").toBeTruthy();
  });

  it("Locale switching resolves Hebrew", () => {
    clearLocaleCache();
    const heBundle = getLocaleDictionaries("he");
    expect(heBundle.locale === "he").toBeTruthy();
  });

  it("English locale is served from cache after first load", () => {
    clearLocaleCache();
    getLocaleDictionaries("en");
    const enBefore = getLocaleReadCount("en");
    loadLocale("en");
    expect(getLocaleReadCount("en") === enBefore).toBeTruthy();
  });

  it("Hebrew locale is served from cache after first load", () => {
    clearLocaleCache();
    getLocaleDictionaries("he");
    const heBefore = getLocaleReadCount("he");
    loadLocale("he");
    expect(getLocaleReadCount("he") === heBefore).toBeTruthy();
  });
});
