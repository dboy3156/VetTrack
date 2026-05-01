import { describe, it, expect } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { createErAllowlistMiddleware, isErAllowedPath } from "../server/middleware/er-allowlist.js";
import type { ErModeState } from "../server/lib/er-mode.js";
import {
  isErAllowedUiPath,
  isErEquipmentBedsideUiPath,
} from "../shared/er-allowlist.js";

function makeReq(path: string, clinicId?: string): Request {
  return { path, originalUrl: path, clinicId } as unknown as Request;
}

function makeRes() {
  const state = { statusCode: 200, body: null as unknown };
  const res = {
    status(code: number) { state.statusCode = code; return this; },
    json(body: unknown) { state.body = body; return this; },
  } as unknown as Response;
  return { res, state };
}

function makeNext(): { next: NextFunction; called: () => boolean } {
  let called = false;
  return { next: () => { called = true; }, called: () => called };
}

function makeResolver(state: ErModeState) {
  return async (_clinicId: string) => state;
}

describe("isErAllowedPath", () => {
  it("allows /api/patients", () => expect(isErAllowedPath("/api/patients")).toBe(true));
  it("allows /api/patients/123", () => expect(isErAllowedPath("/api/patients/123")).toBe(true));
  it("allows /api/er/board", () => expect(isErAllowedPath("/api/er/board")).toBe(true));
  it("allows /api/health", () => expect(isErAllowedPath("/api/health")).toBe(true));
  it("allows /api/tasks and nested", () => {
    expect(isErAllowedPath("/api/tasks")).toBe(true);
    expect(isErAllowedPath("/api/tasks/medication-active")).toBe(true);
    expect(isErAllowedPath("/api/tasks/abc/complete")).toBe(true);
  });
  it("allows /api/formulary and nested", () => {
    expect(isErAllowedPath("/api/formulary")).toBe(true);
    expect(isErAllowedPath("/api/formulary/x")).toBe(true);
  });
  it("allows /api/display and nested", () => {
    expect(isErAllowedPath("/api/display/snapshot")).toBe(true);
  });
  it("allows /api/containers and nested", () => {
    expect(isErAllowedPath("/api/containers")).toBe(true);
    expect(isErAllowedPath("/api/containers/c1/dispense")).toBe(true);
  });
  it("allows /api/restock for inventory workflows", () => {
    expect(isErAllowedPath("/api/restock/container-items")).toBe(true);
  });
  it("allows /api/equipment for bedside flows", () => {
    expect(isErAllowedPath("/api/equipment")).toBe(true);
    expect(isErAllowedPath("/api/equipment/my")).toBe(true);
    expect(isErAllowedPath("/api/equipment/eq1/checkout")).toBe(true);
    expect(isErAllowedPath("/api/equipment/eq1/return")).toBe(true);
  });
  it("blocks /api/users", () => expect(isErAllowedPath("/api/users")).toBe(false));
  it("blocks /api/procurement API route module", () =>
    expect(isErAllowedPath("/api/procurement")).toBe(false));
  it("blocks /api/forecast", () => expect(isErAllowedPath("/api/forecast")).toBe(false));
});

