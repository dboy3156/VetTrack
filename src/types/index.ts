export type EquipmentStatus =
  | "ok"
  | "issue"
  | "maintenance"
  | "sterilized"
  | "critical"
  | "needs_attention";

export type UserRole = "admin" | "vet" | "technician" | "viewer";
export type ShiftRole = "technician" | "senior_technician" | "admin";

export type AlertType = "overdue" | "issue" | "inactive" | "sterilization_due";

export type AlertSeverity = "critical" | "high" | "medium" | "low";

export const ALERT_SEVERITY: Record<AlertType, AlertSeverity> = {
  issue: "critical",
  overdue: "high",
  sterilization_due: "medium",
  inactive: "low",
};

export type UserStatus = "pending" | "active" | "blocked";

export interface User {
  id: string;
  clerkId: string;
  email: string;
  name: string;
  displayName: string;
  role: UserRole;
  effectiveRole?: UserRole | ShiftRole;
  roleSource?: "shift" | "permanent";
  activeShift?: Shift | null;
  resolvedAt?: string;
  status: UserStatus;
  createdAt: string;
  deletedAt?: string | null;
  deletedBy?: string | null;
}

export interface DeletedEquipment {
  id: string;
  name: string;
  serialNumber?: string | null;
  model?: string | null;
  manufacturer?: string | null;
  status: string;
  deletedAt: string;
  deletedBy?: string | null;
  createdAt: string;
}

export interface Folder {
  id: string;
  name: string;
  type: "manual" | "smart";
  color?: string;
  createdAt: string;
}

export type RoomSyncStatus = "synced" | "stale" | "requires_audit";

export interface Room {
  id: string;
  name: string;
  floor?: string | null;
  masterNfcTagId?: string | null;
  syncStatus: RoomSyncStatus;
  lastAuditAt?: string | null;
  createdAt: string;
  updatedAt: string;
  // Computed counts (returned by GET /api/rooms)
  totalEquipment?: number;
  availableCount?: number;
  inUseCount?: number;
  issueCount?: number;
  recentlyVerifiedCount?: number;
  /** Active SmartFlow / manual patient linked to this room (GET /api/rooms/:id). */
  linkedPatientName?: string | null;
}

export interface RoomActivityEntry {
  id: string;
  userId: string;
  userEmail: string;
  userName?: string | null;
  equipmentId?: string | null;
  equipmentName?: string | null;
  status: string;
  note?: string | null;
  timestamp: string;
}

export interface CreateRoomRequest {
  name: string;
  floor?: string;
  masterNfcTagId?: string;
}

export interface UpdateRoomRequest {
  name?: string;
  floor?: string | null;
  masterNfcTagId?: string | null;
  syncStatus?: RoomSyncStatus;
}

export interface BulkVerifyRoomResult {
  affected: number;
  roomName: string;
}

export interface Equipment {
  id: string;
  name: string;
  serialNumber?: string | null;
  model?: string | null;
  manufacturer?: string | null;
  purchaseDate?: string | null;
  expiryDate?: string | null;
  expiryNotifiedAt?: string | null;
  location?: string | null;
  folderId?: string | null;
  folderName?: string | null;
  roomId?: string | null;
  roomName?: string | null;
  department?: string | null;
  nfcTagId?: string | null;
  lastVerifiedAt?: string | null;
  lastVerifiedById?: string | null;
  lastVerifiedByName?: string | null;
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
  expectedReturnMinutes?: number | null;
  isPluggedIn?: boolean | null;
  plugInDeadlineMinutes?: number | null;
  plugInAlertSentAt?: string | null;
  createdAt: string;
  linkedAnimalId?: string | null;
  linkedAnimalName?: string | null;
}

export type CodeBlueStatus = "critical" | "needs_attention";

export interface CriticalEquipment {
  id: string;
  name: string;
  category: string;
  status: CodeBlueStatus;
  lastSeenLocation?: string | null;
  lastSeenTimestamp?: string | null;
}

export interface CreateEquipmentRequest {
  name: string;
  serialNumber?: string;
  model?: string;
  manufacturer?: string;
  purchaseDate?: string | null;
  expiryDate?: string | null;
  location?: string;
  folderId?: string;
  roomId?: string;
  nfcTagId?: string;
  maintenanceIntervalDays?: number;
  expectedReturnMinutes?: number | null;
  imageUrl?: string;
}

