import { describe, it, expect, vi, beforeEach } from "vitest";
import { createErModeResolver } from "../server/lib/er-mode.js";
import type { ErModeState, ErModeDbFetcher } from "../server/lib/er-mode.js";

function makeFetcher(stateMap: Record<string, ErModeState | null>): ErModeDbFetcher {
  return async (clinicId) => stateMap[clinicId] ?? null;
}

beforeEach(() => {
  delete process.env.ER_MODE_DEFAULT;
});

describe("getClinicErModeState", () => {
  it("returns disabled by default when DB returns null and no env set", async () => {
    const { getClinicErModeState } = createErModeResolver(makeFetcher({}));
    const state = await getClinicErModeState("clinic-1");
    expect(state).toBe("disabled");
  });

  it("returns DB value when present", async () => {
    const { getClinicErModeState } = createErModeResolver(makeFetcher({ "clinic-1": "enforced" }));
    const state = await getClinicErModeState("clinic-1");
    expect(state).toBe("enforced");
  });

  it("returns ER_MODE_DEFAULT env when DB returns null", async () => {
    process.env.ER_MODE_DEFAULT = "preview";
    const { getClinicErModeState } = createErModeResolver(makeFetcher({}));
    const state = await getClinicErModeState("clinic-1");
    expect(state).toBe("preview");
  });

  it("DB value overrides ER_MODE_DEFAULT env", async () => {
    process.env.ER_MODE_DEFAULT = "preview";
    const { getClinicErModeState } = createErModeResolver(makeFetcher({ "clinic-1": "enforced" }));
    const state = await getClinicErModeState("clinic-1");
    expect(state).toBe("enforced");
  });

  it("caches result: second call does not invoke fetcher again", async () => {
    const fetcher = vi.fn(makeFetcher({ "clinic-1": "preview" }));
    const { getClinicErModeState } = createErModeResolver(fetcher);
    await getClinicErModeState("clinic-1");
    await getClinicErModeState("clinic-1");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("invalidateErModeCache forces fresh fetch on next call", async () => {
    const fetcher = vi.fn(makeFetcher({ "clinic-1": "preview" }));
    const { getClinicErModeState, invalidateErModeCache } = createErModeResolver(fetcher);
    await getClinicErModeState("clinic-1");
    invalidateErModeCache("clinic-1");
    await getClinicErModeState("clinic-1");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("different clinics have separate cache entries", async () => {
    const fetcher = vi.fn(makeFetcher({ "clinic-a": "preview", "clinic-b": "enforced" }));
    const { getClinicErModeState } = createErModeResolver(fetcher);
    const a = await getClinicErModeState("clinic-a");
    const b = await getClinicErModeState("clinic-b");
    expect(a).toBe("preview");
    expect(b).toBe("enforced");
  });
});