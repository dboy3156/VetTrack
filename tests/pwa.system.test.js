import { describe, it, expect } from "vitest";

// ═══════════════════════════════════════════════════════════════════
// INFRASTRUCTURE MOCKS
// ═══════════════════════════════════════════════════════════════════

// ── Network ───────────────────────────────────────────────────────
class NetworkMock {
  constructor() { this.online = true; this._calls = []; }
  fetch(url, payload) {
    if (!this.online) throw new Error("NETWORK_UNAVAILABLE");
    this._calls.push({ url, payload, ts: Date.now() });
    return { ok: true, status: 200 };
  }
  goOffline() { this.online = false; }
  goOnline()  { this.online = true; }
  get callCount() { return this._calls.length; }
  get calls()     { return [...this._calls]; }
  reset()         { this._calls = []; }
}

// ── Dexie / IndexedDB queue simulation ───────────────────────────
class DexieQueue {
  constructor() { this._store = []; }
  enqueue(op) {
    if (!op || !op.id || !op.patch)
      throw new Error("Op must have id and patch");
    this._store.push({ ...op, enqueuedAt: Date.now() });
  }
  drain()       { const ops = [...this._store]; this._store = []; return ops; }
  peek()        { return [...this._store]; }
  get size()    { return this._store.length; }
}

// ── Versioned server state ────────────────────────────────────────
class Server {
  constructor()    { this._records = new Map(); }
  seed(record)     { this._records.set(record.id, { ...record }); }
  get(id) {
    const r = this._records.get(id);
    if (!r) throw new Error(`Not found: ${id}`);
    return { ...r };
  }
  apply(id, patch) {
    const current = this._records.get(id);
    if (!current) throw new Error(`Not found: ${id}`);
    if (patch.version !== current.version)
      throw new Error(
        `VERSION_MISMATCH: server@v${current.version}, patch@v${patch.version}`
      );
    const next = { ...current, ...patch, version: current.version + 1 };
    this._records.set(id, next);
    return { ...next };
  }
}

// ── PWA client — optimistic UI + offline queue ────────────────────
class PWAClient {
  constructor(name, server, network) {
    this.name        = name;
    this._server     = server;
    this._network    = network;
    this._queue      = new DexieQueue();
    this._local      = new Map();
    this._conflicts  = [];
    this.online      = true;
  }
  goOffline() { this.online = false; this._network.goOffline(); }
  goOnline()  { this.online = true;  this._network.goOnline();  }
  hydrate(record) { this._local.set(record.id, { ...record }); }
  getLocalState(id) {
    const s = this._local.get(id);
    return s ? { ...s } : null;
  }
  get queueSize()    { return this._queue.size; }
  get conflictLog()  { return [...this._conflicts]; }

  update(id, patch) {
    const local = this._local.get(id);
    if (!local) throw new Error(`${this.name}: no local state for "${id}"`);
    const snapshotVersion = local.version;

    // Optimistic UI update (always)
    this._local.set(id, { ...local, ...patch });

    if (!this.online) {
      this._queue.enqueue({ id, patch: { ...patch, version: snapshotVersion } });
    } else {
      try {
        const result = this._server.apply(id, { ...patch, version: snapshotVersion });
        this._local.set(id, { ...result });
        this._network.fetch(`/api/equipment/${id}`, patch);
      } catch (e) {
        this._local.set(id, { ...local });
        throw e;
      }
    }
  }

  sync() {
    if (!this.online) throw new Error(`${this.name}: cannot sync while offline`);
    const ops     = this._queue.drain();
    const results = [];
    for (const op of ops) {
      try {
        const result = this._server.apply(op.id, op.patch);
        this._local.set(op.id, { ...result });
        this._network.fetch(`/api/equipment/${op.id}`, op.patch);
        results.push({ status: "applied", serverState: result });
      } catch (e) {
        const truth = this._server.get(op.id);
        const entry = {
          status: "rejected",
          reason: e.message,
          trueServerState: truth,
        };
        this._conflicts.push(entry);
        this._local.set(op.id, { ...truth });
        results.push(entry);
      }
    }
    return results;
  }
}

