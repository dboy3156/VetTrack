import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useSearch } from "wouter";
import { Helmet } from "react-helmet-async";
import { api } from "@/lib/api";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
import { statusToBadgeVariant } from "@/lib/design-tokens";
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
} from "lucide-react";
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

  const params = useMemo(() => new URLSearchParams(searchStr), [searchStr]);
  const search = params.get("q") ?? "";
  const statusFilter = params.get("status") ?? "all";
  const folderFilter = params.get("folder") ?? "all";
  const locationFilter = params.get("location") ?? "all";

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

  function setSearch(val: string) {
    updateParams({ q: val });
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

  const { data: equipment, isLoading, isError, refetch } = useQuery({
    queryKey: ["/api/equipment"],
    queryFn: api.equipment.list,
  });

  const { data: folders } = useQuery({
    queryKey: ["/api/folders"],
    queryFn: api.folders.list,
  });

  const bulkDeleteMut = useMutation({
    mutationFn: (ids: string[]) => api.equipment.bulkDelete({ ids }),
    onSuccess: (_, ids) => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
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
      <div className="flex flex-col gap-4 pb-24">
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
              size="sm"
              variant="outline"
              onClick={() => qrInputRef.current?.click()}
              data-testid="btn-scan-qr"
            >
              <QrCode className="w-4 h-4 mr-1" />
              Scan QR
            </Button>
            <Link href="/equipment/new">
              <Button size="sm" data-testid="btn-add">
                <Plus className="w-4 h-4 mr-1" />
                Add
              </Button>
            </Link>
          </div>
        </div>

        {/* Search + filters */}
        <div className="flex flex-col gap-2">
          <div className="relative">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, serial, model..."
              className="pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="search-input"
            />
          </div>
          <div className="flex gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="flex-1" data-testid="status-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={folderFilter} onValueChange={setFolderFilter}>
              <SelectTrigger className="flex-1" data-testid="folder-filter">
                <SelectValue placeholder="All folders" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All folders</SelectItem>
                <SelectItem value="unfiled">Unfiled</SelectItem>
                {folders?.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Location filter chips */}
          {locations.length > 0 && (
            <div
              className="flex gap-2 overflow-x-auto pb-1 scrollbar-none"
              data-testid="location-filter-chips"
            >
              <button
                onClick={() => setLocationFilter("all")}
                className={`shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  locationFilter === "all"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
                }`}
                data-testid="location-chip-all"
              >
                <MapPin className="w-3 h-3" />
                All Rooms
              </button>
              {locations.map((loc) => (
                <button
                  key={loc}
                  onClick={() => setLocationFilter(loc)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap ${
                    locationFilter === loc
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
                  }`}
                  data-testid={`location-chip-${loc}`}
                >
                  {loc}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Bulk actions bar */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectMode(!selectMode);
              if (selectMode) setSelected(new Set());
            }}
            className="text-xs"
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
                    bulkMoveMut.mutate({
                      ids: Array.from(selected),
                      folderId: folderId === "none" ? null : folderId,
                    });
                  }}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <FolderInput className="w-3.5 h-3.5 mr-1" />
                    Move
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
                        data-testid="btn-bulk-delete"
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" />
                        Delete
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
                          Delete
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
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
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
        ) : (
          <div className="flex flex-col gap-2" data-testid="equipment-list">
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
      </div>
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
  return (
    <div
      className={`flex items-center gap-2 ${selectMode ? "cursor-pointer" : ""}`}
      onClick={selectMode ? onToggleSelect : undefined}
    >
      {selectMode && (
        <div
          className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
            selected ? "bg-primary border-primary" : "border-border"
          }`}
        >
          {selected && (
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      )}
      <Link href={`/equipment/${eq.id}`} className="flex-1" onClick={(e) => selectMode && e.preventDefault()}>
        <Card
          className={`transition-all hover:shadow-sm hover:border-primary/30 ${selected ? "border-primary bg-primary/5" : ""}`}
          data-testid={`equipment-item-${eq.id}`}
        >
          <CardContent className="p-4 flex items-center gap-3">
            {eq.imageUrl ? (
              <img
                src={eq.imageUrl}
                alt={eq.name}
                className="w-12 h-12 rounded-xl object-cover shrink-0"
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center shrink-0">
                <Package className="w-6 h-6 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm truncate">{eq.name}</span>
                <Badge variant={statusToBadgeVariant(eq.status)} className="shrink-0">
                  {STATUS_LABELS[eq.status as keyof typeof STATUS_LABELS] || eq.status}
                </Badge>
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {eq.folderName && (
                  <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                    <FolderOpen className="w-3 h-3" />
                    {eq.folderName}
                  </span>
                )}
                {eq.serialNumber && (
                  <span className="text-xs text-muted-foreground">
                    #{eq.serialNumber}
                  </span>
                )}
                {eq.location && (
                  <span className="text-xs text-muted-foreground truncate">
                    {eq.location}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Last seen: {formatRelativeTime(eq.lastSeen?.toString())}
              </p>
            </div>
            {!selectMode && (
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            )}
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}
