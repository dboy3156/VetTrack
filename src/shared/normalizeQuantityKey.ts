/** Stable key: `${recordNumber}__${normalizedDrugName}` — server approve + SPA must match. */
export function normalizeQuantityKey(recordNumber: string, drugName: string): string {
  const rn = String(recordNumber).trim();
  const dn = drugName.trim().toLowerCase().replace(/\s+/g, " ");
  return `${rn}__${dn}`;
}