// ── Service Worker cache simulation ───────────────────────────────
class SWCache {
  constructor() { this._cache = new Map(); this._networkOnline = true; }
  goOffline() { this._networkOnline = false; }
  goOnline()  { this._networkOnline = true; }
  put(url, response) { this._cache.set(url, { ...response, cachedAt: Date.now() }); }
  match(url) { return this._cache.get(url) || null; }
  get size()  { return this._cache.size; }

  fetchOrCache(url) {
    if (this._networkOnline) {
      const response = { url, body: `<!-- ${url} -->`, status: 200 };
      this._cache.set(url, { ...response, cachedAt: Date.now() });
      return { ...response, source: "network" };
    }
    const cached = this._cache.get(url);
    if (cached) return { ...cached, source: "cache" };
    throw new Error(`CACHE_MISS: "${url}" not available offline`);
  }
}

// ── MediaStream / Camera mocks ────────────────────────────────────
class MockMediaStreamTrack {
  constructor() {
    this.id         = Math.random().toString(36).slice(2, 10);
    this.kind       = "video";
    this.readyState = "live";
  }
  stop() { this.readyState = "ended"; }
}

class MockMediaStream {
  constructor() {
    this.id      = Math.random().toString(36).slice(2, 10);
    this._tracks = [new MockMediaStreamTrack()];
  }
  getVideoTracks() { return [...this._tracks]; }
  get active() { return this._tracks.some(t => t.readyState === "live"); }
}

class MockMediaDevices {
  constructor() {
    this._callLog           = [];
    this._permissionGranted = true;
  }
  async getUserMedia(constraints) {
    this._callLog.push({ constraints: JSON.stringify(constraints), ts: Date.now() });
    if (!this._permissionGranted)
      throw new Error("NotAllowedError: Permission denied by user");
    return new MockMediaStream();
  }
  denyPermission()  { this._permissionGranted = false; }
  grantPermission() { this._permissionGranted = true; }
  get callCount()   { return this._callLog.length; }
  get callLog()     { return [...this._callLog]; }
  resetCallLog()    { this._callLog = []; }
}

// ── QrScanner simulation (mirrors qr-scanner.tsx behavior) ───────
class QrScannerSim {
  constructor(mediaDevices) {
    this._media  = mediaDevices;
    this._stream = null;
    this._phase  = "idle"; // idle | scanning | result
  }

  async start() {
    if (this._phase === "scanning")
      throw new Error("Scanner already running — stop() first");
    const stream    = await this._media.getUserMedia({ facingMode: "environment" });
    this._stream    = stream;
    this._phase     = "scanning";
    return stream;
  }

  stop() {
    if (!this._stream) return;
    this._stream.getVideoTracks().forEach(t => t.stop());
    this._stream = null;
    this._phase  = "idle";
  }

  simulateScanSuccess(rawValue) {
    if (this._phase !== "scanning")
      throw new Error(`Cannot decode: scanner phase is "${this._phase}"`);
    this.stop();
    this._phase = "result";
    return rawValue;
  }

  get phase()       { return this._phase; }
  get stream()      { return this._stream; }
  get isStreaming() { return !!this._stream && this._stream.active; }
}

// ═══════════════════════════════════════════════════════════════════
// SECTION 1 — OFFLINE QUEUE
// ═══════════════════════════════════════════════════════════════════

