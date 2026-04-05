import { useState, useEffect, useMemo, useCallback } from "react";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";

import {
  useListEquipment,
  useDeleteEquipment,
  getListEquipmentQueryKey,
  useListFolders,
  useCreateFolder,
  getListFoldersQueryKey,
  useBulkDeleteEquipment,
  useBulkMoveEquipment,
} from "@/lib/api"; // תוקן: @@ → @
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { QrScanner } from "@/components/qr-scanner";
import { Link, useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import {
  Plus,
  Camera,
  CheckCircle2,
  AlertTriangle,
  Wrench,
  Clock,
  Search,
  Trash2,
  Package,
  FolderOpen,
  Folder,
  CheckSquare,
  Square,
  X,
  ArrowRightLeft,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { computeAlerts } from "@/lib/alerts";
import { useUserRole } from "@/lib/use-user-role";

const VET_CATEGORIES = [
  "Surgical Instruments",
  "Diagnostic Imaging",
  "Anesthesia & Monitoring",
  "Dental",
  "Laboratory",
  "Sterilization (Autoclave)",
  "Pharmacy",
  "Emergency/ICU",
  "General",
];

const DEFAULT_VET_FOLDERS = [
  "Surgery",
  "Radiology & Imaging",
  "Exam Rooms",
  "Dental Suite",
  "Laboratory",
  "Pharmacy",
  "Emergency/ICU",
  "Kennel & Recovery",
];

const STERILIZATION_CATEGORIES = [
  "Surgical Instruments",
  "Dental",
  "Sterilization (Autoclave)",
];

const STERILIZATION_WINDOW_DAYS = 7;

function StatusBadge({
  status,
  isOverdue,
  isInactive,
}: {
  status?: string | null;
  isOverdue?: boolean;
  isInactive?: boolean;
}) {
  if (isOverdue) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm font-semibold bg-red-100 text-red-700">
        <Wrench className="w-3.5 h-3.5" />
        Overdue
      </span>
    );
  }
  if (status === "sterilized") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm font-semibold bg-teal-100 text-teal-700">
        <Sparkles className="w-3.5 h-3.5" />
        Sterilized
      </span>
    );
  }
  if (status === "issue") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm font-semibold bg-orange-100 text-orange-700">
        <AlertTriangle className="w-3.5 h-3.5" />
        Issue
      </span>
    );
  }
  if (status === "maintenance") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm font-semibold bg-red-100 text-red-700">
        <Wrench className="w-3.5 h-3.5" />
        Maintenance
      </span>
    );
  }
  if (status === "ok") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm font-semibold bg-green-100 text-green-700">
        <CheckCircle2 className="w-3.5 h-3.5" />
        OK
      </span>
    );
  }
  if (isInactive) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm font-semibold bg-gray-100 text-gray-500">
        <Clock className="w-3.5 h-3.5" />
        Inactive
      </span>
    );
  }
  return null;
}

