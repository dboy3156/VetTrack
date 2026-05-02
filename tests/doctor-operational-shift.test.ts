import { describe, it, expect } from "vitest";
import { detectDoctorOperationalShiftRole } from "../shared/doctor-operational-shift.js";

describe("shared/doctor-operational-shift", () => {
  describe("detectDoctorOperationalShiftRole", () => {
    it("maps English admission labels", () => {
      expect(detectDoctorOperationalShiftRole("Admission Doctor")).toBe("admission");
      expect(detectDoctorOperationalShiftRole("admissions pool")).toBe("admission");
    });

    it("maps ward / existing-patient labels", () => {
      expect(detectDoctorOperationalShiftRole("Ward Doctor")).toBe("ward");
      expect(detectDoctorOperationalShiftRole("Existing patients")).toBe("ward");
    });

    it("maps senior lead / shift lead labels", () => {
      expect(detectDoctorOperationalShiftRole("Senior Doctor shift")).toBe("senior_lead");
    });

    it("maps night + admission (compressed staffing)", () => {
      expect(detectDoctorOperationalShiftRole("Night — admissions only")).toBe("night_admission_only");
      expect(detectDoctorOperationalShiftRole("לילה קבלה")).toBe("night_admission_only");
    });

    it("maps night senior without admissions", () => {
      expect(detectDoctorOperationalShiftRole("Night senior (no admissions)")).toBe("night_senior_no_admission");
    });

    it("returns unknown for empty or unrelated shift text", () => {
      expect(detectDoctorOperationalShiftRole("")).toBe("unknown");
      expect(detectDoctorOperationalShiftRole("   ")).toBe("unknown");
      expect(detectDoctorOperationalShiftRole("Dentistry consulting")).toBe("unknown");
    });
  });
});
