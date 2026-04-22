# VetTrack: Final Master Stabilization Plan (Zero Point)

**Phase objective:** Full system stabilization. Resolve all legacy bugs, finalize permissions, update the clinical database, and ensure 100% PWA/Hebrew readiness before starting the 90-day roadmap.

---

## 1. Global Development Rules (Non-Negotiable)

- **Full localization:** 100% Hebrew coverage for the PWA. No mixed English/Hebrew. Use translation files (i18n).
- **PWA optimization:** Fix UI scaling and responsiveness. The app must be fully functional and aesthetic on mobile devices.
- **Metadata logging:** Every action, entry, or status change must record: Name, Role, Time, and Date.
- **API surface unification:** Reorganize API namespaces to ensure 100% consistency between the frontend and existing backend.

---

## 2. Permissions & Role Architecture

- **Role rename:** Viewer → Student.
- **Permissions:** Restricted strictly to: Scanning, Taking, and Returning equipment ONLY.
- **Medication hub access control:**
  - **Assignable:** Technicians and Senior Technicians.
  - **Creation:** Physician ONLY. Senior Technicians are strictly prohibited from creating medication tasks. (Hide UI buttons + add backend validation.)
- **Multi-role support:** Enable Double Role functionality (e.g., Technician + Admin). Ensure they do NOT inherit Physician-level creation rights.

---

## 3. Clinical Database & Medication UI

- **Mandatory field:** Patient Weight is now a required field for all medication tasks.
- **Unit support:** UI/Logic must support: mEq/ml, %, and tablet fractions (1, 1/2, 1/4, 3/4).
- **Smart defaults:** Selecting a drug must auto-populate the default mg/kg range and Route in the UI.

### Data update (database seeds)

- **Anesthesia/Sedation:** Propofol (2–6 mg/kg IV), Ketamine (2–5 mg/kg IV/IM), Diazepam (0.25–0.5 mg/kg IV), Midazolam (0.1–0.5 mg/kg IV/IM), Methadone (0.1–0.5 mg/kg IV/IM/SC), Buprenorphine (0.01–0.03 mg/kg IV/IM), Butorphanol (0.1–0.4 mg/kg IV/IM/SC), Dexmedetomidine (0.001–0.01 mg/kg IV/IM), Acepromazine (0.01–0.1 mg/kg IV/IM/SC).
- **Analgesia/Local:** Bupivacaine (1–2 mg/kg Local), Meloxicam (0.1–0.2 Init / 0.05–0.1 Maint), Carprofen (2.2–4.4 PO/SC), Gabapentin (5–20 PO), Trazodone (3–10 PO).
- **Emergency/Cardio:** Atropine (0.02–0.04 IV/IM/SC), Epinephrine (0.01–0.02 Low / 0.1 High), Lidocaine (2–8 IV Dog / 0.25–1 IV Cat), Furosemide (1–4 IV/IM), Dobutamine/Dopamine/Norepinephrine (CRI doses), Amlodipine (0.1–0.5 PO), Pimobendan (0.25–0.3 PO), Digoxin (0.0025–0.005 PO Dog), Tranexamic Acid (10–15 IV).
- **Antibiotics:** Cefazolin/Ampicillin (20–30 IV/IM), Enrofloxacin (5–20 IV/PO — caution in cats), Amoxicillin (10–22 PO), Clindamycin/Metronidazole/Doxycycline (doses as per list), Cephalexin (22–30 PO), Meropenem (8–24 IV/SC), Gentamicin (6–9 IV/SC SID).
- **GI/Endocrine/Misc:** Maropitant (1 SC/IV, 2 PO), Ondansetron (0.1–0.5 IV/PO), Pantoprazole (1 IV), Metoclopramide (0.2–0.5 IV/PO/CRI), Sucralfate/Omeprazole/Famotidine/Lactulose, Dexamethasone (0.1–0.2 IV/IM), Prednisone (0.5–2.2 PO), Insulin Regular (0.1–0.2 units/kg), Levothyroxine (0.02 PO), Phenobarbital/Levetiracetam (Anticonvulsants), Mannitol (0.25–1 g/kg Slow IV), Hypertonic Saline (3–5 ml/kg IV), Apomorphine (0.03 IV/Eye), Aminophylline (5–10 IV/PO).

---

## 4. Functional Bug Fixes

- **Inventory drawers:** Fix rendering bug. Clicking a drawer must load/display contents and remain open.
- **Tasks page:** Fix Administer and Complete buttons.
- **User identity:** Replace User ID with User Name in all UI views.
- **CSS audit:** Resolve text overlap in Hebrew/RTL layouts.

---

## 5. Integrations & Infrastructure

- **[CRITICAL] CSV import:** Fix the failing CSV import for valid files. Debug the parser/validation logic.
- **EZShift:** Verify CSV mapping and ensure roles update dynamically based on the shift schedule.
- **Purchase orders (PO):** Build the frontend UI and connect it to the existing backend logic.
- **SmartFlow:** Completely remove all SmartFlow-related code.
- **Code Blue:** Prioritize logic: Proximity > Accessibility > Functional Status.

---

**Final check:** Every single point raised is now documented.
