import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const repoRoot = path.resolve(__dirname, "..");
const indexCss = fs.readFileSync(path.join(repoRoot, "src", "index.css"), "utf8");

const start = indexCss.indexOf("@media (prefers-reduced-motion: reduce)");
const reducedBlock = start < 0 ? null : indexCss.slice(start, start + 4000);

const mustInclude = [
  "scanAmbient_",
  "menuReveal_",
  "qr-scan-line",
  "html",
  "scroll-behavior",
];

describe("UI reduced motion hardening", () => {
  it("src/index.css contains @media (prefers-reduced-motion: reduce) block", () => {
    expect(reducedBlock).not.toBeNull();
  });

  for (const needle of mustInclude) {
    it(`reduced-motion block includes pattern: ${needle}`, () => {
      expect(reducedBlock).toContain(needle);
    });
  }
});
