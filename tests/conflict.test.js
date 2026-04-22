import { describe, it, expect, beforeAll } from "vitest";

// ── 1. SERVER LOGIC ───────────────────────────────────────────────
//
// If incoming.version !== current.version → THROW immediately
// Otherwise apply update and increment version

function updateEquipment(current, incoming) {
  if (incoming.version !== current.version) {
    throw new Error(
      `VERSION_MISMATCH: server is at v${current.version}, ` +
      `incoming update carries v${incoming.version}. Update rejected.`
    );
  }
  return {
    ...current,
    ...incoming,
    version: current.version + 1,
  };
}

// ── 2. CLIENT LOGIC ───────────────────────────────────────────────

class OfflineQueue {
  constructor() {
    this.items = [];
  }
  enqueue(op) {
    if (!op || op.version === undefined) {
      throw new Error("Op must carry the version at time of local snapshot");
    }
    this.items.push({ ...op, enqueuedAt: Date.now() });
  }
  drain() {
    const ops = [...this.items];
    this.items = [];
    return ops;
  }
  get size() {
    return this.items.length;
  }
}

class Client {
  constructor(name, initialState) {
    this.name = name;
    this.localState = { ...initialState };
    this.queue = new OfflineQueue();
    this.online = true;
    this.conflictLog = [];
  }

  goOffline() {
    this.online = false;
  }

  goOnline() {
    this.online = true;
  }

  // Optimistic local update — queues op when offline
  localUpdate(patch) {
    const snapshotVersion = this.localState.version;
    this.localState = { ...this.localState, ...patch };
    if (!this.online) {
      this.queue.enqueue({ patch, version: snapshotVersion });
    }
  }

  // Replay queue against server on reconnect
  // Returns array of { status, reason?, trueServerState? }
  sync(server) {
    if (!this.online) {
      throw new Error(`[${this.name}] Cannot sync while offline`);
    }

    const ops = this.queue.drain();
    const results = [];

    for (const op of ops) {
      try {
        const newState = server.applyUpdate({ ...op.patch, version: op.version });
        this.localState = { ...newState };
        results.push({ status: "applied", serverState: newState });
      } catch (e) {
        // Rejection: rollback, fetch truth, log
        const trueState = server.getState();
        const staleState = { ...this.localState };
        this.localState = { ...trueState }; // rollback

        const entry = {
          status: "rejected",
          reason: e.message,
          staleLocalState: staleState,
          trueServerState: trueState,
        };
        this.conflictLog.push(entry);
        results.push(entry);
      }
    }

    return results;
  }
}

class Server {
  constructor(initialState) {
    this.state = { ...initialState };
  }
  applyUpdate(incoming) {
    this.state = updateEquipment(this.state, incoming);
    return { ...this.state };
  }
  getState() {
    return { ...this.state };
  }
}

// ═══════════════════════════════════════════════════════════════════
// UNIT TESTS: updateEquipment
// ═══════════════════════════════════════════════════════════════════

describe("Unit: updateEquipment — version enforcement", () => {
  const base = { id: "eq-1", status: "AVAILABLE", version: 1 };
  const afterValid = updateEquipment(base, { version: 1, status: "IN_USE" });

  it("Valid update: status becomes IN_USE", () => {
    expect(afterValid.status).toBe("IN_USE");
  });

  it("Valid update: version increments to 2", () => {
    expect(afterValid.version).toBe(2);
  });

  it("Original state is not mutated", () => {
    expect(base.version).toBe(1);
  });

  it("Stale version (v1 vs server v2) throws VERSION_MISMATCH", () => {
    expect(() => updateEquipment(afterValid, { version: 1, status: "AVAILABLE" })).toThrow("VERSION_MISMATCH");
  });

  it("Future version (v99 vs server v2) throws VERSION_MISMATCH", () => {
    expect(() => updateEquipment(afterValid, { version: 99, status: "AVAILABLE" })).toThrow("VERSION_MISMATCH");
  });

  it("Zero version (v0 vs server v2) throws VERSION_MISMATCH", () => {
    expect(() => updateEquipment(afterValid, { version: 0, status: "AVAILABLE" })).toThrow("VERSION_MISMATCH");
  });
});

// ═══════════════════════════════════════════════════════════════════
// INTEGRATION SCENARIO
// ═══════════════════════════════════════════════════════════════════

describe("Scenario: Technician A (offline) vs Technician B (online)", () => {
  const INITIAL = { id: "eq-1", status: "AVAILABLE", version: 1 };
  let server, clientA, clientB, afterB, syncResults;

  beforeAll(() => {
    server  = new Server(INITIAL);
    clientA = new Client("Technician A", INITIAL);
    clientB = new Client("Technician B", INITIAL);
  });

  // Steps run in declaration order — vitest executes it() blocks sequentially.

  it("Step 1–2: A goes offline; B updates online — server accepts (status=IN_USE, version=2)", () => {
    clientA.goOffline();
    afterB = server.applyUpdate({ version: 1, status: "IN_USE" });
    clientB.localState = { ...afterB };
    expect(afterB.status).toBe("IN_USE");
    expect(afterB.version).toBe(2);
  });

  it("Step 3: A queues local update while offline — 1 op with snapshot version 1", () => {
    clientA.localUpdate({ status: "IN_USE" });
    expect(clientA.queue.size).toBe(1);
    expect(clientA.queue.items[0].version).toBe(1);
  });

  it("Step 4: A reconnects and syncs — server rejects stale update with VERSION_MISMATCH", () => {
    clientA.goOnline();
    syncResults = clientA.sync(server);
    expect(syncResults.length).toBe(1);
    expect(syncResults[0].status).toBe("rejected");
    expect(typeof syncResults[0].reason === "string" && syncResults[0].reason.length > 0).toBeTruthy();
    expect(syncResults[0].reason).toContain("VERSION_MISMATCH");
  });

  it("Rollback: client A local state matches server truth (status=IN_USE, version=2)", () => {
    expect(clientA.localState.status).toBe("IN_USE");
    expect(clientA.localState.version).toBe(2);
  });

  it("Final server state: status=IN_USE, version=2 (A did not overwrite B)", () => {
    expect(server.getState().status).toBe("IN_USE");
    expect(server.getState().version).toBe(2);
    expect(server.getState().version).not.toBe(3);
  });

  it("A's conflict log: 1 entry recording server's truth (v2, IN_USE)", () => {
    expect(clientA.conflictLog.length).toBe(1);
    expect(clientA.conflictLog[0].trueServerState.version).toBe(2);
    expect(clientA.conflictLog[0].trueServerState.status).toBe("IN_USE");
  });

  it("Post-sync: A's queue is empty; A and B are both consistent with server", () => {
    expect(clientA.queue.size).toBe(0);
    expect(clientA.localState.version).toBe(server.getState().version);
    expect(clientB.localState.version).toBe(server.getState().version);
  });
});

// ═══════════════════════════════════════════════════════════════════
// OVERWRITE DETECTION — explicit overwrite test
// ═══════════════════════════════════════════════════════════════════

describe("Overwrite detection: system must make overwrite impossible", () => {
  it("Overwrite correctly prevented at the server logic level", () => {
    expect(() =>
      updateEquipment(
        { id: "eq-1", status: "IN_USE", version: 2 },
        { version: 1, status: "IN_USE" } // stale op from A
      )
    ).toThrow("VERSION_MISMATCH");
  });
});
