import { useState, useMemo, useRef, useEffect } from "react";
import { Virtuoso } from "react-virtuoso";
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useSearch } from "wouter";
import { Helmet } from "react-helmet-async";
import { api } from "@/lib/api";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SkeletonEquipmentCard } from "@/components/ui/skeleton-cards";
import { ErrorCard } from "@/components/ui/error-card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { STATUS_LABELS } from "@/types";
import type { Equipment } from "@/types";
import {
  Plus,
  Search,
  QrCode,
  FolderOpen,
  CheckSquare,
  Square,
  Trash2,
  FolderInput,
  Package,
  ChevronRight,
  MapPin,
  Upload,
  Loader2,
  LogIn,
  LogOut,
  AlertTriangle,
} from "lucide-react";
import { CsvImportDialog } from "@/components/csv-import-dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatRelativeTime } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import jsQR from "jsqr";

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "ok", label: "OK" },
  { value: "issue", label: "Issue" },
  { value: "maintenance", label: "Maintenance" },
  { value: "sterilized", label: "Sterilized" },
];

export default function EquipmentListPage() {
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();
  const [, navigate] = useLocation();
  const searchStr = useSearch();
  const qrInputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [folderSheetOpen, setFolderSheetOpen] = useState(false);
  const [folderSearch, setFolderSearch] = useState("");

  const params = useMemo(() => new URLSearchParams(searchStr), [searchStr]);
  const search = params.get("q") ?? "";
  const statusFilter = params.get("status") ?? "all";
  const folderFilter = params.get("folder") ?? "all";
  const locationFilter = params.get("location") ?? "all";

  const [searchInput, setSearchInput] = useState(search);

  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchStrRef = useRef(searchStr);
  searchStrRef.current = searchStr;

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, []);

  function handleSearchInputChange(val: string) {
    setSearchInput(val);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      searchDebounceRef.current = null;
      const next = new URLSearchParams(searchStrRef.current);
      if (val === "") {
        next.delete("q");
      } else {
        next.set("q", val);
      }
      const qs = next.toString();
      navigate(qs ? `/equipment?${qs}` : "/equipment", { replace: true });
      setSelected(new Set());
      setSelectMode(false);
    }, 250);
  }

  function updateParams(updates: Record<string, string>) {
    const next = new URLSearchParams(searchStr);
    for (const [k, v] of Object.entries(updates)) {
      if (v === "" || v === "all") {
        next.delete(k);
      } else {
        next.set(k, v);
      }
    }
    const qs = next.toString();
    navigate(qs ? `/equipment?${qs}` : "/equipment", { replace: true });
    setSelected(new Set());
    setSelectMode(false);
  }

  function setStatusFilter(val: string) {
    updateParams({ status: val });
  }

  function setFolderFilter(val: string) {
    updateParams({ folder: val });
  }

  function setLocationFilter(val: string) {
    updateParams({ location: val });
  }

  function handleQrScan(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!e.target) return;
    e.target.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (!code) {
          toast.error("No QR code found in image");
          return;
        }
        const match = code.data.match(/\/equipment\/([a-zA-Z0-9_-]+)/);
        if (match) {
          navigate(`/equipment/${match[1]}`);
        } else {
          toast.error("QR code does not link to equipment");
        }
      };
      img.src = evt.target?.result as string;
    };
    reader.readAsDataURL(file);
  }

  const PAGE_SIZE = 100;
  const {
    data: equipmentPages,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["/api/equipment/paginated"],
    queryFn: ({ pageParam = 1 }) => api.equipment.listPaginated(pageParam as number, PAGE_SIZE),
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    initialPageParam: 1,
  });

  const equipment = useMemo(
    () => equipmentPages?.pages.flatMap((p) => p.items),
    [equipmentPages]
  );

  const { data: folders } = useQuery({
    queryKey: ["/api/folders"],
    queryFn: api.folders.list,
  });

  const bulkDeleteMut = useMutation({
    mutationFn: (ids: string[]) => api.equipment.bulkDelete({ ids }),
    onSuccess: (_, ids) => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      queryClient.invalidateQueries({ queryKey: ["/api/equipment/paginated"] });
      setSelected(new Set());
      setSelectMode(false);
      toast.success(`Deleted ${ids.length} item${ids.length !== 1 ? "s" : ""}`);
    },
    onError: () => toast.error("Delete failed"),
  });

  const bulkMoveMut = useMutation({
    mutationFn: ({ ids, folderId }: { ids: string[]; folderId: string | null }) =>
      api.equipment.bulkMove({ ids, folderId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      queryClient.invalidateQueries({ queryKey: ["/api/equipment/paginated"] });
      setSelected(new Set());
      setSelectMode(false);
      toast.success("Moved successfully");
    },
    onError: () => toast.error("Move failed"),
  });

  const locations = useMemo(() => {
    if (!equipment) return [];
    const locs = new Set<string>();
    for (const eq of equipment) {
      if (eq.location) locs.add(eq.location);
      if (eq.checkedOutLocation) locs.add(eq.checkedOutLocation);
    }
    return Array.from(locs).sort();
  }, [equipment]);

  const filtered = useMemo(() => {
    if (!equipment) return [];
    return equipment.filter((eq) => {
      const matchesSearch =
        !search ||
        eq.name.toLowerCase().includes(search.toLowerCase()) ||
        eq.serialNumber?.toLowerCase().includes(search.toLowerCase()) ||
        eq.model?.toLowerCase().includes(search.toLowerCase()) ||
        eq.location?.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || eq.status === statusFilter;
      const matchesFolder =
        folderFilter === "all" ||
        (folderFilter === "unfiled" ? !eq.folderId : eq.folderId === folderFilter) ||
        folderFilter === eq.folderId;
      const matchesLocation =
        locationFilter === "all" ||
        eq.location === locationFilter ||
        eq.checkedOutLocation === locationFilter;
      return matchesSearch && matchesStatus && matchesFolder && matchesLocation;
    });
  }, [equipment, search, statusFilter, folderFilter, locationFilter]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((e) => e.id)));
    }
  };

  const manualFolders = folders?.filter((f) => f.type !== "smart") || [];

  return (
    <Layout>
      <Helmet>
        <title>Equipment — VetTrack</title>
        <meta name="description" content="Browse, search, and manage all veterinary equipment. Filter by status or folder, bulk-move items, and scan QR codes to quickly locate any asset." />
        <link rel="canonical" href="https://vettrack.replit.app/equipment" />
      </Helmet>
      <div className="flex flex-col gap-4 pb-24 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold leading-tight">Equipment</h1>
          <div className="flex items-center gap-2">
            <input
              ref={qrInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleQrScan}
              data-testid="qr-file-input"
            />
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => qrInputRef.current?.click()}
              data-testid="btn-scan-qr"
              title="Scan QR"
              className="text-slate-600 active:scale-95"
            >
              <QrCode className="w-5 h-5" />
            </Button>
            {isAdmin && (
              <Button
                size="icon-sm"
                variant="ghost"
                className="hidden md:inline-flex text-slate-600 active:scale-95"
                onClick={() => setImportOpen(true)}
                data-testid="btn-import-csv"
                title="Import CSV"
              >
                <Upload className="w-5 h-5" />
              </Button>
            )}
            <Link href="/equipment/new">
              <Button size="default" data-testid="btn-add" className="active:scale-95">
                <Plus className="w-4 h-4 mr-1" />
                Add
              </Button>
            </Link>
          </div>
        </div>

        {/* Search + filters */}
        <div className="flex flex-col gap-2">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              placeholder="Search by name, serial, model..."
              className="w-full h-12 pl-11 pr-4 rounded-full bg-slate-100 border-none outline-none ring-0 text-sm placeholder:text-slate-400 focus:ring-2 focus:ring-blue-600/20 focus:bg-white transition-all"
              value={searchInput}
              onChange={(e) => handleSearchInputChange(e.target.value)}
              data-testid="search-input"
            />
          </div>
          {/* Status chip filters */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none" data-testid="status-filter-chips">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setStatusFilter(opt.value)}
                className={`shrink-0 flex items-center px-4 h-12 rounded-full text-sm font-semibold transition-colors whitespace-nowrap active:scale-95 ${
                  statusFilter === opt.value
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
                data-testid={`status-chip-${opt.value}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {/* Folder filter trigger */}
          <button
            onClick={() => setFolderSheetOpen(true)}
            className={`w-full flex items-center gap-2 px-4 min-h-[44px] rounded-xl border text-sm text-left transition-colors active:scale-95 ${
              folderFilter !== "all"
                ? "border-blue-600 bg-blue-50 text-blue-600"
                : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"
            }`}
            data-testid="folder-filter"
          >
            <FolderOpen className="w-4 h-4 shrink-0" />
            <span className="flex-1 truncate">
              {folderFilter === "all"
                ? "All Folders"
                : folderFilter === "unfiled"
                ? "Unfiled"
                : (folders?.find((f) => f.id === folderFilter)?.name ?? "Folder")}
            </span>
            <ChevronRight className="w-3.5 h-3.5 shrink-0 rotate-90" />
          </button>
          <Sheet open={folderSheetOpen} onOpenChange={(o) => { setFolderSheetOpen(o); if (!o) setFolderSearch(""); }}>
            <SheetContent side="bottom" className="max-h-[75vh] flex flex-col p-0">
              <SheetHeader className="px-4 pt-5 pb-3 border-b">
                <SheetTitle>Filter by Folder</SheetTitle>
              </SheetHeader>
              <div className="px-4 py-3 border-b">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search folders…"
                    value={folderSearch}
                    onChange={(e) => setFolderSearch(e.target.value)}
                    className="pl-9"
                    data-testid="folder-search"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {[
                  { id: "all", name: "All Folders" },
                  { id: "unfiled", name: "Unfiled" },
                  ...(folders ?? []),
                ]
                  .filter(
                    (f) =>
                      !folderSearch ||
                      f.name.toLowerCase().includes(folderSearch.toLowerCase())
                  )
                  .map((f) => (
                    <button
                      key={f.id}
                      onClick={() => {
                        setFolderFilter(f.id);
                        setFolderSheetOpen(false);
                        setFolderSearch("");
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3.5 text-sm text-left border-b border-border/50 transition-colors ${
                        folderFilter === f.id
                          ? "bg-primary/10 text-primary font-medium"
                          : "hover:bg-accent"
                      }`}
                      data-testid={`folder-option-${f.id}`}
                    >
                      <FolderOpen className="w-4 h-4 shrink-0" />
                      <span className="flex-1">{f.name}</span>
                      {folderFilter === f.id && (
                        <CheckSquare className="w-4 h-4 shrink-0" />
                      )}
                    </button>
                  ))}
              </div>
              <div
                className="p-4 border-t"
                style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
              >
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setFolderSheetOpen(false)}
                >
                  Done
                </Button>
              </div>
            </SheetContent>
          </Sheet>

          {/* Location filter chips */}
          {locations.length > 0 && (
            <div className="relative">
            <div
              className="flex gap-2 overflow-x-auto pb-1 scrollbar-none"
              data-testid="location-filter-chips"
            >
              <button
                onClick={() => setLocationFilter("all")}
                className={`shrink-0 flex items-center gap-1.5 px-4 h-12 rounded-full text-sm font-semibold transition-colors active:scale-95 whitespace-nowrap ${
                  locationFilter === "all"
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
                data-testid="location-chip-all"
              >
                <MapPin className="w-3.5 h-3.5" />
                All Rooms
              </button>
              {locations.map((loc) => (
                <button
                  key={loc}
                  onClick={() => setLocationFilter(loc)}
                  className={`shrink-0 px-4 h-12 rounded-full text-sm font-semibold transition-colors whitespace-nowrap active:scale-95 ${
                    locationFilter === loc
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                  data-testid={`location-chip-${loc}`}
                >
                  {loc}
                </button>
              ))}
            </div>
            {/* Fade gradient indicating more chips to scroll */}
            <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent" />
            </div>
          )}
        </div>

        {/* Bulk actions bar */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="default"
            onClick={() => {
              setSelectMode(!selectMode);
              if (selectMode) setSelected(new Set());
            }}
            className="text-sm active:scale-95"
            data-testid="btn-select-mode"
          >
            {selectMode ? (
              <Square className="w-4 h-4 mr-1" />
            ) : (
              <CheckSquare className="w-4 h-4 mr-1" />
            )}
            {selectMode ? "Cancel" : "Select"}
          </Button>

          {selectMode && selected.size > 0 && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleAll}
                className="text-xs"
              >
                {selected.size === filtered.length ? "Deselect all" : "Select all"}
              </Button>
              <span className="text-xs text-muted-foreground">
                {selected.size} selected
              </span>
              <div className="flex gap-2 ml-auto">
                <Select
                  onValueChange={(folderId) => {
                    if (bulkMoveMut.isPending || bulkDeleteMut.isPending) return;
                    bulkMoveMut.mutate({
                      ids: Array.from(selected),
                      folderId: folderId === "none" ? null : folderId,
                    });
                  }}
                  disabled={bulkMoveMut.isPending || bulkDeleteMut.isPending}
                >
                  <SelectTrigger className="h-9 text-xs" disabled={bulkMoveMut.isPending || bulkDeleteMut.isPending}>
                    {bulkMoveMut.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                    ) : (
                      <FolderInput className="w-3.5 h-3.5 mr-1" />
                    )}
                    {bulkMoveMut.isPending ? "Working…" : "Move"}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unfiled</SelectItem>
                    {manualFolders.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isAdmin && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={bulkDeleteMut.isPending || bulkMoveMut.isPending}
                        data-testid="btn-bulk-delete"
                      >
                        {bulkDeleteMut.isPending ? (
                          <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5 mr-1" />
                        )}
                        {bulkDeleteMut.isPending ? "Working…" : "Delete"}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete {selected.size} items?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This permanently deletes the selected equipment and all their history. This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => bulkDeleteMut.mutate(Array.from(selected))}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Yes, permanently delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </>
          )}
        </div>

        {/* Count */}
        <p className="text-xs text-muted-foreground -mt-2">
          {filtered.length} of {equipment?.length ?? 0} items
          {locationFilter !== "all" && (
            <span className="ml-1">· <button onClick={() => setLocationFilter("all")} className="underline">Clear room filter</button></span>
          )}
        </p>

        {/* Error state */}
        {isError && (
          <ErrorCard
            message="Failed to load equipment. Please try again."
            onRetry={() => refetch()}
          />
        )}

        {/* Equipment list */}
        {isLoading ? (
          <div className="flex flex-col gap-2">
            {[...Array(6)].map((_, i) => (
              <SkeletonEquipmentCard key={i} />
            ))}
          </div>
        ) : !isError && filtered.length === 0 ? (
          <EmptyState
            icon={Package}
            message="No equipment found"
            subMessage={
              search || statusFilter !== "all" || folderFilter !== "all" || locationFilter !== "all"
                ? "Try adjusting your filters or search query."
                : "Add your first piece of equipment to start tracking."
            }
            action={
              search || statusFilter !== "all" || folderFilter !== "all" || locationFilter !== "all" ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate("/equipment", { replace: true })}
                >
                  Clear all filters
                </Button>
              ) : (
                <Link href="/equipment/new">
                  <Button size="sm">
                    <Plus className="w-4 h-4 mr-1" />
                    Add Equipment
                  </Button>
                </Link>
              )
            }
          />
        ) : filtered.length > 100 ? (
          <Virtuoso
            style={{ height: "calc(100dvh - 280px)" }}
            data={filtered}
            data-testid="equipment-list"
            itemContent={(_, eq) => (
              <div className="pb-3">
                <EquipmentItem
                  equipment={eq}
                  selectMode={selectMode}
                  selected={selected.has(eq.id)}
                  onToggleSelect={() => toggleSelect(eq.id)}
                />
              </div>
            )}
          />
        ) : (
          <div className="flex flex-col gap-3" data-testid="equipment-list">
            {filtered.map((eq) => (
              <EquipmentItem
                key={eq.id}
                equipment={eq}
                selectMode={selectMode}
                selected={selected.has(eq.id)}
                onToggleSelect={() => toggleSelect(eq.id)}
              />
            ))}
          </div>
        )}

        {hasNextPage && !isLoading && (
          <div className="flex justify-center pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              data-testid="btn-load-more"
            >
              {isFetchingNextPage ? (
                <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Loading…</>
              ) : (
                "Load more"
              )}
            </Button>
          </div>
        )}
      </div>

      <CsvImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </Layout>
  );
}

function EquipmentItem({
  equipment: eq,
  selectMode,
  selected,
  onToggleSelect,
}: {
  equipment: Equipment;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const { userId, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const isCheckedOut = !!eq.checkedOutById;
  const checkedOutByMe = eq.checkedOutById === userId;

  const checkoutMut = useMutation({
    mutationFn: () => api.equipment.checkout(eq.id),
    onSuccess: () => {
      navigator.vibrate?.(50);
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      toast.success(`Checked out — ${eq.name}`);
    },
    onError: () => toast.error("Checkout failed"),
  });

  const returnMut = useMutation({
    mutationFn: () => api.equipment.return(eq.id),
    onSuccess: () => {
      navigator.vibrate?.(50);
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      queryClient.invalidateQueries({ queryKey: ["/api/equipment/my"] });
      toast.success(`Returned — ${eq.name} is now available`);
    },
    onError: () => toast.error("Return failed"),
  });

  const quickAction = !isCheckedOut && eq.status === "ok"
    ? { label: "In Use", icon: LogIn, action: () => checkoutMut.mutate(), pending: checkoutMut.isPending, className: "text-emerald-700 border-emerald-200 hover:bg-emerald-50" }
    : (isCheckedOut && (checkedOutByMe || isAdmin)) && eq.status === "ok"
    ? { label: "Return", icon: LogOut, action: () => returnMut.mutate(), pending: returnMut.isPending, className: "text-blue-700 border-blue-200 hover:bg-blue-50" }
    : eq.status === "issue"
    ? { label: "View Issue", icon: AlertTriangle, action: null, href: `/equipment/${eq.id}`, pending: false, className: "text-red-600 border-red-200 hover:bg-red-50" }
    : null;

  const statusDotColor =
    eq.status === "ok" ? "bg-emerald-500" :
    eq.status === "issue" ? "bg-red-500" :
    eq.status === "maintenance" ? "bg-amber-500" :
    eq.status === "sterilized" ? "bg-blue-400" :
    "bg-slate-400";

  const statusPillColor =
    eq.status === "ok" ? "bg-emerald-50 text-emerald-700" :
    eq.status === "issue" ? "bg-red-50 text-red-700" :
    eq.status === "maintenance" ? "bg-amber-50 text-amber-700" :
    eq.status === "sterilized" ? "bg-blue-50 text-blue-700" :
    "bg-slate-100 text-slate-600";

  return (
    <div
      className={`flex items-center gap-3 min-h-[64px] border-b border-[#F1F5F9] ${selectMode ? "cursor-pointer active:bg-slate-50" : ""}`}
      onClick={selectMode ? onToggleSelect : undefined}
      data-testid={`equipment-item-${eq.id}`}
    >
      {selectMode && (
        <div
          className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
            selected ? "bg-blue-600 border-blue-600" : "border-slate-300"
          }`}
        >
          {selected && (
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      )}
      <Link
        href={`/equipment/${eq.id}`}
        onClick={(e) => selectMode && e.preventDefault()}
        className="flex-1 flex items-center gap-3 min-w-0 py-3"
      >
        {/* Status dot */}
        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusDotColor}`} />
        {/* Main info */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-base text-slate-900 truncate leading-snug">{eq.name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            {eq.location && (
              <span className="text-xs text-slate-500 truncate max-w-[110px]">{eq.location}</span>
            )}
            <span className="text-xs text-slate-400">{formatRelativeTime(eq.lastSeen?.toString())}</span>
          </div>
        </div>
        {/* Trailing: quick action or status pill */}
        <div className="flex items-center gap-1.5 shrink-0">
          {!selectMode && quickAction ? (
            quickAction.action ? (
              <button
                onClick={(e) => { e.stopPropagation(); e.preventDefault(); quickAction.action!(); }}
                disabled={quickAction.pending}
                className={`flex items-center gap-1.5 px-3 rounded-lg border text-xs font-semibold min-h-[44px] transition-colors active:scale-95 ${quickAction.className}`}
                data-testid={`quick-action-${eq.id}`}
              >
                {quickAction.pending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <quickAction.icon className="w-3.5 h-3.5" />
                )}
                <span>{quickAction.label}</span>
              </button>
            ) : (
              <Link href={quickAction.href!} onClick={(e) => e.stopPropagation()}>
                <button
                  className={`flex items-center gap-1.5 px-3 rounded-lg border text-xs font-semibold min-h-[44px] transition-colors active:scale-95 ${quickAction.className}`}
                  data-testid={`quick-action-${eq.id}`}
                >
                  <quickAction.icon className="w-3.5 h-3.5" />
                  <span>{quickAction.label}</span>
                </button>
              </Link>
            )
          ) : (
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusPillColor}`}>
              {STATUS_LABELS[eq.status as keyof typeof STATUS_LABELS] || eq.status}
            </span>
          )}
        </div>
      </Link>
    </div>
  );
}
