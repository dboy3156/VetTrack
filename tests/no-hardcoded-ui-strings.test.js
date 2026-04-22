import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SRC_ROOT = path.resolve(__dirname, "..", "src");
const FORBIDDEN = ["Hello"];
const SOURCE_EXTENSIONS = new Set([".tsx", ".ts", ".jsx", ".js"]);

function walk(dirPath, failures) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") continue;
      walk(fullPath, failures);
      continue;
    }
    if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      const content = fs.readFileSync(fullPath, "utf8");
      for (const token of FORBIDDEN) {
        if (content.includes(token)) {
          failures.push(
            `Forbidden UI literal "${token}" found in ${path.relative(path.resolve(__dirname, ".."), fullPath)}`
          );
        }
      }
    }
  }
}

describe("UI hardcoded string guard", () => {
  it("no forbidden literals in src files", () => {
    const failures = [];
    walk(SRC_ROOT, failures);
    expect(failures).toHaveLength(0);
  });
});
