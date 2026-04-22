export type DrugDoseUnit = "mg_per_kg" | "mcg_per_kg" | "mEq_per_kg" | "tablet";

export interface SeededDrugFormularyEntry {
  name: string;
  /** INN / active ingredient; composite uniqueness key with {@link concentrationMgMl}. */
  genericName: string;
  brandNames?: string[];
  targetSpecies?: string[];
  category?: string;
  dosageNotes?: string;
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
  /** Physical packaging unit type — drives unit label in forecast output and email.
   *  Leave undefined for ampoules (engine defaults to "אמפולות").
   *  Values: "vial" | "tablet" | "capsule" | "bag" | "syringe" */
  unitType?: string;
}

export const SEEDED_FORMULARY: SeededDrugFormularyEntry[] = [
  // ── Sedation / Anesthesia Induction ─────────────────────────────────────────
  { name: "Propofol", genericName: "Propofol",         concentrationMgMl: 10,    standardDose: 4,      minDose: 2,      maxDose: 6,      doseUnit: "mg_per_kg",  defaultRoute: "IV",          unitType: "vial" },
  { name: "Ketamine", genericName: "Ketamine",         concentrationMgMl: 100,   standardDose: 3.5,    minDose: 2,      maxDose: 5,      doseUnit: "mg_per_kg",  defaultRoute: "IV/IM",       unitType: "vial" },
  { name: "Diazepam", genericName: "Diazepam",         concentrationMgMl: 5,     standardDose: 0.35,   minDose: 0.25,   maxDose: 0.5,    doseUnit: "mg_per_kg",  defaultRoute: "IV" },
  { name: "Midazolam", genericName: "Midazolam",        concentrationMgMl: 5,     standardDose: 0.3,    minDose: 0.1,    maxDose: 0.5,    doseUnit: "mg_per_kg",  defaultRoute: "IV/IM" },

  // ── Opioid Analgesia ─────────────────────────────────────────────────────────
  { name: "Methadone", genericName: "Methadone",        concentrationMgMl: 10,    standardDose: 0.3,    minDose: 0.1,    maxDose: 0.5,    doseUnit: "mg_per_kg",  defaultRoute: "IV/IM/SC" },
  { name: "Buprenorphine", genericName: "Buprenorphine",    concentrationMgMl: 0.3,   standardDose: 0.02,   minDose: 0.01,   maxDose: 0.03,   doseUnit: "mg_per_kg",  defaultRoute: "IV/IM" },
  { name: "Butorphanol", genericName: "Butorphanol",      concentrationMgMl: 10,    standardDose: 0.25,   minDose: 0.1,    maxDose: 0.4,    doseUnit: "mg_per_kg",  defaultRoute: "IV/IM/SC",    unitType: "vial" },
  { name: "Morphine", genericName: "Morphine",         concentrationMgMl: 10,    standardDose: 0.2,    minDose: 0.1,    maxDose: 0.5,    doseUnit: "mg_per_kg",  defaultRoute: "IV/IM/SC" },

  // ── Sedation / Pre-medication ────────────────────────────────────────────────
  { name: "Dexmedetomidine", genericName: "Dexmedetomidine", brandNames: ["Dexdomitor"], concentrationMgMl: 0.5,   standardDose: 0.005,  minDose: 0.001,  maxDose: 0.01,   doseUnit: "mg_per_kg",  defaultRoute: "IV/IM",       unitType: "vial" },
  { name: "Acepromazine", genericName: "Acepromazine",     concentrationMgMl: 10,    standardDose: 0.05,   minDose: 0.01,   maxDose: 0.1,    doseUnit: "mg_per_kg",  defaultRoute: "IV/IM/SC",    unitType: "vial" },

  // ── Local Anesthesia ─────────────────────────────────────────────────────────
  { name: "Bupivacaine", genericName: "Bupivacaine",      concentrationMgMl: 5,     standardDose: 1.5,    minDose: 1.0,    maxDose: 2.0,    doseUnit: "mg_per_kg",  defaultRoute: "Local/Infiltration" },
  { name: "Lidocaine", genericName: "Lidocaine",        concentrationMgMl: 20,    standardDose: 2,      minDose: 2,      maxDose: 8,      doseUnit: "mg_per_kg",  defaultRoute: "IV/Local" },

  // ── NSAIDs / Anti-inflammatory ───────────────────────────────────────────────
  { name: "Meloxicam", genericName: "Meloxicam",        concentrationMgMl: 5,     standardDose: 0.2,    minDose: 0.1,    maxDose: 0.2,    doseUnit: "mg_per_kg",  defaultRoute: "SC/PO" },
  { name: "Carprofen", genericName: "Carprofen",        concentrationMgMl: 50,    standardDose: 3.3,    minDose: 2.2,    maxDose: 4.4,    doseUnit: "mg_per_kg",  defaultRoute: "PO/SC" },
  { name: "Dexamethasone", genericName: "Dexamethasone",    concentrationMgMl: 2,     standardDose: 0.1,    minDose: 0.1,    maxDose: 0.2,    doseUnit: "mg_per_kg",  defaultRoute: "IV/IM" },

  // ── Steroids ─────────────────────────────────────────────────────────────────
  { name: "Prednisolone", genericName: "Prednisolone",     concentrationMgMl: 5,     standardDose: 1,      minDose: 0.5,    maxDose: 2.2,    doseUnit: "mg_per_kg",  defaultRoute: "PO",          unitType: "tablet" },
  { name: "Prednisone", genericName: "Prednisone",       concentrationMgMl: 5,     standardDose: 1,      minDose: 0.5,    maxDose: 2.2,    doseUnit: "mg_per_kg",  defaultRoute: "PO",          unitType: "tablet" },

  // ── Oral Analgesics / Behavioral ─────────────────────────────────────────────
  { name: "Gabapentin", genericName: "Gabapentin",       concentrationMgMl: 100,   standardDose: 10,     minDose: 5,      maxDose: 20,     doseUnit: "mg_per_kg",  defaultRoute: "PO",          unitType: "capsule" },
  { name: "Trazodone", genericName: "Trazodone",        concentrationMgMl: 50,    standardDose: 0.14,   minDose: 0.06,   maxDose: 0.2,    doseUnit: "tablet",     defaultRoute: "PO",          unitType: "tablet" },

  // ── Autonomic / Emergency ────────────────────────────────────────────────────
  { name: "Atropine", genericName: "Atropine",         concentrationMgMl: 0.6,   standardDose: 0.03,   minDose: 0.02,   maxDose: 0.04,   doseUnit: "mg_per_kg",  defaultRoute: "IV/IM/SC" },
  { name: "Epinephrine", genericName: "Epinephrine",      concentrationMgMl: 1,     standardDose: 0.01,   minDose: 0.01,   maxDose: 0.1,    doseUnit: "mg_per_kg",  defaultRoute: "IV" },
  { name: "Apomorphine", genericName: "Apomorphine",      concentrationMgMl: 10,    standardDose: 0.03,   minDose: 0.03,   maxDose: 0.03,   doseUnit: "mg_per_kg",  defaultRoute: "IV" },

  // ── Diuretics / Cardiac ──────────────────────────────────────────────────────
  { name: "Furosemide", genericName: "Furosemide",       concentrationMgMl: 10,    standardDose: 2,      minDose: 1,      maxDose: 4,      doseUnit: "mg_per_kg",  defaultRoute: "IV/IM" },
  { name: "Amlodipine", genericName: "Amlodipine",       concentrationMgMl: 5,     standardDose: 0.3,    minDose: 0.1,    maxDose: 0.5,    doseUnit: "tablet",     defaultRoute: "PO",          unitType: "tablet" },
  { name: "Pimobendan", genericName: "Pimobendan",       concentrationMgMl: 2.5,   standardDose: 0.1,    minDose: 0.1,    maxDose: 0.12,   doseUnit: "tablet",     defaultRoute: "PO",          unitType: "tablet" },
  { name: "Digoxin", genericName: "Digoxin",          concentrationMgMl: 0.25,  standardDose: 0.004,  minDose: 0.0025, maxDose: 0.005,  doseUnit: "tablet",     defaultRoute: "PO",          unitType: "tablet" },

  // ── Vasopressors / CRI ───────────────────────────────────────────────────────
  // Doses are typical starting rates (mcg/kg/min); use as reference — CRI protocol applies.
  { name: "Dobutamine", genericName: "Dobutamine",       concentrationMgMl: 12.5,  standardDose: 5,      minDose: 2,      maxDose: 20,     doseUnit: "mcg_per_kg", defaultRoute: "IV (CRI)",    unitType: "bag" },
  { name: "Dopamine", genericName: "Dopamine",         concentrationMgMl: 40,    standardDose: 5,      minDose: 2,      maxDose: 15,     doseUnit: "mcg_per_kg", defaultRoute: "IV (CRI)",    unitType: "bag" },
  { name: "Norepinephrine", genericName: "Norepinephrine",   concentrationMgMl: 1,     standardDose: 0.5,    minDose: 0.1,    maxDose: 2,      doseUnit: "mcg_per_kg", defaultRoute: "IV (CRI)",    unitType: "bag" },

  // ── Hemostasis ───────────────────────────────────────────────────────────────
  { name: "Tranexamic Acid", genericName: "Tranexamic Acid",  concentrationMgMl: 100,   standardDose: 12.5,   minDose: 10,     maxDose: 15,     doseUnit: "mg_per_kg",  defaultRoute: "IV" },

  // ── Antibiotics ──────────────────────────────────────────────────────────────
  { name: "Cefazolin", genericName: "Cefazolin",        concentrationMgMl: 100,   standardDose: 22,     minDose: 20,     maxDose: 30,     doseUnit: "mg_per_kg",  defaultRoute: "IV/IM" },
  { name: "Ampicillin", genericName: "Ampicillin",       concentrationMgMl: 100,   standardDose: 22,     minDose: 20,     maxDose: 30,     doseUnit: "mg_per_kg",  defaultRoute: "IV/IM" },
  { name: "Enrofloxacin", genericName: "Enrofloxacin",     concentrationMgMl: 22.7,  standardDose: 5,      minDose: 5,      maxDose: 20,     doseUnit: "mg_per_kg",  defaultRoute: "IV/PO" },
  { name: "Amoxicillin", genericName: "Amoxicillin",      concentrationMgMl: 50,    standardDose: 15,     minDose: 10,     maxDose: 22,     doseUnit: "mg_per_kg",  defaultRoute: "PO" },
  { name: "Clindamycin", genericName: "Clindamycin",      concentrationMgMl: 25,    standardDose: 8,      minDose: 5,      maxDose: 11,     doseUnit: "mg_per_kg",  defaultRoute: "PO/IV" },
  { name: "Metronidazole", genericName: "Metronidazole",    concentrationMgMl: 5,     standardDose: 10,     minDose: 7.5,    maxDose: 15,     doseUnit: "mg_per_kg",  defaultRoute: "PO/IV" },
  { name: "Doxycycline", genericName: "Doxycycline",      concentrationMgMl: 10,    standardDose: 7.5,    minDose: 5,      maxDose: 10,     doseUnit: "mg_per_kg",  defaultRoute: "PO/IV" },
  { name: "Cephalexin", genericName: "Cephalexin",       concentrationMgMl: 25,    standardDose: 25,     minDose: 22,     maxDose: 30,     doseUnit: "mg_per_kg",  defaultRoute: "PO" },
  { name: "Meropenem", genericName: "Meropenem",        concentrationMgMl: 50,    standardDose: 8,      minDose: 8,      maxDose: 24,     doseUnit: "mg_per_kg",  defaultRoute: "IV/SC" },
  { name: "Gentamicin", genericName: "Gentamicin",       concentrationMgMl: 50,    standardDose: 6,      minDose: 6,      maxDose: 9,      doseUnit: "mg_per_kg",  defaultRoute: "IV/SC" },
  { name: "Augmentin 5% 50mg/ml", genericName: "Augmentin 5% 50mg/ml", concentrationMgMl: 50, standardDose: 15,    minDose: 10,     maxDose: 50,     doseUnit: "mg_per_kg",  defaultRoute: "IV/SC",       unitType: "vial" },
  { name: "Ceftriaxone", genericName: "Ceftriaxone",     concentrationMgMl: 100,   standardDose: 25,     minDose: 20,     maxDose: 30,     doseUnit: "mg_per_kg",  defaultRoute: "IV/SC",       unitType: "vial" },
  { name: "Cisapride tab 2.5", genericName: "Cisapride tab 2.5", concentrationMgMl: 2.5, standardDose: 1,      minDose: 0.5,    maxDose: 2,      doseUnit: "tablet",     defaultRoute: "PO",          unitType: "tablet" },
  { name: "Cisapride syrup 1mg/ml", genericName: "Cisapride syrup 1mg/ml", concentrationMgMl: 1, standardDose: 0.25, minDose: 0.1, maxDose: 0.5, doseUnit: "mg_per_kg", defaultRoute: "PO" },
  { name: "Diphenhydramine", genericName: "Diphenhydramine",  concentrationMgMl: 10,    standardDose: 2,      minDose: 1,      maxDose: 4,      doseUnit: "mg_per_kg",  defaultRoute: "IV/IM" },

  // ── Anti-emetics / GI ────────────────────────────────────────────────────────
  { name: "Maropitant", genericName: "Maropitant", brandNames: ["Cerenia"], concentrationMgMl: 10,    standardDose: 1,      minDose: 1,      maxDose: 2,      doseUnit: "mg_per_kg",  defaultRoute: "SC/IV",       unitType: "vial" },
  { name: "Maropitant (PO)", genericName: "Maropitant (oral)",  concentrationMgMl: 10,    standardDose: 2,      minDose: 2,      maxDose: 2,      doseUnit: "mg_per_kg",  defaultRoute: "PO" },
  { name: "Ondansetron", genericName: "Ondansetron",      concentrationMgMl: 2,     standardDose: 0.3,    minDose: 0.1,    maxDose: 0.5,    doseUnit: "mg_per_kg",  defaultRoute: "IV/PO" },
  { name: "Metoclopramide", genericName: "Metoclopramide",   concentrationMgMl: 5,     standardDose: 0.35,   minDose: 0.2,    maxDose: 0.5,    doseUnit: "mg_per_kg",  defaultRoute: "IV/PO" },
  { name: "Pantoprazole", genericName: "Pantoprazole",     concentrationMgMl: 4,     standardDose: 1,      minDose: 1,      maxDose: 1,      doseUnit: "mg_per_kg",  defaultRoute: "IV",          unitType: "vial" },
  { name: "Omeprazole", genericName: "Omeprazole",       concentrationMgMl: 20,    standardDose: 0.0375, minDose: 0.025,  maxDose: 0.05,   doseUnit: "tablet",     defaultRoute: "PO",          unitType: "tablet" },
  { name: "Famotidine", genericName: "Famotidine",       concentrationMgMl: 10,    standardDose: 0.5,    minDose: 0.5,    maxDose: 1,      doseUnit: "mg_per_kg",  defaultRoute: "IV/PO" },
  { name: "Sucralfate", genericName: "Sucralfate",       concentrationMgMl: 1000,  standardDose: 0.05,   minDose: 0.025,  maxDose: 0.1,    doseUnit: "tablet",     defaultRoute: "PO",          unitType: "tablet" },
  { name: "Lactulose", genericName: "Lactulose",        concentrationMgMl: 667,   standardDose: 333.5,  minDose: 333.5,  maxDose: 333.5,  doseUnit: "mg_per_kg",  defaultRoute: "PO" },
  { name: "Optalgin", genericName: "Optalgin",         concentrationMgMl: 500,   standardDose: 25,     minDose: 10,     maxDose: 50,     doseUnit: "mg_per_kg",  defaultRoute: "IV/IM" },
  { name: "Pramin", genericName: "Pramin",           concentrationMgMl: 5,     standardDose: 0.5,    minDose: 0.2,    maxDose: 0.5,    doseUnit: "mg_per_kg",  defaultRoute: "IV/PO" },
  { name: "Mirtazapine", genericName: "Mirtazapine", brandNames: ["Remeron"], concentrationMgMl: 3.75, standardDose: 1, minDose: 0.5, maxDose: 1, doseUnit: "tablet", defaultRoute: "PO", unitType: "tablet" },

  // ── Neurological ─────────────────────────────────────────────────────────────
  { name: "Phenobarbital", genericName: "Phenobarbital",    concentrationMgMl: 65,    standardDose: 2,      minDose: 2,      maxDose: 5,      doseUnit: "mg_per_kg",  defaultRoute: "IV/PO" },
  { name: "Levetiracetam", genericName: "Levetiracetam",    concentrationMgMl: 100,   standardDose: 20,     minDose: 20,     maxDose: 60,     doseUnit: "mg_per_kg",  defaultRoute: "IV/PO" },
  { name: "Mannitol", genericName: "Mannitol",         concentrationMgMl: 200,   standardDose: 500,    minDose: 250,    maxDose: 1000,   doseUnit: "mg_per_kg",  defaultRoute: "IV (Slow)",   unitType: "bag" },
  { name: "Aminophylline", genericName: "Aminophylline",    concentrationMgMl: 25,    standardDose: 5,      minDose: 5,      maxDose: 10,     doseUnit: "mg_per_kg",  defaultRoute: "IV/PO" },

  // ── Endocrine ────────────────────────────────────────────────────────────────
  { name: "Insulin Regular", genericName: "Insulin Regular",  concentrationMgMl: 100,   standardDose: 0.1,    minDose: 0.1,    maxDose: 0.2,    doseUnit: "mg_per_kg",  defaultRoute: "IV/IM/SC",    unitType: "vial" },
  { name: "Levothyroxine", genericName: "Levothyroxine",    concentrationMgMl: 0.1,   standardDose: 0.2,    minDose: 0.2,    maxDose: 0.2,    doseUnit: "tablet",     defaultRoute: "PO",          unitType: "tablet" },

  // ── Fluids / Electrolytes ────────────────────────────────────────────────────
  { name: "Hypertonic Saline 7.2%", genericName: "Hypertonic Saline 7.2%", concentrationMgMl: 72, standardDose: 288, minDose: 216, maxDose: 360,    doseUnit: "mg_per_kg",  defaultRoute: "IV (Slow)" },
];
