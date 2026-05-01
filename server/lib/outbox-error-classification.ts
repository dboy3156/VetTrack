/**
 * Classifies publish failures for `vt_event_outbox` retry metadata.
 * Prefers transient when uncertain so rows are not stranded without admin action.
 */

const TRANSIENT_NODE_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNREFUSED",
  "ENOTFOUND",
  "EPIPE",
  "EAI_AGAIN",
  "ENETUNREACH",
  "EHOSTUNREACH",
]);

/** PostgreSQL classes / codes that warrant automatic retry. */
function pgCodeTransient(code: string): boolean {
  if (code.startsWith("08")) return true; // connection_exception
  if (code === "40001") return true; // serialization_failure
  if (code === "40P01") return true; // deadlock_detected
  if (code === "53100" || code === "53200" || code === "53300") return true; // disk_full / out_of_memory / too_many_connections
  if (code === "57P01" || code === "57P02" || code === "57P03") return true; // admin_shutdown / crash_shutdown / cannot_connect_now
  if (code === "58030") return true; // io_error
  return false;
}

function pgCodePermanent(code: string): boolean {
  if (code.startsWith("23")) return true; // integrity_constraint_violation
  if (code.startsWith("42")) return true; // syntax_error / …
  if (code.startsWith("22")) return true; // data_exception (bad encoding, invalid input, …)
  if (code.startsWith("21")) return true; // cardinality_violation
  if (code.startsWith("XX")) return true; // internal_error (query planner bugs — do not spin)
  return false;
}

function inspectErrObject(err: Record<string, unknown>): "transient" | "permanent" | null {
  const code = typeof err.code === "string" ? err.code : "";

  if (TRANSIENT_NODE_CODES.has(code)) return "transient";

  if (code.length >= 5 && /^\d/.test(code)) {
    if (pgCodeTransient(code)) return "transient";
    if (pgCodePermanent(code)) return "permanent";
  }

  return null;
}

function messageHeuristic(msg: string): "transient" | "permanent" | null {
  const m = msg.toLowerCase();

  if (
    m.includes("timeout") ||
    m.includes("timed out") ||
    m.includes("econnreset") ||
    m.includes("socket hang up") ||
    m.includes("connection terminated") ||
    m.includes("connection closed unexpectedly") ||
    m.includes("server closed the connection") ||
    m.includes("broken pipe") ||
    m.includes("connection refused") ||
    m.includes("enotfound") ||
    m.includes("econnrefused") ||
    m.includes("enetunreach") ||
    m.includes("network error") ||
    m.includes("getaddrinfo") ||
    m.includes("ssl connection") ||
    m.includes("tls") && m.includes("error")
  ) {
    return "transient";
  }

  if (
    m.includes("duplicate key") ||
    m.includes("violates foreign key") ||
    m.includes("violates not-null") ||
    m.includes("violates check constraint") ||
    m.includes("unique constraint") ||
    m.includes("syntax error at") ||
    m.includes("invalid input syntax") ||
    m.includes("invalid byte sequence") ||
    m.includes("could not convert") ||
    m.includes("malformed") && (m.includes("json") || m.includes("utf"))
  ) {
    return "permanent";
  }

  return null;
}

function classifyOne(err: unknown): "transient" | "permanent" | null {
  if (err == null) return null;

  if (typeof err === "object") {
    const o = err as Record<string, unknown>;
    const fromObj = inspectErrObject(o);
    if (fromObj) return fromObj;

    if (err instanceof Error && err.message) {
      const fromMsg = messageHeuristic(err.message);
      if (fromMsg) return fromMsg;
    } else if (typeof o.message === "string") {
      const fromMsg = messageHeuristic(o.message);
      if (fromMsg) return fromMsg;
    }

    if (Array.isArray(o.errors)) {
      for (const sub of o.errors) {
        const c = classifyOne(sub);
        if (c === "permanent") return "permanent";
        if (c === "transient") return "transient";
      }
    }
    if (o.cause != null) {
      const c = classifyOne(o.cause);
      if (c) return c;
    }
  }

  if (typeof err === "string") {
    return messageHeuristic(err);
  }

  return null;
}

/**
 * Classify a failure from the outbox publisher transaction or downstream DB driver.
 * Defaults to **transient** when unknown so the publisher can keep trying unless proven terminal.
 */
export function classifyOutboxPublishError(err: unknown): "transient" | "permanent" {
  return classifyOne(err) ?? "transient";
}
