import type { Status } from "./components";

export const SAMPLE_EQUIPMENT: {
  id: string;
  name: string;
  location: string;
  status: Status;
}[] = [
  { id: "VT-0041", name: "Vital Signs Monitor",  location: "ER Bay 1",      status: "in_use"    },
  { id: "VT-0087", name: "Portable X-Ray Unit",  location: "Storage A",     status: "available" },
  { id: "VT-0023", name: "Defibrillator AED",    location: "ICU",           status: "available" },
  { id: "VT-0112", name: "Ventilator — Adult",   location: "OR 2",          status: "cleaning"  },
  { id: "VT-0055", name: "Infusion Pump",         location: "Ward 3",        status: "in_use"    },
  { id: "VT-0094", name: "Ultrasound Probe",      location: "Imaging",       status: "missing"   },
  { id: "VT-0031", name: "ECG Machine",           location: "Cardio Lab",    status: "available" },
  { id: "VT-0077", name: "Pulse Oximeter",        location: "ER Bay 2",      status: "in_use"    },
  { id: "VT-0061", name: "Suction Unit",          location: "Storage B",     status: "available" },
  { id: "VT-0108", name: "Autoclave",             location: "Sterilization", status: "cleaning"  },
];
