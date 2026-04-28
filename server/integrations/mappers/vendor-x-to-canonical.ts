/**
 * Vendor X REST → canonical → ExternalPatient boundary.
 */

import type { CanonicalPatientV1 } from "../contracts/canonical.v1.js";
import type { ExternalPatient } from "../types.js";

/** Documented Vendor X sandbox payload row (minimal public contract). */
export interface VendorXPatientApiRow extends Record<string, unknown> {
  id: string;
}

const KNOWN_KEYS = new Set([
  "id",
  "first_name",
  "firstName",
  "last_name",
  "lastName",
  "email",
  "phone",
  "species",
  "created_at",
  "createdAt",
  "updated_at",
  "updatedAt",
]);

export function mapVendorXRowToCanonical(row: VendorXPatientApiRow): CanonicalPatientV1 {
  const first =
    (typeof row.first_name === "string" ? row.first_name : null) ??
    (typeof row.firstName === "string" ? row.firstName : null);
  const last =
    (typeof row.last_name === "string" ? row.last_name : null) ??
    (typeof row.lastName === "string" ? row.lastName : null);
  const email = typeof row.email === "string" ? row.email : null;
  const phone = typeof row.phone === "string" ? row.phone : null;
  const species = typeof row.species === "string" ? row.species : null;
  const createdAt =
    (typeof row.created_at === "string" ? row.created_at : null) ??
    (typeof row.createdAt === "string" ? row.createdAt : null);
  const updatedAt =
    (typeof row.updated_at === "string" ? row.updated_at : null) ??
    (typeof row.updatedAt === "string" ? row.updatedAt : null);

  const raw: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (!KNOWN_KEYS.has(k)) raw[k] = v;
  }

  return {
    externalId: String(row.id),
    firstName: first,
    lastName: last,
    email,
    phone,
    species,
    createdAt,
    updatedAt,
    metadataRaw: Object.keys(raw).length ? raw : undefined,
  };
}

export function canonicalPatientToExternalPatient(c: CanonicalPatientV1): ExternalPatient {
  const parts = [c.firstName?.trim(), c.lastName?.trim()].filter(Boolean);
  const name =
    parts.join(" ").trim() ||
    (c.email?.trim() ?? "") ||
    (c.phone?.trim() ?? "") ||
    c.externalId;

  return {
    externalId: c.externalId,
    name,
    species: c.species ?? undefined,
    ownerPhone: c.phone ?? undefined,
    externalUpdatedAt: c.updatedAt ?? undefined,
    raw:
      c.metadataRaw && Object.keys(c.metadataRaw).length
        ? { ...c.metadataRaw, email: c.email ?? undefined }
        : c.email
          ? { email: c.email }
          : undefined,
  };
}

export function vendorXRowsToExternalPatients(rows: VendorXPatientApiRow[]): ExternalPatient[] {
  return rows.map((r) => canonicalPatientToExternalPatient(mapVendorXRowToCanonical(r)));
}