export default function Home() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [addingFolder, setAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const { isAdmin } = useUserRole();
  const { data: equipment, isLoading: equipmentLoading } = useListEquipment();
  const { data: folders, isLoading: foldersLoading } = useListFolders();

  // כל ה-hooks בתוך הקומפוננטה — תוקן
  const queryClient = useQueryClient();
  const deleteEquipment = useDeleteEquipment();
  const createFolder = useCreateFolder();
  const bulkDelete = useBulkDeleteEquipment();
  const bulkMove = useBulkMoveEquipment();

  const selectionMode = selectedIds.size > 0;

  useEffect(() => {
    if (folders && folders.length === 0 && !foldersLoading) {
      const seeded = localStorage.getItem("vet_folders_seeded");
      if (!seeded) {
        localStorage.setItem("vet_folders_seeded", "1");
        let chain = Promise.resolve();
        for (const name of DEFAULT_VET_FOLDERS) {
          chain = chain.then(
            () =>
              new Promise<void>((resolve) => {
                createFolder.mutate(
                  { data: { name } },
                  { onSuccess: () => resolve(), onError: () => resolve() },
                );
              }),
          );
        }
        chain.then(() => {
          queryClient.invalidateQueries({ queryKey: getListFoldersQueryKey() });
        });
      }
    }
  }, [folders, foldersLoading]);

  const alerts = equipment ? computeAlerts(equipment) : [];
  const overdueIds = new Set(
    alerts.filter((a) => a.type === "overdue").map((a) => a.equipmentId),
  );
  const issueIds = new Set(
    alerts.filter((a) => a.type === "issue").map((a) => a.equipmentId),
  );
  const inactiveIds = new Set(
    alerts.filter((a) => a.type === "inactive").map((a) => a.equipmentId),
  );

  const allItems = equipment ?? [];

  const smartIssueCount = allItems.filter((e) => e.lastStatus === "issue").length;
  const smartInRepairCount = allItems.filter((e) => e.lastStatus === "maintenance").length;

  const sterilizationDueItems = allItems.filter((item) => {
    const cat = item.category;
    if (!cat || !STERILIZATION_CATEGORIES.includes(cat)) return false;
    if (!item.lastMaintenanceDate) return true;
    const daysSince =
      (Date.now() - new Date(item.lastMaintenanceDate).getTime()) /
      (1000 * 60 * 60 * 24);
    return daysSince > STERILIZATION_WINDOW_DAYS;
  });
  const smartSterilizationDueCount = sterilizationDueItems.length;

  const dashIssues = issueIds.size;
  const dashOverdue = overdueIds.size;
  const dashInactive = inactiveIds.size;

  const mostNeglected =
    allItems.length > 0
      ? allItems.reduce((worst, item) => {
          const ts = (x: typeof item) =>
            x.lastSeen ? new Date(x.lastSeen).getTime() : 0;
          return ts(item) < ts(worst) ? item : worst;
        })
      : null;

  const byFolder =
    activeFolderId === "__issues__"
      ? allItems.filter((item) => item.lastStatus === "issue")
      : activeFolderId === "__in_repair__"
        ? allItems.filter((item) => item.lastStatus === "maintenance")
        : activeFolderId === "__sterilization_due__"
          ? sterilizationDueItems
          : activeFolderId
            ? allItems.filter((item) => item.folderId === activeFolderId)
            : allItems;

  const filtered = byFolder.filter(
    (item) =>
      search === "" ||
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.id.toLowerCase().includes(search.toLowerCase()),
  );

  const filteredIds = useMemo(
    () => new Set(filtered.map((i) => i.id)),
    [filtered],
  );
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((i) => selectedIds.has(i.id));

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (allFilteredSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredIds.forEach((id) => next.add(id));
        return next;
      });
    }
  }, [allFilteredSelected, filteredIds]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  function handleQrScan(id: string) {
    setScannerOpen(false);
    navigate(`/equipment/${id}`);
  }

  // הפונקציה הנכונה — בתוך הקומפוננטה, עם חתימה נכונה
  function handleDelete(e: React.MouseEvent, id: string, name: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    deleteEquipment.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.setQueryData(
            getListEquipmentQueryKey(),
            (prev: typeof equipment) =>
              prev?.filter((item) => item.id !== id) ?? [],
          );
        },
      },
    );
  }

  function handleSaveFolder(e: React.FormEvent) {
    e.preventDefault();
    const name = newFolderName.trim();
    if (!name) return;
    createFolder.mutate(
      { data: { name } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListFoldersQueryKey() });
          setNewFolderName("");
          setAddingFolder(false);
        },
      },
    );
  }

  function handleBulkDelete() {
    const ids = Array.from(selectedIds);
    bulkDelete.mutate(
      { data: { ids } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListEquipmentQueryKey() });
          clearSelection();
          setShowDeleteDialog(false);
        },
      },
    );
  }

  function handleBulkMove(targetFolderId: string | null) {
    const ids = Array.from(selectedIds);
    bulkMove.mutate(
      { data: { ids, folderId: targetFolderId } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListEquipmentQueryKey() });
          clearSelection();
          setShowMoveDialog(false);
        },
      },
    );
  }

  const isLoading = equipmentLoading || foldersLoading;
  const { isRefreshing } = usePullToRefresh({
    onRefresh: async () => {
      await queryClient.invalidateQueries({ queryKey: getListEquipmentQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getListFoldersQueryKey() });
    },
  });

  const selectedNames = useMemo(
    () => allItems.filter((i) => selectedIds.has(i.id)).map((i) => i.name),
    [allItems, selectedIds],
  );

  return (
    <Layout>
      {scannerOpen && (
        <div className="fixed inset-0 z-50">
          <QrScanner
            onScan={handleQrScan}
            open={scannerOpen}
            onClose={() => setScannerOpen(false)}
          />
        </div>
      )}

      {showDeleteDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowDeleteDialog(false)}
        >
          <div
            className="bg-card rounded-2xl shadow-xl border border-border p-6 w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-foreground mb-2">
              Delete {selectedIds.size} item{selectedIds.size !== 1 ? "s" : ""}?
            </h3>
            <p className="text-xs text-muted-foreground mb-1">
              This will permanently delete the following equipment and all associated scan logs:
            </p>
            <div className="max-h-32 overflow-y-auto mb-4 text-xs text-foreground">
              {selectedNames.map((name, i) => (
                <div key={i} className="py-0.5">• {name}</div>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowDeleteDialog(false)}
                className="px-4 py-2 rounded-xl border border-border text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={bulkDelete.isPending}
                className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {bulkDelete.isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showMoveDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowMoveDialog(false)}
        >
          <div
            className="bg-card rounded-2xl shadow-xl border border-border p-6 w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold text-foreground mb-4">
              Move {selectedIds.size} item{selectedIds.size !== 1 ? "s" : ""} to folder
            </h3>
            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto mb-4">
              <button
                onClick={() => handleBulkMove(null)}
                disabled={bulkMove.isPending}
                className="flex items-center gap-2 px-4 py-3 rounded-xl border border-border text-left hover:bg-muted transition-colors text-sm font-medium disabled:opacity-50"
              >
                <Package className="w-4 h-4 text-muted-foreground" />
                No folder (unassign)
              </button>
              {folders?.map((folder) => (
                <button
                  key={folder.id}
                  onClick={() => handleBulkMove(folder.id)}
                  disabled={bulkMove.isPending}
                  className="flex items-center gap-2 px-4 py-3 rounded-xl border border-border text-left hover:bg-muted transition-colors text-sm font-medium disabled:opacity-50"
                >
                  <Folder className="w-4 h-4 text-muted-foreground" />
                  {folder.name}
                </button>
              ))}
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setShowMoveDialog(false)}
                className="px-4 py-2 rounded-xl border border-border text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-5 pb-24">
        <div className="pt-1">
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Equipment</h1>
          {isRefreshing && (
            <div className="flex justify-center py-2">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          <p className="text-base text-muted-foreground mt-0.5">
            {isLoading
              ? "Loading..."
              : `${equipment?.length ?? 0} item${equipment?.length !== 1 ? "s" : ""} registered`}
          </p>
        </div>

        {!isLoading && (dashIssues > 0 || dashOverdue > 0 || dashInactive > 0) && (
          <div className="flex items-center gap-2 flex-wrap">
            {dashIssues > 0 && (
              <button
                onClick={() => setActiveFolderId("__issues__")}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 transition-colors"
              >
                <AlertTriangle className="w-4 h-4" />
                Issues: {dashIssues}
              </button>
            )}
            {dashOverdue > 0 && (
              <button
                onClick={() => setActiveFolderId(null)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors"
              >
                <Wrench className="w-4 h-4" />
                Overdue: {dashOverdue}
              </button>
            )}
            {dashInactive > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium bg-gray-50 text-gray-500 border border-gray-200">
                <Clock className="w-4 h-4" />
                Inactive: {dashInactive}
              </span>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-base font-bold text-muted-foreground uppercase tracking-wider">
              Departments
            </p>
            <button
              onClick={() => setAddingFolder((v) => !v)}
              className="inline-flex items-center gap-1 text-sm text-primary font-medium hover:text-primary/80 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Folder
            </button>
          </div>

          {addingFolder && (
            <form onSubmit={handleSaveFolder} className="flex gap-2">
              <input
                autoFocus
                type="text"
                placeholder="Department name..."
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                className="flex-1 h-10 px-3 rounded-xl border border-border bg-card text-base focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
              />
              <button
                type="submit"
                disabled={!newFolderName.trim() || createFolder.isPending}
                className="px-3 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddingFolder(false);
                  setNewFolderName("");
                }}
                className="px-3 h-10 rounded-xl border border-border text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            </form>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActiveFolderId(null)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-colors border ${
                activeFolderId === null
                  ? "bg-foreground text-background border-foreground"
                  : "bg-card text-foreground border-border hover:border-primary/40"
              }`}
            >
              <Package className="w-4 h-4" />
              All
              <span className="opacity-60">{equipment?.length ?? 0}</span>
            </button>

            {smartIssueCount > 0 && (
              <button
                onClick={() => setActiveFolderId("__issues__")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-colors border ${
                  activeFolderId === "__issues__"
                    ? "bg-orange-600 text-white border-orange-600"
                    : "bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100"
                }`}
              >
                <AlertTriangle className="w-4 h-4" />
                Issues
                <span className="opacity-80">{smartIssueCount}</span>
              </button>
            )}

            {smartInRepairCount > 0 && (
              <button
                onClick={() => setActiveFolderId("__in_repair__")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors border ${
                  activeFolderId === "__in_repair__"
                    ? "bg-red-600 text-white border-red-600"
                    : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                }`}
              >
                <Wrench className="w-4 h-4" />
                In Repair
                <span className="opacity-80">{smartInRepairCount}</span>
              </button>
            )}

            {smartSterilizationDueCount > 0 && (
              <button
                onClick={() => setActiveFolderId("__sterilization_due__")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors border ${
                  activeFolderId === "__sterilization_due__"
                    ? "bg-teal-600 text-white border-teal-600"
                    : "bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100"
                }`}
              >
                <ShieldCheck className="w-4 h-4" />
                Sterilization Due
                <span className="opacity-80">{smartSterilizationDueCount}</span>
              </button>
            )}

            {foldersLoading ? (
              <Skeleton className="h-8 w-24 rounded-xl" />
            ) : (
              folders?.map((folder) => {
                const count = allItems.filter((e) => e.folderId === folder.id).length;
                return (
                  <button
                    key={folder.id}
                    onClick={() => setActiveFolderId(folder.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors border ${
                      activeFolderId === folder.id
                        ? "bg-foreground text-background border-foreground"
                        : "bg-card text-foreground border-border hover:border-primary/40"
                    }`}
                  >
                    <Folder className="w-4 h-4" />
                    {folder.name}
                    <span className="opacity-60">{count}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search by name or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-11 pl-10 pr-10 rounded-xl border border-border bg-card text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        {equipmentLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-[72px] w-full rounded-2xl" />
            <Skeleton className="h-[72px] w-full rounded-2xl" />
            <Skeleton className="h-[72px] w-full rounded-2xl" />
          </div>
        ) : filtered.length === 0 && equipment?.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
              <Package className="w-7 h-7 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-base">No equipment registered yet.</p>
            <Link
              href="/equipment/new"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-foreground text-background text-base font-semibold hover:bg-foreground/90 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Add your first item
            </Link>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-base">
            {search ? `No results for "${search}"` : "No equipment in this folder."}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((item) => {
              const isOverdue = overdueIds.has(item.id);
              const hasIssue = issueIds.has(item.id);
              const isInactive = inactiveIds.has(item.id);
              const folderName = folders?.find((f) => f.id === item.folderId)?.name;
              const isNeglected = mostNeglected?.id === item.id && allItems.length > 1;
              const isSelected = selectedIds.has(item.id);

              const accentColor = isOverdue
                ? "bg-red-400"
                : hasIssue
                  ? "bg-orange-400"
                  : item.lastStatus === "sterilized"
                    ? "bg-teal-400"
                    : item.lastStatus === "ok"
                      ? "bg-green-400"
                      : isInactive
                        ? "bg-gray-300"
                        : "bg-gray-200";

              return (
                <div key={item.id} className="relative">
                  <div
                    onClick={(e) => {
                      if (selectionMode) {
                        e.preventDefault();
                        toggleSelect(item.id);
                      }
                    }}
                    className={`flex items-stretch ${
                      isSelected ? "ring-2 ring-blue-500 rounded-2xl" : ""
                    }`}
                  >
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleSelect(item.id);
                      }}
                      className="flex items-center pl-2 pr-0 shrink-0"
                      title={isSelected ? "Deselect" : "Select"}
                    >
                      {isSelected ? (
                        <CheckSquare className="w-5 h-5 text-primary" />
                      ) : (
                        <Square className="w-5 h-5 text-muted-foreground/40 hover:text-muted-foreground transition-colors" />
                      )}
                    </button>
                    <Link
                      href={selectionMode ? "#" : `/equipment/${item.id}`}
                      onClick={(e) => {
                        if (selectionMode) e.preventDefault();
                      }}
                      className={`flex-1 bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md active:scale-[0.99] transition-all overflow-hidden flex items-stretch ${
                        isNeglected
                          ? "border-amber-300 hover:border-amber-400"
                          : "border-border hover:border-primary/30"
                      }`}
                    >
                      <div className={`w-1 shrink-0 ${accentColor}`} />
                      <div className="flex-1 px-4 py-3.5 pr-10 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="font-semibold text-xs font-medium text-foreground truncate leading-snug">
                            {item.name}
                          </p>
                          {isNeglected && (
                            <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                              <Clock className="w-3.5 h-3.5" />
                              Needs attention
                            </span>
                          )}
                        </div>
                        {(item.model || item.serialNumber || item.category) && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {[item.model, item.serialNumber, item.category]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <StatusBadge
                            status={item.lastStatus}
                            isOverdue={isOverdue}
                            isInactive={isInactive && !hasIssue}
                          />
                          <span className="text-xs text-muted-foreground">
                            {item.lastSeen
                              ? formatDistanceToNow(new Date(item.lastSeen), { addSuffix: true })
                              : "Never scanned"}
                          </span>
                          {folderName && (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <FolderOpen className="w-3.5 h-3.5" />
                              {folderName}
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  </div>
                  {!selectionMode && isAdmin && (
                    <button
                      onClick={(e) => handleDelete(e, item.id, item.name)}
                      disabled={deleteEquipment.isPending}
                      className="absolute top-2 right-2 p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-50 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectionMode && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-4 py-3 rounded-2xl bg-foreground text-background shadow-xl border border-foreground/20">
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium hover:bg-background/10 transition-colors"
          >
            {allFilteredSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
            {allFilteredSelected ? "Deselect All" : "Select All"}
          </button>
          <span className="text-sm font-semibold opacity-80 px-2">{selectedIds.size} selected</span>
          <div className="w-px h-6 bg-background/20" />
          <button
            onClick={() => setShowMoveDialog(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium hover:bg-background/10 transition-colors"
          >
            <ArrowRightLeft className="w-4 h-4" />
            Move to Folder
          </button>
          {isAdmin && (
            <button
              onClick={() => setShowDeleteDialog(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-red-300 hover:bg-red-400/20 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          )}
          <div className="w-px h-6 bg-background/20" />
          <button
            onClick={clearSelection}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium hover:bg-background/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {!selectionMode && (
        <button
          onClick={() => setScannerOpen(true)}
          className="fixed bottom-6 right-6 h-14 px-5 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2.5 z-40 font-semibold text-base"
          title="Scan QR Code"
        >
          <Camera className="w-5 h-5" />
          Scan QR
        </button>
      )}
    </Layout>
  );
}
