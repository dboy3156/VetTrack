import { describe, it, expect } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { createErAllowlistMiddleware, isErAllowedPath } from "../server/middleware/er-allowlist.js";
import type { ErModeState } from "../server/lib/er-mode.js";

function makeReq(path: string, clinicId?: string): Request {
  return { path, clinicId } as unknown as Request;
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
  it("blocks /api/users", () => expect(isErAllowedPath("/api/users")).toBe(false));
  it("blocks /api/equipment", () => expect(isErAllowedPath("/api/equipment")).toBe(false));
  it("blocks /api/procurement", () => expect(isErAllowedPath("/api/procurement")).toBe(false));
  it("blocks /api/forecast", () => expect(isErAllowedPath("/api/forecast")).toBe(false));
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
    const req = makeReq("/api/equipment", "clinic-1");
    const { res, state } = makeRes();
    const { next, called } = makeNext();
    await mw(req, res, next);
    expect(called()).toBe(false);
    expect(state.statusCode).toBe(404);
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