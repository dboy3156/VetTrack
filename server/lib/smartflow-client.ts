export interface SmartflowPatientRow {
  externalId: string;
  animalName: string;
  species: string | null;
  roomExternalKey: string;
  status: "active" | "discharged";
}

export interface SmartflowClient {
  fetchActivePatients(clinicId: string): Promise<SmartflowPatientRow[]>;
}

/** Deterministic mock data for development — replace with HTTP client when credentials exist. */
export class MockSmartflowClient implements SmartflowClient {
  async fetchActivePatients(_clinicId: string): Promise<SmartflowPatientRow[]> {
    return [
      {
        externalId: "sf-mock-1",
        animalName: "מוק חתול",
        species: "cat",
        roomExternalKey: "ICU-1",
        status: "active",
      },
    ];
  }
}

export function createSmartflowClient(): SmartflowClient {
  const driver = (process.env.SMARTFLOW_DRIVER ?? "mock").trim().toLowerCase();
  if (driver === "http") {
    console.warn("[smartflow] SMARTFLOW_DRIVER=http not implemented — using mock");
  }
  return new MockSmartflowClient();
}
