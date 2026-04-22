import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const repoRoot = path.resolve(__dirname, "..");
const i18n = fs.readFileSync(path.join(repoRoot, "src", "lib", "i18n.ts"), "utf8");
const settings = fs.readFileSync(path.join(repoRoot, "src", "pages", "settings.tsx"), "utf8");
const main = fs.readFileSync(path.join(repoRoot, "src", "main.tsx"), "utf8");
const css = fs.readFileSync(path.join(repoRoot, "src", "index.css"), "utf8");
const exportExcel = fs.readFileSync(path.join(repoRoot, "src", "lib", "export-excel.ts"), "utf8");

describe("Phase 4 i18n/RTL foundation checks (static)", () => {
  it("i18n emits locale change events and exposes current locale helper", () => {
    expect(
      i18n.includes("window.dispatchEvent(new CustomEvent(\"vettrack:locale-changed\"") &&
        i18n.includes("export function getCurrentLocale(): Locale"),
    ).toBe(true);
  });

  it("Settings includes locale selector control", () => {
    expect(
      settings.includes("data-testid=\"settings-locale\"") &&
        settings.includes("onValueChange={(v) => update({ locale: v as \"en\" | \"he\" })}"),
    ).toBe(true);
  });

  it("App bootstrap reacts to locale changes without full page reload", () => {
    expect(
      main.includes("window.addEventListener(\"vettrack:locale-changed\"") &&
        main.includes("return <App key={`locale-${localeVersion}`} />;"),
    ).toBe(true);
  });

  it("Base RTL direction rules are present in global CSS", () => {
    expect(
      css.includes("html[dir=\"rtl\"] body") &&
        css.includes("html[dir=\"rtl\"] input,") &&
        css.includes("html[dir=\"rtl\"] .rtl-mirror"),
    ).toBe(true);
  });

  it("Excel export uses selected locale for date/time formatting", () => {
    expect(
      exportExcel.includes("const locale = getCurrentLocale();") &&
        exportExcel.includes("toLocaleString(locale)") &&
        exportExcel.includes("toLocaleDateString(locale)"),
    ).toBe(true);
  });
});
