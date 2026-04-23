import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readFile(relPath) {
  return fs.readFileSync(path.join(__dirname, "..", relPath), "utf8");
}

const codeBluePage = readFile("src/pages/code-blue.tsx");
const layout = readFile("src/components/layout.tsx");
const routesSource = readFile("src/app/routes.tsx");

describe("Code Blue page structure tests", () => {
  it("Code Blue page fetches critical equipment via API client", () => {
    expect(codeBluePage).toContain("api.equipment.getCriticalEquipment");
  });

  it("Auto-refresh is configured to 15 seconds", () => {
    // Interval is wrapped with leader tab-election (may pause when backgrounded).
    expect(
      codeBluePage.includes("15_000") &&
        (codeBluePage.includes("refetchInterval: 15_000") || codeBluePage.includes("refetchInterval: leaderPoll(15_000)")),
    ).toBe(true);
  });

  it("Header contains Code Blue Hebrew label with alert icon", () => {
    expect(codeBluePage.includes("CODE BLUE — ציוד קריטי") && codeBluePage.includes("AlertTriangle")).toBe(true);
  });

  it("Timestamp is rendered via relative-time formatter (not raw ISO)", () => {
    expect(
      codeBluePage.includes("formatCodeBlueRelativeTime(item.lastSeenTimestamp)") &&
        !codeBluePage.includes("item.lastSeenTimestamp ??"),
    ).toBe(true);
  });

  it("Dismiss button exists and navigates back", () => {
    expect(
      codeBluePage.includes("onClick={() => navigate(\"/home\")}") &&
        codeBluePage.includes("<X className=\"w-4 h-4 mr-1\" />"),
    ).toBe(true);
  });

  it("Empty-state rendering exists when no equipment is returned", () => {
    expect(
      codeBluePage.includes("items.length === 0") &&
        codeBluePage.includes("אין כרגע ציוד קריטי או ציוד שדורש תשומת לב."),
    ).toBe(true);
  });

  it("Code Blue nav button is role-gated to admin/vet", () => {
    expect(
      layout.includes("const canAccessCodeBlue = isAdmin || role === \"vet\"") &&
        layout.includes("href: \"/code-blue\""),
    ).toBe(true);
  });

  it("Code Blue route is registered behind AuthGuard", () => {
    expect(
      routesSource.includes("const CodeBluePage = lazy(() => import(\"@/pages/code-blue\"));") &&
        routesSource.includes('<Route path="/code-blue"><AuthGuard><CodeBluePage /></AuthGuard></Route>'),
    ).toBe(true);
  });
});
