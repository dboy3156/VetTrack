import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { erModeConcealmentMiddleware } from "../server/middleware/er-mode-concealment.js";

const getClinicErModeStateCached = vi.fn();

vi.mock("../server/lib/er-mode.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/lib/er-mode.js")>();
  return {
    ...actual,
    getClinicErModeStateCached: (...args: Parameters<typeof actual.getClinicErModeStateCached>) =>
      getClinicErModeStateCached(...args),
  };
});

type JsonBody = Record<string, unknown>;

function makeReq(overrides: Partial<Request> & { authUser?: { clinicId: string } } = {}): Request {
  return {
    method: "GET",
    originalUrl: "/api/equipment",
    url: "/api/equipment",
    ...overrides,
  } as unknown as Request;
}

function makeRes() {
  const state: { statusCode: number; body: JsonBody | null } = {
    statusCode: 200,
    body: null,
  };
  const res = {
    status(code: number) {
      state.statusCode = code;
      return this;
    },
    json(payload: JsonBody) {
      state.body = payload;
      return this;
    },
  } as unknown as Response;
  return { res, state };
}

function nextTracker() {
  let calls = 0;
  const next: NextFunction = () => {
    calls += 1;
  };
  return { next, callCount: () => calls };
}

describe("erModeConcealmentMiddleware", () => {
  beforeEach(() => {
    getClinicErModeStateCached.mockReset();
  });

  it("returns 404 for non-allowlisted API path when ER concealment is enforced", async () => {
    getClinicErModeStateCached.mockResolvedValue("enforced");
    const req = makeReq({ clinicId: "c1" });
    const { res, state } = makeRes();
    const { next, callCount } = nextTracker();

    erModeConcealmentMiddleware(req, res, next);
    await vi.waitFor(() => expect(state.statusCode).toBe(404));
    expect(state.body?.reason).toBe("ER_MODE_CONCEALMENT");
    expect(callCount()).toBe(0);
  });

  it("calls next for allowlisted paths without checking state", async () => {
    getClinicErModeStateCached.mockResolvedValue("enforced");
    const req = makeReq({ originalUrl: "/api/er/mode", url: "/api/er/mode", clinicId: "c1" });
    const { res, state } = makeRes();
    const { next, callCount } = nextTracker();

    erModeConcealmentMiddleware(req, res, next);
    await vi.waitFor(() => expect(callCount()).toBe(1));
    expect(state.statusCode).toBe(200);
    expect(getClinicErModeStateCached).not.toHaveBeenCalled();
  });

  it("calls next (fail-open) when state retrieval rejects — no 500", async () => {
    getClinicErModeStateCached.mockRejectedValue(new Error("db unavailable"));
    const req = makeReq({ clinicId: "c1" });
    const { res, state } = makeRes();
    const { next, callCount } = nextTracker();

    erModeConcealmentMiddleware(req, res, next);
    await vi.waitFor(() => expect(callCount()).toBe(1));
    expect(state.statusCode).toBe(200);
  });

  it("passes through when mode is not enforced", async () => {
    getClinicErModeStateCached.mockResolvedValue("preview");
    const req = makeReq({ clinicId: "c1" });
    const { res, state } = makeRes();
    const { next, callCount } = nextTracker();

    erModeConcealmentMiddleware(req, res, next);
    await vi.waitFor(() => expect(callCount()).toBe(1));
    expect(state.statusCode).toBe(200);
  });
});
