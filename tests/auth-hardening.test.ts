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

async function run(): Promise<void> {
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgres://user:pass@localhost:5432/vettrack_test";
  process.env.NODE_ENV = process.env.NODE_ENV ?? "test";

  const { createRequireAuth, createRequireAuthAny } = await import("../server/middleware/auth.js");

  let passed = 0;
  let failed = 0;

  const assert = (condition: unknown, label: string): void => {
    if (condition) {
      passed++;
      console.log(`  PASS: ${label}`);
    } else {
      failed++;
      console.error(`  FAIL: ${label}`);
    }
  };

  const nextFactory = () => {
    let called = false;
    const next: NextFunction = () => {
      called = true;
    };
    return { next, wasCalled: () => called };
  };

  console.log("\n-- requireAuth success");
  {
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
    assert(tracker.wasCalled(), "requireAuth calls next on success");
    assert((req as Request & { locale?: string }).locale === "he", "user.locale takes priority over request header");
    assert(state.statusCode === 200, "no error response on success");
  }

  console.log("\n-- requireAuth missing auth");
  {
    const middleware = createRequireAuth(async () => ({
      ok: false,
      status: 401,
      body: { error: "Unauthorized" },
    }));
    const req = makeReq();
    const { res, state } = makeRes();
    const tracker = nextFactory();
    await middleware(req, res, tracker.next);
    assert(!tracker.wasCalled(), "requireAuth does not call next when resolver returns failure");
    assert(state.statusCode === 401, "requireAuth returns resolver status for missing auth");
  }

  console.log("\n-- requireAuth invalid token");
  {
    const middleware = createRequireAuth(async () => {
      throw new Error("Invalid token signature");
    });
    const req = makeReq();
    const { res, state } = makeRes();
    const tracker = nextFactory();
    await middleware(req, res, tracker.next);
    assert(!tracker.wasCalled(), "requireAuth blocks request on invalid token error");
    assert(state.statusCode === 401, "requireAuth normalizes invalid token errors to 401");
  }

  console.log("\n-- requireAuthAny behavior");
  {
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
    assert(tracker.wasCalled(), "requireAuthAny allows pending users through by design");
    assert((req as Request & { locale?: string }).locale === "en", "requireAuthAny still applies resolved locale");
    assert(state.statusCode === 200, "requireAuthAny success does not set error status");
  }

  console.log(`\n${"-".repeat(48)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("auth-hardening.test.ts crashed", err);
  process.exit(1);
});