describe("isErAllowedUiPath", () => {
  it("allows /patients and nested", () => {
    expect(isErAllowedUiPath("/patients")).toBe(true);
    expect(isErAllowedUiPath("/patients/abc")).toBe(true);
  });
  it("allows /er and nested", () => {
    expect(isErAllowedUiPath("/er")).toBe(true);
    expect(isErAllowedUiPath("/er/impact")).toBe(true);
  });
  it("allows /meds", () => expect(isErAllowedUiPath("/meds")).toBe(true));
  it("allows /display", () => expect(isErAllowedUiPath("/display")).toBe(true));
  it("allows /code-blue/display", () => expect(isErAllowedUiPath("/code-blue/display")).toBe(true));
  it("allows /inventory (containers + restock APIs)", () => {
    expect(isErAllowedUiPath("/inventory")).toBe(true);
  });

  describe("equipment bedside UI (ER pilot)", () => {
    it("allows /my-equipment and item detail / QR print", () => {
      expect(isErAllowedUiPath("/my-equipment")).toBe(true);
      expect(isErEquipmentBedsideUiPath("/my-equipment")).toBe(true);
      expect(isErAllowedUiPath("/equipment/dev-item-1")).toBe(true);
      expect(isErAllowedUiPath("/equipment/dev-item-1/qr")).toBe(true);
    });
    it("blocks main equipment list and admin routes", () => {
      expect(isErAllowedUiPath("/equipment")).toBe(false);
      expect(isErEquipmentBedsideUiPath("/equipment")).toBe(false);
      expect(isErAllowedUiPath("/equipment/new")).toBe(false);
      expect(isErAllowedUiPath("/equipment/abc/edit")).toBe(false);
    });
    it("blocks unknown nested equipment paths", () => {
      expect(isErAllowedUiPath("/equipment/id/extra/segment")).toBe(false);
    });
  });
});

describe("erAllowlistMiddleware", () => {
  it("passes through when clinicId is absent", async () => {
    const mw = createErAllowlistMiddleware(makeResolver("enforced"));
    const req = makeReq("/api/equipment");
    const { res } = makeRes();
    const { next, called } = makeNext();
    await mw(req, res, next);
    expect(called()).toBe(true);
  });

  it("passes through in disabled mode for any path", async () => {
    const mw = createErAllowlistMiddleware(makeResolver("disabled"));
    const req = makeReq("/api/equipment", "clinic-1");
    const { res } = makeRes();
    const { next, called } = makeNext();
    await mw(req, res, next);
    expect(called()).toBe(true);
  });

  it("passes through in preview mode for blocked path (logs only)", async () => {
    const mw = createErAllowlistMiddleware(makeResolver("preview"));
    const req = makeReq("/api/equipment", "clinic-1");
    const { res } = makeRes();
    const { next, called } = makeNext();
    await mw(req, res, next);
    expect(called()).toBe(true);
  });

  it("passes through in enforced mode for allowlisted path", async () => {
    const mw = createErAllowlistMiddleware(makeResolver("enforced"));
    const req = makeReq("/api/patients/abc", "clinic-1");
    const { res } = makeRes();
    const { next, called } = makeNext();
    await mw(req, res, next);
    expect(called()).toBe(true);
  });

  it("returns 404 in enforced mode for non-allowlisted path", async () => {
    const mw = createErAllowlistMiddleware(makeResolver("enforced"));
    const req = makeReq("/api/analytics/overview", "clinic-1");
    const { res, state } = makeRes();
    const { next, called } = makeNext();
    await mw(req, res, next);
    expect(called()).toBe(false);
    expect(state.statusCode).toBe(404);
  });

  it("passes through in enforced mode for /api/equipment checkout", async () => {
    const mw = createErAllowlistMiddleware(makeResolver("enforced"));
    const req = makeReq("/api/equipment/eq1/checkout", "clinic-1");
    const { res } = makeRes();
    const { next, called } = makeNext();
    await mw(req, res, next);
    expect(called()).toBe(true);
  });

  it("passes through in enforced mode for /api/tasks complete path", async () => {
    const mw = createErAllowlistMiddleware(makeResolver("enforced"));
    const req = makeReq("/api/tasks/t1/complete", "clinic-1");
    const { res } = makeRes();
    const { next, called } = makeNext();
    await mw(req, res, next);
    expect(called()).toBe(true);
  });

  it("passes through when resolver throws (fail-open)", async () => {
    const mw = createErAllowlistMiddleware(async () => { throw new Error("DB down"); });
    const req = makeReq("/api/equipment", "clinic-1");
    const { res } = makeRes();
    const { next, called } = makeNext();
    await mw(req, res, next);
    expect(called()).toBe(true);
  });
});