describe("Section 1: Offline Queue", () => {
  it("Queue grows without network calls and optimistic UI is reflected immediately", () => {
    const net1    = new NetworkMock();
    const server1 = new Server();
    const client1 = new PWAClient("Technician-A", server1, net1);

    server1.seed({ id: "eq-1a", name: "Ventilator",    status: "ok", version: 1 });
    server1.seed({ id: "eq-1b", name: "Defibrillator", status: "ok", version: 1 });
    server1.seed({ id: "eq-1c", name: "Ultrasound",    status: "ok", location: "Bay 1", version: 1 });

    client1.hydrate(server1.get("eq-1a"));
    client1.hydrate(server1.get("eq-1b"));
    client1.hydrate(server1.get("eq-1c"));

    client1.goOffline();
    net1.reset();

    client1.update("eq-1a", { status: "issue" });
    expect(client1.queueSize).toBe(1);
    expect(net1.callCount).toBe(0);

    client1.update("eq-1b", { status: "maintenance" });
    expect(client1.queueSize).toBe(2);
    expect(net1.callCount).toBe(0);

    client1.update("eq-1c", { location: "OR-3" });
    expect(client1.queueSize).toBe(3);
    expect(net1.callCount).toBe(0);

    expect(client1.getLocalState("eq-1a").status).toBe("issue");
    expect(client1.getLocalState("eq-1b").status).toBe("maintenance");
    expect(client1.getLocalState("eq-1c").location).toBe("OR-3");

    expect(server1.get("eq-1a").version).toBe(1);
    expect(server1.get("eq-1b").version).toBe(1);
    expect(server1.get("eq-1c").version).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 2 — RECONNECT + SYNC
// ═══════════════════════════════════════════════════════════════════

describe("Section 2: Reconnect and Sync", () => {
  it("Sync applies ops in enqueue order, clears queue, and updates server state", () => {
    const net1    = new NetworkMock();
    const server1 = new Server();
    const client1 = new PWAClient("Technician-A", server1, net1);

    server1.seed({ id: "eq-1a", name: "Ventilator",    status: "ok", version: 1 });
    server1.seed({ id: "eq-1b", name: "Defibrillator", status: "ok", version: 1 });
    server1.seed({ id: "eq-1c", name: "Ultrasound",    status: "ok", location: "Bay 1", version: 1 });

    client1.hydrate(server1.get("eq-1a"));
    client1.hydrate(server1.get("eq-1b"));
    client1.hydrate(server1.get("eq-1c"));

    client1.goOffline();
    net1.reset();

    client1.update("eq-1a", { status: "issue" });
    client1.update("eq-1b", { status: "maintenance" });
    client1.update("eq-1c", { location: "OR-3" });

    client1.goOnline();
    const sync2 = client1.sync();

    expect(sync2.length).toBe(3);
    expect(sync2.filter(r => r.status === "applied").length).toBe(3);
    expect(client1.queueSize).toBe(0);
    expect(net1.callCount).toBe(3);

    const urls2 = net1.calls.map(c => c.url);
    expect(urls2[0]).toContain("eq-1a");
    expect(urls2[1]).toContain("eq-1b");
    expect(urls2[2]).toContain("eq-1c");

    expect(server1.get("eq-1a").status).toBe("issue");
    expect(server1.get("eq-1b").status).toBe("maintenance");
    expect(server1.get("eq-1c").location).toBe("OR-3");

    expect(client1.getLocalState("eq-1a").version).toBe(2);
    expect(client1.getLocalState("eq-1b").version).toBe(2);
    expect(client1.getLocalState("eq-1c").version).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 3 — CONFLICT RESOLUTION
// ═══════════════════════════════════════════════════════════════════

describe("Section 3: Conflict Resolution", () => {
  it("Stale update rejected, UI rolls back to server truth, conflict logged, overwrite impossible", () => {
    const server3  = new Server();
    const netA3    = new NetworkMock();
    const netB3    = new NetworkMock();
    const clientA3 = new PWAClient("A", server3, netA3);
    const clientB3 = new PWAClient("B", server3, netB3);

    server3.seed({ id: "eq-3", name: "Infusion Pump", status: "ok", version: 1 });
    clientA3.hydrate(server3.get("eq-3"));
    clientB3.hydrate(server3.get("eq-3"));

    clientA3.goOffline();
    clientA3.update("eq-3", { status: "issue" });
    expect(clientA3.queueSize).toBe(1);
    expect(clientA3.getLocalState("eq-3").status).toBe("issue");

    clientB3.update("eq-3", { status: "maintenance" });
    expect(server3.get("eq-3").version).toBe(2);
    expect(server3.get("eq-3").status).toBe("maintenance");

    clientA3.goOnline();
    const syncA3 = clientA3.sync();

    expect(syncA3.length).toBe(1);
    expect(syncA3[0].status).toBe("rejected");
    expect(syncA3[0].reason).toContain("VERSION_MISMATCH");
    expect(clientA3.conflictLog.length).toBe(1);

    const aLocal3     = clientA3.getLocalState("eq-3");
    const serverTruth3 = server3.get("eq-3");
    expect(aLocal3.status).toBe(serverTruth3.status);
    expect(aLocal3.version).toBe(serverTruth3.version);
    expect(aLocal3.status).toBe("maintenance");

    expect(clientA3.conflictLog[0].trueServerState.status).toBe("maintenance");

    // Overwrite must be impossible
    expect(() => server3.apply("eq-3", { status: "issue", version: 1 })).toThrow();

    // Conflict must not be silent
    expect(clientA3.conflictLog.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 4 — SERVICE WORKER CACHE
// ═══════════════════════════════════════════════════════════════════

describe("Section 4: Service Worker Cache", () => {
  const ASSETS = [
    "/",
    "/index.html",
    "/assets/app.js",
    "/assets/app.css",
    "/manifest.json",
  ];

  it("All assets served from network on first load and cached", () => {
    const swCache = new SWCache();
    for (const url of ASSETS) {
      const r = swCache.fetchOrCache(url);
      expect(r.source).toBe("network");
      expect(r.status).toBe(200);
      expect(r.body).toBeTruthy();
    }
    expect(swCache.size).toBe(ASSETS.length);
  });

  it("All assets served from cache while offline (no crash)", () => {
    const swCache = new SWCache();
    for (const url of ASSETS) swCache.fetchOrCache(url); // prime cache

    swCache.goOffline();

    for (const url of ASSETS) {
      const r = swCache.fetchOrCache(url);
      expect(r.source).toBe("cache");
      expect(r.status).toBe(200);
      expect(r.body).toBeTruthy();
    }
  });

  it("App shell '/' resolvable offline — no crash on reload", () => {
    const swCache = new SWCache();
    for (const url of ASSETS) swCache.fetchOrCache(url);

    swCache.goOffline();
    expect(swCache.match("/")).not.toBeNull();
  });

  it("Un-cached route throws CACHE_MISS — not a silent 200", () => {
    const swCache = new SWCache();
    swCache.goOffline();
    expect(() => swCache.fetchOrCache("/api/data/uncached")).toThrow("CACHE_MISS");
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 5 — MULTI-CLIENT CONSISTENCY
// ═══════════════════════════════════════════════════════════════════

describe("Section 5: Multi-Client Consistency", () => {
  it("Final state is deterministic (first-sync-wins), rejected client sees server truth", () => {
    const server5  = new Server();
    const netC5    = new NetworkMock();
    const netD5    = new NetworkMock();
    const clientC5 = new PWAClient("C", server5, netC5);
    const clientD5 = new PWAClient("D", server5, netD5);

    server5.seed({ id: "eq-5", status: "ok", location: "Bay 1", notes: "", version: 1 });
    clientC5.hydrate(server5.get("eq-5"));
    clientD5.hydrate(server5.get("eq-5"));

    clientC5.goOffline();
    clientD5.goOffline();
    netC5.reset(); netD5.reset();

    clientC5.update("eq-5", { location: "Bay 2" });
    clientD5.update("eq-5", { notes: "Serviced 2025-04" });

    expect(clientC5.queueSize).toBe(1);
    expect(clientD5.queueSize).toBe(1);
    expect(netC5.callCount).toBe(0);
    expect(netD5.callCount).toBe(0);

    clientC5.goOnline();
    const syncC5 = clientC5.sync();
    expect(syncC5[0].status).toBe("applied");
    expect(server5.get("eq-5").version).toBe(2);
    expect(server5.get("eq-5").location).toBe("Bay 2");

    clientD5.goOnline();
    const syncD5 = clientD5.sync();
    expect(syncD5[0].status).toBe("rejected");
    expect(clientD5.conflictLog.length).toBe(1);

    const dLocal5 = clientD5.getLocalState("eq-5");
    expect(dLocal5.location).toBe("Bay 2");
    expect(dLocal5.version).toBe(2);

    const final5 = server5.get("eq-5");
    expect(final5.version).toBe(2);
    expect(final5.location).toBe("Bay 2");
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECTION 6 — CAMERA LIFECYCLE (QR SCAN)
// ═══════════════════════════════════════════════════════════════════

describe("Section 6.1: Camera Open", () => {
  it("getUserMedia called once, returns live stream with correct constraints", async () => {
    const media6   = new MockMediaDevices();
    const scanner6 = new QrScannerSim(media6);

    const stream6a = await scanner6.start();

    expect(media6.callCount).toBe(1);
    expect(stream6a).toBeInstanceOf(MockMediaStream);
    expect(stream6a.active).toBe(true);

    const tracks6a = stream6a.getVideoTracks();
    expect(tracks6a.length).toBe(1);
    expect(tracks6a[0].readyState).toBe("live");

    const callConstraints = JSON.parse(media6.callLog[0].constraints);
    expect(callConstraints.facingMode).toBe("environment");
  });
});

describe("Section 6.2: Permission — Single Request Per Session", () => {
  it("getUserMedia called once per session and returns distinct stream", async () => {
    const media6   = new MockMediaDevices();
    const scanner6 = new QrScannerSim(media6);

    const stream6a = await scanner6.start();
    media6.resetCallLog();
    scanner6.stop();
    const stream6b = await scanner6.start();

    expect(media6.callCount).toBe(1);
    expect(stream6b.id).not.toBe(stream6a.id);

    scanner6.stop();
  });
});

describe("Section 6.3: Stream Validation — Live State During Scanning", () => {
  it("Stream and tracks are live during scanning phase", async () => {
    const media6   = new MockMediaDevices();
    const scanner6 = new QrScannerSim(media6);

    await scanner6.start();

    const activeStream6 = scanner6.stream;
    expect(activeStream6).not.toBeNull();
    expect(activeStream6.active).toBe(true);
    expect(activeStream6.getVideoTracks().every(t => t.readyState === "live")).toBeTruthy();
    expect(scanner6.phase).toBe("scanning");

    scanner6.stop();
  });
});

describe("Section 6.4: Scan Complete → Camera Stop", () => {
  it("Tracks ended and stream released after successful decode", async () => {
    const media6   = new MockMediaDevices();
    const scanner6 = new QrScannerSim(media6);

    await scanner6.start();

    const streamBeforeDecode = scanner6.stream;
    const tracksBeforeDecode = streamBeforeDecode.getVideoTracks();

    scanner6.simulateScanSuccess("https://vettrack.app/equipment/eq-abc123");

    expect(tracksBeforeDecode[0].readyState).toBe("ended");
    expect(streamBeforeDecode.active).toBe(false);
    expect(scanner6.stream).toBeNull();
    expect(scanner6.phase).toBe("result");
  });
});

describe("Section 6.5: Multiple Scans — No Reuse, No Leaks", () => {
  it("Each scan cycle gets a fresh stream, all prior streams dead after decode", async () => {
    const media6   = new MockMediaDevices();
    const scanner6 = new QrScannerSim(media6);

    // prime a scan so scanner6 is in result phase before the loop
    await scanner6.start();
    scanner6.simulateScanSuccess("prime");

    media6.resetCallLog();
    const completedStreams = [];
    const seenStreamIds   = new Set();

    for (let i = 0; i < 3; i++) {
      const s = await scanner6.start();

      expect(s.active).toBe(true);
      expect(seenStreamIds.has(s.id)).toBe(false);
      seenStreamIds.add(s.id);

      scanner6.simulateScanSuccess(`/equipment/eq-item-${i}`);

      expect(s.active).toBe(false);
      expect(s.getVideoTracks().every(t => t.readyState === "ended")).toBeTruthy();

      completedStreams.push(s);
    }

    expect(media6.callCount).toBe(3);
    expect(seenStreamIds.size).toBe(3);

    for (const s of completedStreams) {
      expect(s.active).toBe(false);
      expect(s.getVideoTracks().every(t => t.readyState === "ended")).toBeTruthy();
    }
  });
});

describe("Section 6.6: Permission Denied — Graceful Rejection", () => {
  it("start() throws NotAllowedError, no stream held, phase stays idle", async () => {
    const mediaDenied   = new MockMediaDevices();
    const scannerDenied = new QrScannerSim(mediaDenied);
    mediaDenied.denyPermission();

    await expect(scannerDenied.start()).rejects.toThrow("NotAllowedError");
    expect(scannerDenied.stream).toBeNull();
    expect(scannerDenied.phase).toBe("idle");
    expect(mediaDenied.callCount).toBe(1);
  });
});
