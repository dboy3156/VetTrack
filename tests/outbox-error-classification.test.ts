import { describe, expect, it } from "vitest";
import { classifyOutboxPublishError } from "../server/lib/outbox-error-classification.js";

describe("classifyOutboxPublishError", () => {
  it("classifies PostgreSQL integrity violations as permanent", () => {
    expect(classifyOutboxPublishError({ code: "23505", message: "duplicate key" })).toBe("permanent");
    expect(classifyOutboxPublishError({ code: "23503", message: "fk" })).toBe("permanent");
  });

  it("classifies PostgreSQL syntax/data exceptions as permanent", () => {
    expect(classifyOutboxPublishError({ code: "42601", message: "syntax error" })).toBe("permanent");
    expect(classifyOutboxPublishError({ code: "22P02", message: "invalid input" })).toBe("permanent");
  });

  it("classifies connection and timeout errors as transient", () => {
    expect(classifyOutboxPublishError({ code: "ECONNRESET" })).toBe("transient");
    expect(classifyOutboxPublishError({ code: "ETIMEDOUT" })).toBe("transient");
    expect(classifyOutboxPublishError(new Error("socket hang up"))).toBe("transient");
    expect(classifyOutboxPublishError(new Error("Connection terminated unexpectedly"))).toBe("transient");
  });

  it("classifies PG connection_exception and deadlock as transient", () => {
    expect(classifyOutboxPublishError({ code: "08006", message: "connection failure" })).toBe("transient");
    expect(classifyOutboxPublishError({ code: "40P01", message: "deadlock" })).toBe("transient");
  });

  it("defaults unknown errors to transient", () => {
    expect(classifyOutboxPublishError(new Error("something weird"))).toBe("transient");
  });
});
