/**
 * Canonical patient shape for integration mapping (Vendor X Phase C).
 * Keeps PHI fields explicit; adapters map vendor payloads here before ExternalPatient.
 */

export interface CanonicalPatientV1 {
  externalId: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  species?: string | null;
  /** RFC3339 timestamps from vendor when present */
  createdAt?: string | null;
  updatedAt?: string | null;
  /** Unknown vendor fields preserved for audit only — never promoted to canonical columns blindly */
  metadataRaw?: Record<string, unknown>;
}
