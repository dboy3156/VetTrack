export interface SmartflowPatientRow {
  externalId: string;
  animalName: string;
  species: string | null;
  roomExternalKey: string;
  status: "active" | "discharged";
  /** Patient weight in kg, if reported by SmartFlow. Only written to DB when positive and finite. */
  weightKg?: number;
}

export interface SmartflowClient {
  fetchActivePatients(clinicId: string): Promise<SmartflowPatientRow[]>;
}

/** Deterministic mock data for development and testing. */
export class MockSmartflowClient implements SmartflowClient {
  async fetchActivePatients(_clinicId: string): Promise<SmartflowPatientRow[]> {
    return [
      {
        externalId: "sf-mock-1",
        animalName: "מוק חתול",
        species: "cat",
        roomExternalKey: "ICU-1",
        status: "active",
        weightKg: 4.2,
      },
    ];
  }
}

/**
 * HTTP client for the real SmartFlow API.
 * Requires SMARTFLOW_API_URL and SMARTFLOW_API_KEY environment variables.
 *
 * The API is expected to return an array of patient objects. Field names are
 * normalised from both camelCase and snake_case variants to handle API
 * versioning differences.
 */
export class HttpSmartflowClient implements SmartflowClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
  }

  async fetchActivePatients(clinicId: string): Promise<SmartflowPatientRow[]> {
    const url = `${this.baseUrl}/hospitalized`;
    const res = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "X-Clinic-Id": clinicId,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) {
      throw new Error(`[smartflow] HTTP ${res.status} ${res.statusText} from ${url}`);
    }
    const data = (await res.json()) as unknown[];
    return data.map((item): SmartflowPatientRow => {
      const p = item as Record<string, unknown>;
      const rawWeight = p.weightKg ?? p.weight_kg ?? p.weight;
      const weightKg =
        typeof rawWeight === "number" && Number.isFinite(rawWeight) && rawWeight > 0
          ? rawWeight
          : undefined;
      return {
        externalId: String(p.externalId ?? p.external_id ?? p.id ?? ""),
        animalName: String(p.animalName ?? p.animal_name ?? p.name ?? ""),
        species: typeof p.species === "string" ? p.species : null,
        roomExternalKey: String(p.roomExternalKey ?? p.room_key ?? p.roomKey ?? ""),
        status: p.status === "discharged" ? "discharged" : "active",
        weightKg,
      };
    });
  }
}

export function createSmartflowClient(): SmartflowClient {
  const driver = (process.env.SMARTFLOW_DRIVER ?? "mock").trim().toLowerCase();
  if (driver === "http") {
    const baseUrl = process.env.SMARTFLOW_API_URL?.trim();
    const apiKey = process.env.SMARTFLOW_API_KEY?.trim();
    if (baseUrl && apiKey) {
      return new HttpSmartflowClient(baseUrl, apiKey);
    }
    console.warn(
      "[smartflow] SMARTFLOW_DRIVER=http but SMARTFLOW_API_URL or SMARTFLOW_API_KEY is not set — falling back to mock",
    );
  }
  return new MockSmartflowClient();
}
