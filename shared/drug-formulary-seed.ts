export type DrugDoseUnit = "mg_per_kg" | "mcg_per_kg" | "mEq_per_kg" | "tablet";

export interface SeededDrugFormularyEntry {
  name: string;
  /** Concentration in mg/mL (or mg/tablet for tablet-dosed drugs). */
  concentrationMgMl: number;
  /** Typical starting/standard dose in doseUnit. */
  standardDose: number;
  /** Minimum dose in doseUnit (optional, used for range display). */
  minDose?: number;
  /** Maximum dose in doseUnit (optional, used for range display). */
  maxDose?: number;
  doseUnit: DrugDoseUnit;
  /** Common administration routes (display only). */
  defaultRoute?: string;
}

export const SEEDED_FORMULARY: SeededDrugFormularyEntry[] = [
  // ── Sedation / Anesthesia Induction ─────────────────────────────────────────
  { name: "Propofol",         concentrationMgMl: 10,    standardDose: 4,      minDose: 2,      maxDose: 6,      doseUnit: "mg_per_kg",  defaultRoute: "IV" },
  { name: "Ketamine",         concentrationMgMl: 100,   standardDose: 3.5,    minDose: 2,      maxDose: 5,      doseUnit: "mg_per_kg",  defaultRoute: "IV/IM" },
  { name: "Diazepam",         concentrationMgMl: 5,     standardDose: 0.35,   minDose: 0.25,   maxDose: 0.5,    doseUnit: "mg_per_kg",  defaultRoute: "IV" },
  { name: "Midazolam",        concentrationMgMl: 5,     standardDose: 0.3,    minDose: 0.1,    maxDose: 0.5,    doseUnit: "mg_per_kg",  defaultRoute: "IV/IM" },

  // ── Opioid Analgesia ─────────────────────────────────────────────────────────
  { name: "Methadone",        concentrationMgMl: 10,    standardDose: 0.3,    minDose: 0.1,    maxDose: 0.5,    doseUnit: "mg_per_kg",  defaultRoute: "IV/IM/SC" },
  { name: "Buprenorphine",    concentrationMgMl: 0.3,   standardDose: 0.02,   minDose: 0.01,   maxDose: 0.03,   doseUnit: "mg_per_kg",  defaultRoute: "IV/IM" },
  { name: "Butorphanol",      concentrationMgMl: 10,    standardDose: 0.25,   minDose: 0.1,    maxDose: 0.4,    doseUnit: "mg_per_kg",  defaultRoute: "IV/IM/SC" },
  { name: "Morphine",         concentrationMgMl: 10,    standardDose: 0.2,    minDose: 0.1,    maxDose: 0.5,    doseUnit: "mg_per_kg",  defaultRoute: "IV/IM/SC" },

  // ── Sedation / Pre-medication ────────────────────────────────────────────────
  { name: "Dexmedetomidine",  concentrationMgMl: 0.5,   standardDose: 0.005,  minDose: 0.001,  maxDose: 0.01,   doseUnit: "mg_per_kg",  defaultRoute: "IV/IM" },
  { name: "Acepromazine",     concentrationMgMl: 10,    standardDose: 0.05,   minDose: 0.01,   maxDose: 0.1,    doseUnit: "mg_per_kg",  defaultRoute: "IV/IM/SC" },
  { name: "Dexdomitor",       concentrationMgMl: 0.5,   standardDose: 5,      minDose: 1,      maxDose: 10,     doseUnit: "mcg_per_kg", defaultRoute: "IV/IM" },

  // ── Local Anesthesia ─────────────────────────────────────────────────────────
  { name: "Bupivacaine",      concentrationMgMl: 5,     standardDose: 1.5,    minDose: 1.0,    maxDose: 2.0,    doseUnit: "mg_per_kg",  defaultRoute: "Local/Infiltration" },
  { name: "Lidocaine",        concentrationMgMl: 20,    standardDose: 2,      minDose: 2,      maxDose: 8,      doseUnit: "mg_per_kg",  defaultRoute: "IV/Local" },

  // ── NSAIDs / Anti-inflammatory ───────────────────────────────────────────────
  { name: "Meloxicam",        concentrationMgMl: 5,     standardDose: 0.2,    minDose: 0.1,    maxDose: 0.2,    doseUnit: "mg_per_kg",  defaultRoute: "SC/PO" },
  { name: "Carprofen",        concentrationMgMl: 50,    standardDose: 3.3,    minDose: 2.2,    maxDose: 4.4,    doseUnit: "mg_per_kg",  defaultRoute: "PO/SC" },
  { name: "Dexamethasone",    concentrationMgMl: 2,     standardDose: 0.1,    minDose: 0.1,    maxDose: 0.2,    doseUnit: "mg_per_kg",  defaultRoute: "IV/IM" },

  // ── Steroids ─────────────────────────────────────────────────────────────────
  { name: "Prednisolone",     concentrationMgMl: 5,     standardDose: 1,      minDose: 0.5,    maxDose: 2.2,    doseUnit: "mg_per_kg",  defaultRoute: "PO" },
  { name: "Prednisone",       concentrationMgMl: 5,     standardDose: 1,      minDose: 0.5,    maxDose: 2.2,    doseUnit: "mg_per_kg",  defaultRoute: "PO" },

  // ── Oral Analgesics / Behavioral ─────────────────────────────────────────────
  { name: "Gabapentin",       concentrationMgMl: 100,   standardDose: 10,     minDose: 5,      maxDose: 20,     doseUnit: "mg_per_kg",  defaultRoute: "PO" },
  { name: "Trazodone",        concentrationMgMl: 50,    standardDose: 0.14,   minDose: 0.06,   maxDose: 0.2,    doseUnit: "tablet",     defaultRoute: "PO" },

  // ── Autonomic / Emergency ────────────────────────────────────────────────────
  { name: "Atropine",         concentrationMgMl: 0.6,   standardDose: 0.03,   minDose: 0.02,   maxDose: 0.04,   doseUnit: "mg_per_kg",  defaultRoute: "IV/IM/SC" },
  { name: "Epinephrine",      concentrationMgMl: 1,     standardDose: 0.01,   minDose: 0.01,   maxDose: 0.1,    doseUnit: "mg_per_kg",  defaultRoute: "IV" },
  { name: "Apomorphine",      concentrationMgMl: 10,    standardDose: 0.03,   minDose: 0.03,   maxDose: 0.03,   doseUnit: "mg_per_kg",  defaultRoute: "IV" },

  // ── Diuretics / Cardiac ──────────────────────────────────────────────────────
  { name: "Furosemide",       concentrationMgMl: 10,    standardDose: 2,      minDose: 1,      maxDose: 4,      doseUnit: "mg_per_kg",  defaultRoute: "IV/IM" },
  { name: "Amlodipine",       concentrationMgMl: 5,     standardDose: 0.3,    minDose: 0.1,    maxDose: 0.5,    doseUnit: "tablet",     defaultRoute: "PO" },
  { name: "Pimobendan",       concentrationMgMl: 2.5,   standardDose: 0.1,    minDose: 0.1,    maxDose: 0.12,   doseUnit: "tablet",     defaultRoute: "PO" },
  { name: "Digoxin",          concentrationMgMl: 0.25,  standardDose: 0.004,  minDose: 0.0025, maxDose: 0.005,  doseUnit: "tablet",     defaultRoute: "PO" },

  // ── Vasopressors / CRI ───────────────────────────────────────────────────────
  // Doses are typical starting rates (mcg/kg/min); use as reference — CRI protocol applies.
  { name: "Dobutamine",       concentrationMgMl: 12.5,  standardDose: 5,      minDose: 2,      maxDose: 20,     doseUnit: "mcg_per_kg", defaultRoute: "IV (CRI)" },
  { name: "Dopamine",         concentrationMgMl: 40,    standardDose: 5,      minDose: 2,      maxDose: 15,     doseUnit: "mcg_per_kg", defaultRoute: "IV (CRI)" },
  { name: "Norepinephrine",   concentrationMgMl: 1,     standardDose: 0.5,    minDose: 0.1,    maxDose: 2,      doseUnit: "mcg_per_kg", defaultRoute: "IV (CRI)" },

  // ── Hemostasis ───────────────────────────────────────────────────────────────
  { name: "Tranexamic Acid",  concentrationMgMl: 100,   standardDose: 12.5,   minDose: 10,     maxDose: 15,     doseUnit: "mg_per_kg",  defaultRoute: "IV" },

  // ── Antibiotics ──────────────────────────────────────────────────────────────
  { name: "Cefazolin",        concentrationMgMl: 100,   standardDose: 22,     minDose: 20,     maxDose: 30,     doseUnit: "mg_per_kg",  defaultRoute: "IV/IM" },
  { name: "Ampicillin",       concentrationMgMl: 100,   standardDose: 22,     minDose: 20,     maxDose: 30,     doseUnit: "mg_per_kg",  defaultRoute: "IV/IM" },
  { name: "Enrofloxacin",     concentrationMgMl: 22.7,  standardDose: 5,      minDose: 5,      maxDose: 20,     doseUnit: "mg_per_kg",  defaultRoute: "IV/PO" },
  { name: "Amoxicillin",      concentrationMgMl: 50,    standardDose: 15,     minDose: 10,     maxDose: 22,     doseUnit: "mg_per_kg",  defaultRoute: "PO" },
  { name: "Clindamycin",      concentrationMgMl: 25,    standardDose: 8,      minDose: 5,      maxDose: 11,     doseUnit: "mg_per_kg",  defaultRoute: "PO/IV" },
  { name: "Metronidazole",    concentrationMgMl: 5,     standardDose: 10,     minDose: 7.5,    maxDose: 15,     doseUnit: "mg_per_kg",  defaultRoute: "PO/IV" },
  { name: "Doxycycline",      concentrationMgMl: 10,    standardDose: 7.5,    minDose: 5,      maxDose: 10,     doseUnit: "mg_per_kg",  defaultRoute: "PO/IV" },
  { name: "Cephalexin",       concentrationMgMl: 25,    standardDose: 25,     minDose: 22,     maxDose: 30,     doseUnit: "mg_per_kg",  defaultRoute: "PO" },
  { name: "Meropenem",        concentrationMgMl: 50,    standardDose: 8,      minDose: 8,      maxDose: 24,     doseUnit: "mg_per_kg",  defaultRoute: "IV/SC" },
  { name: "Gentamicin",       concentrationMgMl: 50,    standardDose: 6,      minDose: 6,      maxDose: 9,      doseUnit: "mg_per_kg",  defaultRoute: "IV/SC" },
  { name: "Augmentin 5% 50mg/ml", concentrationMgMl: 50, standardDose: 15,    minDose: 10,     maxDose: 50,     doseUnit: "mg_per_kg",  defaultRoute: "IV/SC" },
  { name: "Cisapride tab 2.5", concentrationMgMl: 2.5, standardDose: 1,      minDose: 0.5,    maxDose: 2,      doseUnit: "tablet",     defaultRoute: "PO" },
  { name: "Cisapride syrup 1mg/ml", concentrationMgMl: 1, standardDose: 0.25, minDose: 0.1, maxDose: 0.5, doseUnit: "mg_per_kg", defaultRoute: "PO" },
  { name: "Diphenhydramine",  concentrationMgMl: 10,    standardDose: 2,      minDose: 1,      maxDose: 4,      doseUnit: "mg_per_kg",  defaultRoute: "IV/IM" },

  // ── Anti-emetics / GI ────────────────────────────────────────────────────────
  { name: "Maropitant",       concentrationMgMl: 10,    standardDose: 1,      minDose: 1,      maxDose: 2,      doseUnit: "mg_per_kg",  defaultRoute: "SC/IV" },
  { name: "Maropitant (PO)",  concentrationMgMl: 10,    standardDose: 2,      minDose: 2,      maxDose: 2,      doseUnit: "mg_per_kg",  defaultRoute: "PO" },
  { name: "Cerenia",          concentrationMgMl: 10,    standardDose: 1,      minDose: 1,      maxDose: 2,      doseUnit: "mg_per_kg",  defaultRoute: "SC/IV" },
  { name: "Ondansetron",      concentrationMgMl: 2,     standardDose: 0.3,    minDose: 0.1,    maxDose: 0.5,    doseUnit: "mg_per_kg",  defaultRoute: "IV/PO" },
  { name: "Metoclopramide",   concentrationMgMl: 5,     standardDose: 0.35,   minDose: 0.2,    maxDose: 0.5,    doseUnit: "mg_per_kg",  defaultRoute: "IV/PO" },
  { name: "Pantoprazole",     concentrationMgMl: 4,     standardDose: 1,      minDose: 1,      maxDose: 1,      doseUnit: "mg_per_kg",  defaultRoute: "IV" },
  { name: "Omeprazole",       concentrationMgMl: 20,    standardDose: 0.0375, minDose: 0.025,  maxDose: 0.05,   doseUnit: "tablet",     defaultRoute: "PO" },
  { name: "Famotidine",       concentrationMgMl: 10,    standardDose: 0.5,    minDose: 0.5,    maxDose: 1,      doseUnit: "mg_per_kg",  defaultRoute: "IV/PO" },
  { name: "Sucralfate",       concentrationMgMl: 1000,  standardDose: 0.05,   minDose: 0.025,  maxDose: 0.1,    doseUnit: "tablet",     defaultRoute: "PO" },
  { name: "Lactulose",        concentrationMgMl: 667,   standardDose: 333.5,  minDose: 333.5,  maxDose: 333.5,  doseUnit: "mg_per_kg",  defaultRoute: "PO" },
  { name: "Optalgin",         concentrationMgMl: 500,   standardDose: 25,     minDose: 10,     maxDose: 50,     doseUnit: "mg_per_kg",  defaultRoute: "IV/IM" },
  { name: "Pramin",           concentrationMgMl: 5,     standardDose: 0.5,    minDose: 0.2,    maxDose: 0.5,    doseUnit: "mg_per_kg",  defaultRoute: "IV/PO" },

  // ── Neurological ─────────────────────────────────────────────────────────────
  { name: "Phenobarbital",    concentrationMgMl: 65,    standardDose: 2,      minDose: 2,      maxDose: 5,      doseUnit: "mg_per_kg",  defaultRoute: "IV/PO" },
  { name: "Levetiracetam",    concentrationMgMl: 100,   standardDose: 20,     minDose: 20,     maxDose: 60,     doseUnit: "mg_per_kg",  defaultRoute: "IV/PO" },
  { name: "Mannitol",         concentrationMgMl: 200,   standardDose: 500,    minDose: 250,    maxDose: 1000,   doseUnit: "mg_per_kg",  defaultRoute: "IV (Slow)" },
  { name: "Aminophylline",    concentrationMgMl: 25,    standardDose: 5,      minDose: 5,      maxDose: 10,     doseUnit: "mg_per_kg",  defaultRoute: "IV/PO" },

  // ── Endocrine ────────────────────────────────────────────────────────────────
  { name: "Insulin Regular",  concentrationMgMl: 100,   standardDose: 0.1,    minDose: 0.1,    maxDose: 0.2,    doseUnit: "mg_per_kg",  defaultRoute: "IV/IM/SC" },
  { name: "Levothyroxine",    concentrationMgMl: 0.1,   standardDose: 0.2,    minDose: 0.2,    maxDose: 0.2,    doseUnit: "tablet",     defaultRoute: "PO" },

  // ── Fluids / Electrolytes ────────────────────────────────────────────────────
  { name: "Hypertonic Saline 7.2%", concentrationMgMl: 72, standardDose: 288, minDose: 216, maxDose: 360,    doseUnit: "mg_per_kg",  defaultRoute: "IV (Slow)" },
];
