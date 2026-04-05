export type EquipmentStatus = "ok" | "issue" | "maintenance" | "sterilized";

export type UserRole = "admin" | "vet" | "technician" | "viewer";

export type AlertType = "overdue" | "issue" | "inactive" | "sterilization_due";

export type AlertSeverity = "critical" | "high" | "medium" | "low";

export const ALERT_SEVERITY: Record<AlertType, AlertSeverity> = {
  issue: "critical",
  overdue: "high",
  sterilization_due: "medium",
  inactive: "low",
};

export interface User {
  id: string;
  clerkId: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
}

export interface Folder {
  id: string;
  name: string;
  type: "manual" | "smart";
  color?: string;
  createdAt: string;
}

export interface Equipment {
  id: string;
  name: string;
  serialNumber?: string | null;
  model?: string | null;
  manufacturer?: string | null;
  purchaseDate?: string | null;
  location?: string | null;
  folderId?: string | null;
  folderName?: string | null;
  status: EquipmentStatus;
  lastSeen?: string | null;
  lastStatus?: string | null;
  lastMaintenanceDate?: string | null;
  lastSterilizationDate?: string | null;
  maintenanceIntervalDays?: number | null;
  imageUrl?: string | null;
  // Checkout / ownership
  checkedOutById?: string | null;
  checkedOutByEmail?: string | null;
  checkedOutAt?: string | null;
  checkedOutLocation?: string | null;
  createdAt: string;
}

export interface CreateEquipmentRequest {
  name: string;
  serialNumber?: string;
  model?: string;
  manufacturer?: string;
  purchaseDate?: string;
  location?: string;
  folderId?: string;
  maintenanceIntervalDays?: number;
  imageUrl?: string;
}

export interface UpdateEquipmentRequest {
  name?: string;
  serialNumber?: string | null;
  model?: string | null;
  manufacturer?: string | null;
  purchaseDate?: string | null;
  location?: string | null;
  folderId?: string | null;
  maintenanceIntervalDays?: number | null;
  imageUrl?: string | null;
  status?: EquipmentStatus;
}

export interface ScanEquipmentRequest {
  status: EquipmentStatus;
  note?: string;
  photoUrl?: string;
  userId?: string;
  userEmail?: string;
}

export interface ScanLog {
  id: string;
  equipmentId: string;
  equipmentName?: string;
  userId: string;
  userEmail: string;
  status: EquipmentStatus;
  note?: string | null;
  photoUrl?: string | null;
  timestamp: string;
}

export interface TransferLog {
  id: string;
  equipmentId: string;
  equipmentName?: string;
  fromFolderId?: string | null;
  fromFolderName?: string | null;
  toFolderId?: string | null;
  toFolderName?: string | null;
  userId: string;
  timestamp: string;
}

export interface ActivityFeedItem {
  id: string;
  type: "scan" | "transfer" | "created";
  equipmentId: string;
  equipmentName: string;
  status?: EquipmentStatus;
  note?: string | null;
  fromFolder?: string | null;
  toFolder?: string | null;
  userId: string;
  userEmail: string;
  timestamp: string;
}

export interface AnalyticsSummary {
  totalEquipment: number;
  statusBreakdown: {
    ok: number;
    issue: number;
    maintenance: number;
    sterilized: number;
    overdue: number;
    inactive: number;
  };
  maintenanceComplianceRate: number;
  sterilizationComplianceRate: number;
  scanActivity: Array<{ date: string; count: number }>;
  topProblemEquipment: Array<{
    equipmentId: string;
    name: string;
    issueCount: number;
  }>;
}

export interface BulkDeleteRequest {
  ids: string[];
}

export interface BulkMoveRequest {
  ids: string[];
  folderId: string | null;
}

export interface BulkResult {
  affected: number;
}

export interface UploadUrlRequest {
  name: string;
  size: number;
  contentType: string;
}

export interface UploadUrlResponse {
  uploadURL: string;
  objectPath: string;
}

export interface WhatsAppAlert {
  id: string;
  equipmentId: string;
  equipmentName: string;
  status: EquipmentStatus;
  note?: string;
  phoneNumber?: string;
  message: string;
  sentAt: string;
}

export interface Alert {
  type: AlertType;
  severity: AlertSeverity;
  equipmentId: string;
  equipmentName: string;
  detail?: string;
  daysOverdue?: number;
}

export interface AlertAcknowledgment {
  id: string;
  equipmentId: string;
  alertType: string;
  acknowledgedById: string;
  acknowledgedByEmail: string;
  acknowledgedAt: string;
}

export interface SystemMetrics {
  uptime: number;
  memoryMb: number;
  memoryTotalMb: number;
  activeSessions: number;
  pendingSyncCount: number;
}

export const EQUIPMENT_CATEGORIES = [
  "Surgical",
  "Imaging",
  "Anesthesia & Monitoring",
  "Dental",
  "Laboratory",
  "Sterilization (Autoclave)",
  "Pharmacy",
  "Emergency / ICU",
  "General",
] as const;

export type EquipmentCategory = (typeof EQUIPMENT_CATEGORIES)[number];

export const STATUS_LABELS: Record<EquipmentStatus, string> = {
  ok: "OK",
  issue: "Issue",
  maintenance: "Maintenance",
  sterilized: "Sterilized",
};

export const STATUS_COLORS: Record<EquipmentStatus, string> = {
  ok: "bg-emerald-100 text-emerald-800 border-emerald-200",
  issue: "bg-red-100 text-red-800 border-red-200",
  maintenance: "bg-amber-100 text-amber-800 border-amber-200",
  sterilized: "bg-teal-100 text-teal-800 border-teal-200",
};

export type SupportTicketSeverity = "low" | "medium" | "high";
export type SupportTicketStatus = "open" | "in_progress" | "resolved";

export interface SupportTicket {
  id: string;
  title: string;
  description: string;
  severity: SupportTicketSeverity;
  status: SupportTicketStatus;
  userId: string;
  userEmail: string;
  pageUrl?: string | null;
  deviceInfo?: string | null;
  appVersion?: string | null;
  adminNote?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSupportTicketRequest {
  title: string;
  description: string;
  severity: SupportTicketSeverity;
  pageUrl?: string;
  deviceInfo?: string;
  appVersion?: string;
}
