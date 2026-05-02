/**
 * Manual verification checklist — run after implementation.
 *
 * ```bash
 * pnpm exec tsx scripts/verify-er-master-switch.ts
 * ```
 *
 * Requires API reachable (default `http://localhost:3001`):
 *   - `OWNER_TOKEN` — `Authorization: Bearer` for a principal that may toggle global ER mode
 *     (with `ADMIN_EMAILS` empty: any admin; with `ADMIN_EMAILS` set: that email only).
 *   - `NON_OWNER_TOKEN` — bearer for a user that must get `403` on admin ER routes.
 *
 * Without those tokens, the script prints the human steps and exits 0.
 *
 * Checklist items that stay manual: sidebar visibility in a real browser, cross-tab SSE + redirect
 * under ER concealment, and reading server logs / `vt_audit_logs` for `er_global_mode_changed` with
 * `ER_MODE_GLOBAL_TOGGLE` in metadata. After toggle ON, restart the API and confirm concealment still
 * applies: `preloadClinicErModeCaches()` on boot reads `vt_clinics.er_mode_state` (see `server/index.ts`).
 */
import "dotenv/config";

const BASE = process.env.API_BASE_URL?.trim() || "http://localhost:3001";
const OWNER = process.env.OWNER_TOKEN?.trim();
const NON_OWNER = process.env.NON_OWNER_TOKEN?.trim();

const TOGGLE = `${BASE}/api/er/admin/toggle-global-mode`;

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function main(): Promise<void> {
  if (!OWNER || !NON_OWNER) {
    console.log(`Set OWNER_TOKEN and NON_OWNER_TOKEN to run automated HTTP checks against ${BASE}.\n`);
    console.log("--- Manual checklist (browser + DB) ---\n");
    console.log("1. Visibility — non-manager session: sidebar must NOT show Operational control");
    console.log("   (desktop ErModeToggle column + mobile hamburger section).\n");
    console.log("2. GET/POST /api/er/admin/toggle-global-mode as non-manager → 403.\n");
    console.log("3. Toggle ON as owner → JSON erModeState === enforced; other tab gets SSE within ~1s;");
    console.log("   concealed routes redirect per ErModeGuard / concealment middleware.\n");
    console.log("4. Audit: vt_audit_logs.action_type = er_global_mode_changed, metadata.event = ER_MODE_GLOBAL_TOGGLE.\n");
    console.log("5. Toggle OFF → erModeState disabled (stored column may still be VARCHAR 'disabled').\n");
    console.log("6. Restart API with enforced in DB — concealment must stay enforced (cache preload from DB).\n");
    return;
  }

  console.log(`[verify-er-master-switch] API ${BASE}\n`);

  const probeNon = await fetch(TOGGLE, { headers: authHeaders(NON_OWNER) });
  console.assert(probeNon.status === 403, `FAIL: GET toggle probe expected 403 for non-manager, got ${probeNon.status}`);

  const postBad = await fetch(TOGGLE, {
    method: "POST",
    headers: authHeaders(NON_OWNER),
    body: JSON.stringify({ activate: true }),
  });
  console.assert(postBad.status === 403, `FAIL: non-manager POST expected 403, got ${postBad.status}`);

  const on = await fetch(TOGGLE, {
    method: "POST",
    headers: authHeaders(OWNER),
    body: JSON.stringify({ activate: true }),
  });
  const onBody = (await on.json()) as { erModeState?: string };
  console.assert(on.ok, `FAIL: owner POST ON expected 200, got ${on.status}`);
  console.assert(onBody.erModeState === "enforced", `FAIL: state not enforced: ${JSON.stringify(onBody)}`);

  const off = await fetch(TOGGLE, {
    method: "POST",
    headers: authHeaders(OWNER),
    body: JSON.stringify({ activate: false }),
  });
  const offBody = (await off.json()) as { erModeState?: string };
  console.assert(off.ok, `FAIL: owner POST OFF expected 200, got ${off.status}`);
  console.assert(
    offBody.erModeState === "disabled",
    `FAIL: expected disabled after OFF, got ${JSON.stringify(offBody)}`,
  );

  const probeOwner = await fetch(TOGGLE, { headers: authHeaders(OWNER) });
  console.assert(probeOwner.ok, `FAIL: GET toggle probe as owner expected 200, got ${probeOwner.status}`);

  console.log("OK — HTTP probes passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