export interface UpdateEquipmentRequest {
  name?: string;
  serialNumber?: string | null;
  model?: string | null;
  manufacturer?: string | null;
  purchaseDate?: string | null;
  expiryDate?: string | null;
  location?: string | null;
  folderId?: string | null;
  roomId?: string | null;
  nfcTagId?: string | null;
  maintenanceIntervalDays?: number | null;
  expectedReturnMinutes?: number | null;
  isPluggedIn?: boolean | null;
  plugInDeadlineMinutes?: number | null;
  imageUrl?: string | null;
  status?: EquipmentStatus;
}

export interface EquipmentReturn {
  id: string;
  clinicId: string;
  equipmentId: string;
  returnedById: string;
  returnedByEmail: string;
  returnedAt: string;
  isPluggedIn: boolean;
  plugInDeadlineMinutes: number;
  plugInAlertSentAt?: string | null;
  chargeAlertJobId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateReturnRequest {
  equipmentId: string;
  isPluggedIn: boolean;
  plugInDeadlineMinutes?: number;
}

export interface UpdateReturnRequest {
  isPluggedIn?: boolean;
  plugInDeadlineMinutes?: number;
}

export interface Shift {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  employeeName: string;
  role: ShiftRole;
}

export interface ShiftImport {
  id: string;
  importedAt: string;
  importedBy: string;
  importedByName?: string | null;
  importedByEmail?: string | null;
  filename: string;
  rowCount: number;
}

export interface ShiftCsvRow {
  rowNumber: number;
  date: string;
  startTime: string;
  endTime: string;
  employeeName: string;
  shiftName: string;
  role: ShiftRole;
}

export interface ShiftCsvIssue {
  rowNumber: number;
  reason: string;
  data: Record<string, string>;
}

export interface ShiftImportPreview {
  filename: string;
  summary: {
    totalRows: number;
    validRows: number;
    skippedRows: number;
  };
  rows: ShiftCsvRow[];
  issues: ShiftCsvIssue[];
}

export interface ShiftImportResult {
  importId: string;
  filename: string;
  insertedRows: number;
  skippedRows: number;
  issues: ShiftCsvIssue[];
}

export type AppointmentStatus =
  | "pending"
  | "assigned"
  | "scheduled"
  | "arrived"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show";

export type TaskPriority = "critical" | "high" | "normal";
export type TaskType = "maintenance" | "repair" | "inspection" | "medication";

export interface Appointment {
  id: string;
  clinicId: string;
  animalId?: string | null;
  ownerId?: string | null;
  vetId: string | null;
  startTime: string;
  endTime: string;
  scheduledAt?: string | null;
  completedAt?: string | null;
  status: AppointmentStatus;
  conflictOverride: boolean;
  overrideReason?: string | null;
  notes?: string | null;
  priority?: TaskPriority;
  taskType?: TaskType | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  /** Set by task recall dashboard — end_time is before now. */
  isOverdue?: boolean;
}

export interface MedicationExecutionPayload {
  weightKg?: number;
  prescribedDosePerKg?: number;
  concentrationMgPerMl?: number;
  formularyConcentrationMgPerMl?: number;
  doseUnit?: "mg_per_kg" | "mcg_per_kg";
  convertedDoseMgPerKg?: number;
  calculatedVolumeMl?: number;
  concentrationOverridden?: boolean;
}

export interface MedicationExecutionTask extends Appointment {
  animalWeightKg: number | null;
}

/** GET /api/tasks/dashboard — single payload for Daily Recall UI. */
export interface TaskDashboard {
  today: Appointment[];
  overdue: Appointment[];
  upcoming: Appointment[];
  myTasks: Appointment[];
  counts: {
    today: number;
    overdue: number;
    myTasks: number;
  };
}

export type RecommendationSuggestionType = "OVERDUE_WARNING" | "START_NOW" | "OVERLOADED" | "PICK_FROM_QUEUE";

export interface RecommendationSuggestion {
  type: RecommendationSuggestionType;
  message: string;
  severity: "high" | "medium" | "low";
}

export interface RecommendedTask extends Appointment {
  reason: string;
  score: number;
  scoreBreakdown: {
    overdue: number;
    critical: number;
    startsSoon: number;
    assigned: number;
    inProgress: number;
  };
}

export interface TaskRecommendations {
  nextBestTask: RecommendedTask | null;
  urgentTasks: Appointment[];
  overloaded: boolean;
  suggestions: RecommendationSuggestion[];
}

export interface CreateAppointmentRequest {
  animalId?: string | null;
  ownerId?: string | null;
  vetId?: string | null;
  startTime: string;
  endTime: string;
  scheduledAt?: string | null;
  status?: AppointmentStatus;
  conflictOverride?: boolean;
  overrideReason?: string | null;
  notes?: string | null;
  priority?: TaskPriority;
  taskType?: TaskType | null;
  metadata?: Record<string, unknown> | null;
}

export interface UpdateAppointmentRequest {
  animalId?: string | null;
  ownerId?: string | null;
  vetId?: string | null;
  startTime?: string;
  endTime?: string;
  scheduledAt?: string | null;
  status?: AppointmentStatus;
  conflictOverride?: boolean;
  overrideReason?: string | null;
  notes?: string | null;
  priority?: TaskPriority;
  taskType?: TaskType | null;
  metadata?: Record<string, unknown> | null;
}

export interface VetShiftWindow {
  id: string;
  employeeName: string;
  startTime: string;
  endTime: string;
  role: ShiftRole;
}

export interface AppointmentVetMeta {
  id: string;
  name: string;
  displayName: string;
  role: UserRole;
  shifts: VetShiftWindow[];
}

/** Response from POST /api/equipment/:id/seen */
export interface ShiftHandoverSummary {
  windowStart: string;
  windowEnd: string;
  windowSource: "open_shift" | "fallback_12h";
  revenueCents: number;
  averageMedicationDelaySeconds: number;
  unreturned: Array<{
    id: string;
    name: string;
    checkedOutAt: string | null;
    checkedOutByEmail: string | null;
    checkedOutLocation: string | null;
  }>;
  expiringAssets: Array<{ id: string; name: string; expiryDate: string | null }>;
  hotAssets: Array<{ id: string; name: string; scans: number }>;
  openShiftSession: {
    id: string;
    startedAt: string;
    startedByUserId: string;
    note: string | null;
  } | null;
}

export interface InventoryContainer {
  id: string;
  clinicId: string;
  name: string;
  department: string;
  targetQuantity: number;
  currentQuantity: number;
  roomId: string | null;
  billingItemId: string | null;
  nfcTagId: string | null;
}

export interface ShiftHandoverSession {
  id: string;
  clinicId: string;
  startedAt: string;
  endedAt: string | null;
  startedByUserId: string;
  note: string | null;
}

export type EquipmentSeenResponse =
  | {
      linked: true;
      animal: { id: string; name: string };
      roomId: string;
      usageSessionId: string;
      ledgerId: string;
      idempotentReplay: boolean;
    }
  | {
      linked: false;
      reason: "no_room" | "no_patient_in_room";
      roomId: string | null;
    };

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
  pendingSyncCount?: number;
  syncMetrics?: {
    syncSuccessCount: number;
    syncFailCount: number;
  };
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
  critical: "Critical",
  needs_attention: "Needs Attention",
};

export const STATUS_COLORS: Record<EquipmentStatus, string> = {
  ok: "bg-emerald-100 text-emerald-800 border-emerald-200",
  issue: "bg-red-100 text-red-800 border-red-200",
  maintenance: "bg-amber-100 text-amber-800 border-amber-200",
  sterilized: "bg-blue-100 text-blue-800 border-blue-200",
  critical: "bg-red-100 text-red-800 border-red-200",
  needs_attention: "bg-orange-100 text-orange-800 border-orange-200",
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

export interface AuditLog {
  id: string;
  actionType: string;
  performedBy: string;
  performedByEmail: string;
  targetId: string | null;
  targetType: string | null;
  metadata: Record<string, unknown> | null;
  timestamp: string;
}

export interface AuditLogResponse {
  items: AuditLog[];
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface AuditLogFilters {
  actionType?: string;
  from?: string;
  to?: string;
  page?: number;
}
