import { describe, it, expect, beforeAll } from "vitest";
import type { Request, Response, NextFunction } from "express";

type JsonBody = Record<string, unknown>;

function makeReq(headers: Record<string, string> = {}): Request {
  return {
    headers,
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

const nextFactory = () => {
  let called = false;
  const next: NextFunction = () => {
    called = true;
  };
  return { next, wasCalled: () => called };
};

let createRequireAuth: (resolver: () => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => Promise<void>;
let createRequireAuthAny: (resolver: () => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => Promise<void>;

beforeAll(async () => {
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgres://user:pass@localhost:5432/vettrack_test";
  process.env.NODE_ENV = process.env.NODE_ENV ?? "test";
  const mod = await import("../server/middleware/auth.js");
  createRequireAuth = mod.createRequireAuth;
  createRequireAuthAny = mod.createRequireAuthAny;
});

describe("requireAuth success", () => {
  it("requireAuth calls next on success", async () => {
    const middleware = createRequireAuth(async () => ({
      ok: true,
      user: {
        id: "u1",
        clerkId: "c1",
        email: "user@vettrack.dev",
        name: "User One",
        role: "technician",
        status: "active",
        locale: "he",
      },
    }));
    const req = makeReq({ "x-locale": "en" });
    const { res } = makeRes();
    const tracker = nextFactory();
    await middleware(req, res, tracker.next);
    expect(tracker.wasCalled()).toBeTruthy();
  });

  it("user.locale takes priority over request header", async () => {
    const middleware = createRequireAuth(async () => ({
      ok: true,
      user: {
        id: "u1",
        clerkId: "c1",
        email: "user@vettrack.dev",
        name: "User One",
        role: "technician",
        status: "active",
        locale: "he",
      },
    }));
    const req = makeReq({ "x-locale": "en" });
    const { res } = makeRes();
    const tracker = nextFactory();
    await middleware(req, res, tracker.next);
    expect((req as Request & { locale?: string }).locale === "he").toBeTruthy();
  });

  it("no error response on success", async () => {
    const middleware = createRequireAuth(async () => ({
      ok: true,
      user: {
        id: "u1",
        clerkId: "c1",
        email: "user@vettrack.dev",
        name: "User One",
        role: "technician",
        status: "active",
        locale: "he",
      },
    }));
    const req = makeReq({ "x-locale": "en" });
    const { res, state } = makeRes();
    const tracker = nextFactory();
    await middleware(req, res, tracker.next);
    expect(state.statusCode === 200).toBeTruthy();
  });
});

describe("requireAuth missing auth", () => {
  it("requireAuth does not call next when resolver returns failure", async () => {
    const middleware = createRequireAuth(async () => ({
      ok: false,
      status: 401,
      body: { error: "Unauthorized" },
    }));
    const req = makeReq();
    const { res } = makeRes();
    const tracker = nextFactory();
    await middleware(req, res, tracker.next);
    expect(!tracker.wasCalled()).toBeTruthy();
  });

  it("requireAuth returns resolver status for missing auth", async () => {
    const middleware = createRequireAuth(async () => ({
      ok: false,
      status: 401,
      body: { error: "Unauthorized" },
    }));
    const req = makeReq();
    const { res, state } = makeRes();
    const tracker = nextFactory();
    await middleware(req, res, tracker.next);
    expect(state.statusCode === 401).toBeTruthy();
  });
});

describe("requireAuth invalid token", () => {
  it("requireAuth blocks request on invalid token error", async () => {
    const middleware = createRequireAuth(async () => {
      throw new Error("Invalid token signature");
    });
    const req = makeReq();
    const { res } = makeRes();
    const tracker = nextFactory();
    await middleware(req, res, tracker.next);
    expect(!tracker.wasCalled()).toBeTruthy();
  });

  it("requireAuth normalizes invalid token errors to 401", async () => {
    const middleware = createRequireAuth(async () => {
      throw new Error("Invalid token signature");
    });
    const req = makeReq();
    const { res, state } = makeRes();
    const tracker = nextFactory();
    await middleware(req, res, tracker.next);
    expect(state.statusCode === 401).toBeTruthy();
  });
});

describe("requireAuthAny behavior", () => {
  it("requireAuthAny allows pending users through by design", async () => {
    const middleware = createRequireAuthAny(async () => ({
      ok: true,
      user: {
        id: "u2",
        clerkId: "c2",
        email: "pending@vettrack.dev",
        name: "Pending User",
        role: "student",
        status: "pending",
        locale: "en",
      },
    }));
    const req = makeReq();
    const { res } = makeRes();
    const tracker = nextFactory();
    await middleware(req, res, tracker.next);
    expect(tracker.wasCalled()).toBeTruthy();
  });

  it("requireAuthAny still applies resolved locale", async () => {
    const middleware = createRequireAuthAny(async () => ({
      ok: true,
      user: {
        id: "u2",
        clerkId: "c2",
        email: "pending@vettrack.dev",
        name: "Pending User",
        role: "student",
        status: "pending",
        locale: "en",
      },
    }));
    const req = makeReq();
    const { res } = makeRes();
    const tracker = nextFactory();
    await middleware(req, res, tracker.next);
    expect((req as Request & { locale?: string }).locale === "en").toBeTruthy();
  });

  it("requireAuthAny success does not set error status", async () => {
    const middleware = createRequireAuthAny(async () => ({
      ok: true,
      user: {
        id: "u2",
        clerkId: "c2",
        email: "pending@vettrack.dev",
        name: "Pending User",
        role: "student",
        status: "pending",
        locale: "en",
      },
    }));
    const req = makeReq();
    const { res, state } = makeRes();
    const tracker = nextFactory();
    await middleware(req, res, tracker.next);
    expect(state.statusCode === 200).toBeTruthy();
  });
});
