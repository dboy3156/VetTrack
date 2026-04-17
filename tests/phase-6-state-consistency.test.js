"use strict";

const fs = require("fs");
const path = require("path");

let passed = 0;
let failed = 0;

function ok(label) {
  console.log(`  PASS: ${label}`);
  passed++;
}

function fail(label, detail) {
  console.error(`  FAIL: ${label}`);
  if (detail) console.error(`    ${detail}`);
  failed++;
}

function assert(condition, label, detail) {
  if (condition) ok(label);
  else fail(label, detail);
}

const repoRoot = path.resolve(__dirname, "..");
const appointments = fs.readFileSync(path.join(repoRoot, "src", "pages", "appointments.tsx"), "utf8");
const settings = fs.readFileSync(path.join(repoRoot, "src", "pages", "settings.tsx"), "utf8");
const equipmentList = fs.readFileSync(path.join(repoRoot, "src", "pages", "equipment-list.tsx"), "utf8");
const alerts = fs.readFileSync(path.join(repoRoot, "src", "pages", "alerts.tsx"), "utf8");

console.log("\n-- Wave 6 state consistency checks (static)");

assert(
  appointments.includes("import { ErrorCard } from \"@/components/ui/error-card\";") &&
    appointments.includes("import { EmptyState } from \"@/components/ui/empty-state\";") &&
    appointments.includes("recommendationsQuery.isError") &&
    appointments.includes("dashboardQuery.isError") &&
    appointments.includes("listQuery.isError") &&
    appointments.includes("<EmptyState") &&
    appointments.includes("listQuery.isLoading ? (") &&
    appointments.includes("<Skeleton className=\"h-64 w-full\" />"),
  "Appointments page uses explicit shared loading/error/empty states",
  "Expected appointments page to use ErrorCard and EmptyState for consistency across query sections",
);

assert(
  settings.includes("const { name, email, signOut, effectiveRole, role, isLoaded, isSignedIn } = useAuth();") &&
    settings.includes("if (!isLoaded)") &&
    settings.includes("<Skeleton") &&
    settings.includes("if (!isSignedIn)") &&
    settings.includes("<ErrorCard") &&
    settings.includes("onRetry={() => window.location.reload()}"),
  "Settings page includes auth loading and error state gates",
  "Expected settings page to render skeleton while auth loads and ErrorCard with retry when auth is unavailable",
);

assert(
  equipmentList.includes("import { ErrorCard } from \"@/components/ui/error-card\";") &&
    equipmentList.includes("import { EmptyState } from \"@/components/ui/empty-state\";") &&
    equipmentList.includes("EquipmentListSkeleton") &&
    equipmentList.includes("onRetry={() => refetchAll()}"),
  "Equipment list uses shared loading/error/empty components",
  "Expected equipment-list page to rely on shared consistency components",
);

assert(
  alerts.includes("import { ErrorCard } from \"@/components/ui/error-card\";") &&
    alerts.includes("import { EmptyState } from \"@/components/ui/empty-state\";") &&
    alerts.includes("SkeletonAlertCard") &&
    alerts.includes("onRetry={() => {") &&
    alerts.includes("refetchEq();") &&
    alerts.includes("refetchAcks();"),
  "Alerts page uses shared loading/error/empty components",
  "Expected alerts page to rely on shared consistency components",
);

assert(
  appointments.includes("import { Skeleton } from \"@/components/ui/skeleton\";") &&
    settings.includes("import { Skeleton } from \"@/components/ui/skeleton\";") &&
    equipmentList.includes("EquipmentListSkeleton") &&
    alerts.includes("SkeletonAlertCard"),
  "Priority pages use skeleton-based loading states",
  "Expected appointments/settings/equipment-list/alerts to use skeleton loaders for loading-state consistency",
);

assert(
  appointments.includes("onRetry={() => recommendationsQuery.refetch()}") &&
    appointments.includes("onRetry={() => dashboardQuery.refetch()}") &&
    appointments.includes("void listQuery.refetch();") &&
    appointments.includes("void metaQuery.refetch();"),
  "Appointments error states provide consistent retry affordances",
  "Expected appointments page error cards to retry their corresponding query surfaces",
);

assert(
  appointments.includes("onClick={() => openQuickBooking(new Date())}") &&
    appointments.includes("onClick={() => myTasksRef.current?.scrollIntoView({ behavior: \"smooth\", block: \"start\" })}") &&
    appointments.includes("onClick={() => urgentRef.current?.scrollIntoView({ behavior: \"smooth\", block: \"start\" })}"),
  "Appointments empty states provide actionable CTA affordances",
  "Expected appointments empty states to include consistent action buttons for common next steps",
);

assert(
  equipmentList.includes("action={") &&
    equipmentList.includes("onClick={() => navigate(\"/equipment\", { replace: true })}") &&
    equipmentList.includes("<Link href=\"/equipment/new\">"),
  "Equipment list empty states provide actionable CTA affordances",
  "Expected equipment list empty states to provide clear actions for reset or create flows",
);

assert(
  alerts.includes("action={") &&
    alerts.includes("<Link href=\"/equipment\">") &&
    alerts.includes("t.alertsPage.browseEquipment"),
  "Alerts empty state provides actionable CTA affordance",
  "Expected alerts empty state to include browse-equipment navigation action",
);

if (failed > 0) {
  console.error(`\nState consistency checks failed (${failed} failed, ${passed} passed)`);
  process.exit(1);
}

console.log(`\nState consistency checks passed (${passed} assertions).`);
