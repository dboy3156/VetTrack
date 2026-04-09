import { useRef, useCallback, useEffect } from "react";

/**
 * useQRScanner — stable scan callback with cooldown + dedup gate.
 *
 * Both onScan and cooldownMs are stored in refs so the internal useEffect
 * has ZERO dependencies and never re-subscribes, eliminating the infinite
 * re-render pattern that plagues scanner components.
 *
 * Protection layers:
 *   1. Cooldown gate  — ignores any scan fired within `cooldownMs` of the last accepted scan.
 *   2. Dedup gate     — ignores an identical assetId fired within the cooldown window.
 *
 * Usage:
 *   const { triggerScan } = useQRScanner((id) => navigate(`/equipment/${id}`), 1500);
 *   <button onClick={() => triggerScan("IP-03")} />
 */
export function useQRScanner(
  onScan: (assetId: string) => void,
  cooldownMs: number = 1500,
) {
  const onScanRef   = useRef(onScan);
  const cooldownRef = useRef(cooldownMs);
  const lastAssetRef = useRef<string | null>(null);
  const lastTimeRef  = useRef<number>(0);

  // Keep refs current on every render — no extra renders triggered.
  useEffect(() => { onScanRef.current = onScan; });
  useEffect(() => { cooldownRef.current = cooldownMs; });

  /**
   * triggerScan — call this from a button click or a real QR decode callback.
   * Stable reference (useCallback with empty deps) — safe to pass as a prop
   * or add to a useEffect dependency array without causing re-renders.
   */
  const triggerScan = useCallback((assetId: string) => {
    const now     = Date.now();
    const elapsed = now - lastTimeRef.current;
    const hot     = elapsed < cooldownRef.current;

    // Dedup: same asset re-fired while still within cooldown → silent drop.
    if (hot && lastAssetRef.current === assetId) return;

    // Cooldown gate: any scan fired while still cooling down → silent drop.
    if (hot) return;

    lastAssetRef.current = assetId;
    lastTimeRef.current  = now;
    onScanRef.current(assetId);
  }, []); // intentionally empty — refs keep values current

  return { triggerScan };
}
