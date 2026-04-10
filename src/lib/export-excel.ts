import * as XLSX from "xlsx";
import type { Equipment } from "@/types";

export function exportEquipmentToExcel(items: Equipment[], filename = "equipment.xlsx") {
  const rows = items.map((eq) => ({
    Name: eq.name,
    "Serial Number": eq.serialNumber ?? "",
    Model: eq.model ?? "",
    Manufacturer: eq.manufacturer ?? "",
    Status: eq.status,
    Folder: eq.folderName ?? "",
    Room: eq.roomName ?? "",
    Location: eq.location ?? "",
    "Last Seen": eq.lastSeen ? new Date(eq.lastSeen).toLocaleString() : "",
    "Last Maintenance": eq.lastMaintenanceDate ? new Date(eq.lastMaintenanceDate).toLocaleDateString() : "",
    "Last Sterilization": eq.lastSterilizationDate ? new Date(eq.lastSterilizationDate).toLocaleDateString() : "",
    "Checked Out By": eq.checkedOutByEmail ?? "",
    "Checked Out At": eq.checkedOutAt ? new Date(eq.checkedOutAt).toLocaleString() : "",
    "Created At": eq.createdAt ? new Date(eq.createdAt).toLocaleDateString() : "",
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Equipment");

  const colWidths = Object.keys(rows[0] ?? {}).map((key) => ({
    wch: Math.max(key.length, ...rows.map((r) => String(r[key as keyof typeof r] ?? "").length)),
  }));
  ws["!cols"] = colWidths;

  XLSX.writeFile(wb, filename);
}
