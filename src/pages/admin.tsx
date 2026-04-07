import { useState, useMemo } from "react";
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { api } from "@/lib/api";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Label } from "@/components/ui/label";
import {
  Shield,
  Users,
  FolderOpen,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  LifeBuoy,
  ChevronDown,
  ChevronUp,
  Clock,
  CheckCircle,
  XCircle,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  Search,
  Filter,
  RefreshCw,
  RotateCcw,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type {
  SupportTicket,
  SupportTicketStatus,
  User,
  AuditLog,
  DeletedEquipment,
} from "@/types";

export default function AdminPage() {
  const { isAdmin } = useAuth();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<
    "folders" | "users" | "pending" | "support" | "audit-logs" | "deleted"
  >("folders");

  const { data: supportUnresolved } = useQuery({
    queryKey: ["/api/support/unresolved-count"],
    queryFn: api.support.unresolvedCount,
    enabled: isAdmin,
    refetchInterval: 60_000,
  });

  const { data: pendingUsers } = useQuery({
    queryKey: ["/api/users/pending"],
    queryFn: api.users.listPending,
    enabled: isAdmin,
    refetchInterval: 30_000,
  });

  if (!isAdmin) {
    return (
      <Layout>
        <Helmet>
          <title>Admin — VetTrack</title>
          <meta
            name="description"
            content="VetTrack administration panel. Manage equipment folders, user roles, and system settings for your veterinary clinic."
          />
        </Helmet>
        <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
          <Shield className="w-12 h-12 text-muted-foreground" />
          <h1 className="text-2xl font-bold">Admin Only</h1>
          <p className="text-sm text-muted-foreground">
            You need admin access to view this page.
          </p>
          <Button variant="ghost" onClick={() => navigate("/")}>
            Go Home
          </Button>
        </div>
      </Layout>
    );
  }

  const unresolvedCount = supportUnresolved?.count ?? 0;
  const pendingCount = pendingUsers?.length ?? 0;

  return (
    <Layout>
      <Helmet>
        <title>Admin — VetTrack</title>
        <meta
          name="description"
          content="VetTrack administration panel. Manage equipment folders, user roles, and system settings for your veterinary clinic."
        />
        <link rel="canonical" href="https://vettrack.replit.app/admin" />
      </Helmet>
      <div className="flex flex-col gap-6 pb-24 animate-fade-in">
        <h1 className="text-2xl font-bold leading-tight flex items-center gap-2">
          <Shield className="w-6 h-6 text-primary" />
          Admin
        </h1>

        {/* Tab bar */}
        <div className="flex gap-2 border-b pb-0 overflow-x-auto">
          <button
            onClick={() => setActiveTab("folders")}
            data-testid="admin-tab-folders"
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
              activeTab === "folders"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <FolderOpen className="w-4 h-4" />
            Folders
          </button>
          <button
            onClick={() => setActiveTab("pending")}
            data-testid="admin-tab-pending"
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors relative whitespace-nowrap",
              activeTab === "pending"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Clock className="w-4 h-4" />
            Pending
            {pendingCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold">
                {pendingCount > 9 ? "9+" : pendingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("users")}
            data-testid="admin-tab-users"
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
              activeTab === "users"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Users className="w-4 h-4" />
            Users
          </button>
          <button
            onClick={() => setActiveTab("support")}
            data-testid="admin-tab-support"
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors relative whitespace-nowrap",
              activeTab === "support"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <LifeBuoy className="w-4 h-4" />
            Support
            {unresolvedCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-white text-[10px] font-bold">
                {unresolvedCount > 9 ? "9+" : unresolvedCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("audit-logs")}
            data-testid="admin-tab-audit-logs"
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
              activeTab === "audit-logs"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <ClipboardList className="w-4 h-4" />
            Audit Logs
          </button>
          <button
            onClick={() => setActiveTab("deleted")}
            data-testid="admin-tab-deleted"
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
              activeTab === "deleted"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Trash2 className="w-4 h-4" />
            Deleted
          </button>
        </div>

        {activeTab === "folders" && <FoldersSection />}
        {activeTab === "pending" && <PendingUsersSection />}
        {activeTab === "users" && <UsersSection />}
        {activeTab === "support" && <SupportSection />}
        {activeTab === "audit-logs" && <AuditLogsSection />}
        {activeTab === "deleted" && <DeletedItemsSection />}
      </div>
    </Layout>
  );
}

function FoldersSection() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editFolder, setEditFolder] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [folderName, setFolderName] = useState("");

  const { data: folders, isLoading } = useQuery({
    queryKey: ["/api/folders"],
    queryFn: api.folders.list,
  });

  const createMut = useMutation({
    mutationFn: (name: string) => api.folders.create(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
      setCreateOpen(false);
      setFolderName("");
      toast.success("Folder created");
    },
    onError: () => toast.error("Failed to create folder"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.folders.update(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
      setEditFolder(null);
      setFolderName("");
      toast.success("Folder updated");
    },
    onError: () => toast.error("Failed to update folder"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.folders.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      toast.success("Folder deleted");
    },
    onError: () => toast.error("Failed to delete folder"),
  });

  const manualFolders = folders?.filter((f) => f.type !== "smart") || [];

  return (
    <Card className="bg-card border-border/60 shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-muted-foreground" />
            Folders
          </CardTitle>
          <Button
            size="sm"
            onClick={() => {
              setFolderName("");
              setCreateOpen(true);
            }}
            data-testid="btn-create-folder"
          >
            <Plus className="w-4 h-4 mr-1" />
            New
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex flex-col gap-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {manualFolders.map((f) => (
              <div
                key={f.id}
                className="flex items-center justify-between p-3 bg-muted/50 rounded-xl border"
              >
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{f.name}</span>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => {
                      setEditFolder(f);
                      setFolderName(f.name);
                    }}
                    data-testid={`btn-edit-folder-${f.id}`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:text-destructive"
                        data-testid={`btn-delete-folder-${f.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete "{f.name}"?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Equipment in this folder will become unfiled. This
                          cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteMut.mutate(f.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Yes, delete folder
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}

            {manualFolders.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No folders yet. Create one to organize equipment.
              </p>
            )}
          </div>
        )}
      </CardContent>

      {/* Create / Edit folder dialog */}
      <Dialog
        open={createOpen || !!editFolder}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false);
            setEditFolder(null);
            setFolderName("");
          }
        }}
      >
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>
              {editFolder ? "Edit Folder" : "Create Folder"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-1">
            <Label htmlFor="folderName">Folder Name</Label>
            <Input
              id="folderName"
              placeholder="e.g. Surgery Room 1"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  editFolder
                    ? updateMut.mutate({ id: editFolder.id, name: folderName })
                    : createMut.mutate(folderName);
                }
              }}
              data-testid="input-folder-name"
            />
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                editFolder
                  ? updateMut.mutate({ id: editFolder.id, name: folderName })
                  : createMut.mutate(folderName);
              }}
              disabled={
                !folderName.trim() || createMut.isPending || updateMut.isPending
              }
              data-testid="btn-save-folder"
            >
              {(createMut.isPending || updateMut.isPending) && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              {editFolder ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function PendingUsersSection() {
  const queryClient = useQueryClient();

  const { data: pendingUsers, isLoading } = useQuery({
    queryKey: ["/api/users/pending"],
    queryFn: api.users.listPending,
  });

  const updateStatusMut = useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: "active" | "blocked";
    }) => api.users.updateStatus(id, status),
    onSuccess: (_, { status }) => {
      navigator.vibrate?.(50);
      queryClient.invalidateQueries({ queryKey: ["/api/users/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast.success(status === "active" ? "User approved" : "User rejected");
    },
    onError: () => toast.error("Failed to update user status"),
  });

  return (
    <Card className="bg-card border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground" />
          Pending Users
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex flex-col gap-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : !pendingUsers || pendingUsers.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No pending users. All sign-ups have been reviewed.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {pendingUsers.map((user) => (
              <div
                key={user.id}
                data-testid={`pending-user-row-${user.id}`}
                className="flex items-center justify-between p-3 bg-background rounded-xl border border-border/60 gap-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {user.name || user.email}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {user.email}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Signed up {new Date(user.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive h-8 px-2.5"
                        disabled={updateStatusMut.isPending}
                        data-testid={`btn-reject-user-${user.id}`}
                      >
                        <XCircle className="w-3.5 h-3.5 mr-1" />
                        Reject
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Reject {user.name || user.email}?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          This user will be blocked from accessing VetTrack.
                          They will not be notified.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() =>
                            updateStatusMut.mutate({
                              id: user.id,
                              status: "blocked",
                            })
                          }
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Yes, reject user
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 px-2.5"
                    onClick={() =>
                      updateStatusMut.mutate({ id: user.id, status: "active" })
                    }
                    disabled={updateStatusMut.isPending}
                    data-testid={`btn-approve-user-${user.id}`}
                  >
                    <CheckCircle className="w-3.5 h-3.5 mr-1" />
                    Approve
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type UserRole = "admin" | "vet" | "technician" | "viewer";

const ROLE_BADGE_STYLES: Record<UserRole, string> = {
  admin: "bg-purple-100 text-purple-800 border-purple-200",
  vet: "bg-blue-100 text-blue-800 border-blue-200",
  technician: "bg-amber-100 text-amber-800 border-amber-200",
  viewer: "bg-slate-100 text-slate-700 border-slate-200",
};

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  vet: "Vet",
  technician: "Technician",
  viewer: "Viewer",
};

function RoleBadge({ role }: { role: string }) {
  const r = role as UserRole;
  const style =
    ROLE_BADGE_STYLES[r] ?? "bg-slate-100 text-slate-700 border-slate-200";
  const label = ROLE_LABELS[r] ?? role;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${style}`}
    >
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-emerald-50 text-emerald-700 border-emerald-200">
        Active
      </span>
    );
  }
  if (status === "blocked") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-red-50 text-red-700 border-red-200">
        Blocked
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-amber-50 text-amber-700 border-amber-200">
      Pending
    </span>
  );
}

type UserStatusFilter = "all" | "pending" | "active" | "blocked";

function UsersSection() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<UserStatusFilter>("all");
  const [pendingRoleChange, setPendingRoleChange] = useState<{
    user: User;
    newRole: UserRole;
  } | null>(null);
  const [pendingStatusChange, setPendingStatusChange] = useState<{
    user: User;
    newStatus: "pending" | "active" | "blocked";
  } | null>(null);

  const {
    data: usersPages,
    isLoading,
    fetchNextPage: fetchMoreUsers,
    hasNextPage: hasMoreUsers,
    isFetchingNextPage: isFetchingMoreUsers,
  } = useInfiniteQuery({
    queryKey: ["/api/users", statusFilter],
    queryFn: ({ pageParam = 1 }) =>
      api.users.listPaginated(
        pageParam as number,
        100,
        statusFilter === "all" ? undefined : statusFilter
      ),
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    initialPageParam: 1,
  });

  const users = useMemo(
    () => usersPages?.pages.flatMap((p) => p.items),
    [usersPages]
  );

  const updateRoleMut = useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole }) =>
      api.users.updateRole(id, role),
    onSuccess: () => {
      navigator.vibrate?.(50);
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setPendingRoleChange(null);
      toast.success("Role updated");
    },
    onError: () => toast.error("Failed to update role"),
  });

  const updateStatusMut = useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: "pending" | "active" | "blocked";
    }) => api.users.updateStatus(id, status),
    onSuccess: (_, { status }) => {
      navigator.vibrate?.(50);
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users/pending"] });
      toast.success(
        status === "active"
          ? "User approved"
          : status === "blocked"
            ? "User rejected"
            : "Status updated",
      );
    },
    onError: () => toast.error("Failed to update status"),
  });

  const filterButtons: { label: string; value: UserStatusFilter }[] = [
    { label: "All", value: "all" },
    { label: "Pending", value: "pending" },
    { label: "Active", value: "active" },
    { label: "Blocked", value: "blocked" },
  ];

  return (
    <Card className="bg-card border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Users className="w-4 h-4 text-muted-foreground" />
          Users
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Status filter tabs */}
        <div className="flex gap-1.5 mb-4 flex-wrap">
          {filterButtons.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setStatusFilter(value)}
              data-testid={`filter-users-${value}`}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                statusFilter === value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted/50 text-muted-foreground border-border hover:bg-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : !users || users.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            {statusFilter === "all"
              ? "No users found. Users appear here once they sign in."
              : `No ${statusFilter} users.`}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {(users ?? []).map((user) => (
              <div
                key={user.id}
                data-testid={`user-row-${user.id}`}
                className="flex items-start justify-between p-3 bg-muted/50 rounded-xl border gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium truncate">
                      {user.name || user.email}
                    </p>
                    <RoleBadge role={user.role} />
                    <StatusBadge status={user.status} />
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {user.email}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Joined {new Date(user.createdAt).toLocaleDateString()}
                  </p>
                  {user.status === "pending" && (
                    <div className="flex gap-2 mt-2">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive h-7 px-2 text-xs"
                            disabled={updateStatusMut.isPending}
                            data-testid={`btn-reject-user-${user.id}`}
                          >
                            <XCircle className="w-3 h-3 mr-1" />
                            Reject
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Reject {user.name || user.email}?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              This user will be blocked from accessing VetTrack.
                              This action can be reversed later.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() =>
                                updateStatusMut.mutate({
                                  id: user.id,
                                  status: "blocked",
                                })
                              }
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Yes, reject
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white h-7 px-2 text-xs"
                        onClick={() =>
                          updateStatusMut.mutate({
                            id: user.id,
                            status: "active",
                          })
                        }
                        disabled={updateStatusMut.isPending}
                        data-testid={`btn-approve-user-${user.id}`}
                      >
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Approve
                      </Button>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  <Select
                    value={user.role}
                    onValueChange={(role) => {
                      setPendingRoleChange({ user, newRole: role as UserRole });
                    }}
                  >
                    <SelectTrigger
                      className="w-32 h-8 text-xs"
                      data-testid={`select-role-${user.id}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="vet">Vet</SelectItem>
                      <SelectItem value="technician">Technician</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={user.status}
                    onValueChange={(status) => {
                      const newStatus = status as
                        | "pending"
                        | "active"
                        | "blocked";
                      if (newStatus === "blocked") {
                        setPendingStatusChange({ user, newStatus });
                      } else {
                        updateStatusMut.mutate({
                          id: user.id,
                          status: newStatus,
                        });
                      }
                    }}
                  >
                    <SelectTrigger
                      className="w-32 h-8 text-xs"
                      data-testid={`select-status-${user.id}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="blocked">Blocked</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
            {hasMoreUsers && (
              <div className="flex justify-center pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchMoreUsers()}
                  disabled={isFetchingMoreUsers}
                  data-testid="btn-load-more-users"
                >
                  {isFetchingMoreUsers ? (
                    <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Loading…</>
                  ) : (
                    "Load more"
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>

      {/* Role change confirmation dialog */}
      <AlertDialog
        open={!!pendingRoleChange}
        onOpenChange={(open) => {
          if (!open) setPendingRoleChange(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Change role to{" "}
              {ROLE_LABELS[pendingRoleChange?.newRole as UserRole] ??
                pendingRoleChange?.newRole}
              ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will change{" "}
              <strong>
                {pendingRoleChange?.user.name || pendingRoleChange?.user.email}
              </strong>
              's role from{" "}
              <strong>
                {ROLE_LABELS[pendingRoleChange?.user.role as UserRole] ??
                  pendingRoleChange?.user.role}
              </strong>{" "}
              to{" "}
              <strong>
                {ROLE_LABELS[pendingRoleChange?.newRole as UserRole] ??
                  pendingRoleChange?.newRole}
              </strong>
              . This affects what actions they can perform across VetTrack.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingRoleChange) {
                  updateRoleMut.mutate({
                    id: pendingRoleChange.user.id,
                    role: pendingRoleChange.newRole,
                  });
                }
              }}
              disabled={updateRoleMut.isPending}
            >
              {updateRoleMut.isPending ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : null}
              Yes, change role
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Block user confirmation dialog */}
      <AlertDialog
        open={!!pendingStatusChange}
        onOpenChange={(open) => {
          if (!open) setPendingStatusChange(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Block{" "}
              {pendingStatusChange?.user.name ||
                pendingStatusChange?.user.email}
              ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will immediately revoke{" "}
              <strong>
                {pendingStatusChange?.user.name ||
                  pendingStatusChange?.user.email}
              </strong>
              's access to VetTrack. They will not be able to log in until their
              status is changed back to Active.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingStatusChange) {
                  updateStatusMut.mutate({
                    id: pendingStatusChange.user.id,
                    status: pendingStatusChange.newStatus,
                  });
                  setPendingStatusChange(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={updateStatusMut.isPending}
            >
              {updateStatusMut.isPending ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : null}
              Yes, block user
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function DeletedItemsSection() {
  const queryClient = useQueryClient();

  const { data: deletedEquipment, isLoading: equipLoading } = useQuery({
    queryKey: ["/api/equipment/deleted"],
    queryFn: api.equipment.listDeleted,
  });

  const { data: deletedUsers, isLoading: usersLoading } = useQuery({
    queryKey: ["/api/users/deleted"],
    queryFn: api.users.listDeleted,
  });

  const restoreEquipMut = useMutation({
    mutationFn: (id: string) => api.equipment.restore(id),
    onSuccess: () => {
      navigator.vibrate?.(50);
      queryClient.invalidateQueries({ queryKey: ["/api/equipment/deleted"] });
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      toast.success("Equipment restored");
    },
    onError: () => toast.error("Failed to restore equipment"),
  });

  const restoreUserMut = useMutation({
    mutationFn: (id: string) => api.users.restore(id),
    onSuccess: () => {
      navigator.vibrate?.(50);
      queryClient.invalidateQueries({ queryKey: ["/api/users/deleted"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast.success("User restored");
    },
    onError: () => toast.error("Failed to restore user"),
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Deleted Equipment */}
      <Card className="bg-card border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Wrench className="w-4 h-4 text-muted-foreground" />
            Deleted Equipment
          </CardTitle>
        </CardHeader>
        <CardContent>
          {equipLoading ? (
            <div className="flex flex-col gap-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 rounded-xl" />
              ))}
            </div>
          ) : !deletedEquipment || deletedEquipment.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No deleted equipment.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {deletedEquipment.map((item: DeletedEquipment) => (
                <div
                  key={item.id}
                  data-testid={`deleted-equipment-row-${item.id}`}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-xl border gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    {(item.model || item.serialNumber) && (
                      <p className="text-xs text-muted-foreground truncate">
                        {[item.model, item.serialNumber]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Deleted {new Date(item.deletedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 gap-1"
                    disabled={restoreEquipMut.isPending}
                    data-testid={`btn-restore-equipment-${item.id}`}
                    onClick={() => restoreEquipMut.mutate(item.id)}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Restore
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Deleted Users */}
      <Card className="bg-card border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            Deleted Users
          </CardTitle>
        </CardHeader>
        <CardContent>
          {usersLoading ? (
            <div className="flex flex-col gap-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 rounded-xl" />
              ))}
            </div>
          ) : !deletedUsers || deletedUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No deleted users.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {deletedUsers.map((user: User) => (
                <div
                  key={user.id}
                  data-testid={`deleted-user-row-${user.id}`}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-xl border gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {user.name || user.email}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {user.email}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Deleted{" "}
                      {user.deletedAt
                        ? new Date(user.deletedAt).toLocaleDateString()
                        : "—"}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 gap-1"
                    disabled={restoreUserMut.isPending}
                    data-testid={`btn-restore-user-${user.id}`}
                    onClick={() => restoreUserMut.mutate(user.id)}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Restore
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const SEVERITY_STYLES: Record<string, string> = {
  low: "bg-blue-50 text-blue-700 border-blue-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  high: "bg-red-50 text-red-700 border-red-200",
};

const STATUS_STYLES: Record<string, string> = {
  open: "bg-red-50 text-red-700 border-red-200",
  in_progress: "bg-amber-50 text-amber-700 border-amber-200",
  resolved: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
};

function SupportSection() {
  const queryClient = useQueryClient();
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(
    null,
  );
  const [detailStatus, setDetailStatus] = useState<SupportTicketStatus>("open");
  const [detailNote, setDetailNote] = useState("");
  const [expandedDevice, setExpandedDevice] = useState(false);

  const { data: tickets, isLoading } = useQuery({
    queryKey: ["/api/support"],
    queryFn: api.support.list,
  });

  const updateMut = useMutation({
    mutationFn: ({
      id,
      status,
      adminNote,
    }: {
      id: string;
      status: SupportTicketStatus;
      adminNote: string;
    }) => api.support.update(id, { status, adminNote }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["/api/support"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/support/unresolved-count"],
      });
      setSelectedTicket(updated);
      toast.success("Ticket updated");
    },
    onError: () => toast.error("Failed to update ticket"),
  });

  const openDetail = (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    setDetailStatus(ticket.status);
    setDetailNote(ticket.adminNote || "");
    setExpandedDevice(false);
  };

  return (
    <Card className="bg-card border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
          <LifeBuoy className="w-4 h-4 text-muted-foreground" />
          Support Tickets
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex flex-col gap-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : !tickets || tickets.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No support tickets yet.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {tickets.map((ticket) => (
              <button
                key={ticket.id}
                onClick={() => openDetail(ticket)}
                data-testid={`ticket-row-${ticket.id}`}
                className="flex items-start justify-between p-3 bg-muted/50 rounded-xl border hover:bg-muted/80 transition-colors text-left w-full gap-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{ticket.title}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {ticket.userEmail}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(ticket.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span
                    className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded border font-medium uppercase",
                      SEVERITY_STYLES[ticket.severity],
                    )}
                  >
                    {ticket.severity}
                  </span>
                  <span
                    className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded border font-medium",
                      STATUS_STYLES[ticket.status],
                    )}
                  >
                    {STATUS_LABELS[ticket.status]}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </CardContent>

      {/* Ticket detail dialog */}
      <Dialog
        open={!!selectedTicket}
        onOpenChange={(open) => {
          if (!open) setSelectedTicket(null);
        }}
      >
        {selectedTicket && (
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="pr-6 leading-tight">
                {selectedTicket.title}
              </DialogTitle>
            </DialogHeader>

            <div className="flex flex-col gap-4">
              <div className="flex gap-2 flex-wrap">
                <span
                  className={cn(
                    "text-xs px-2 py-0.5 rounded border font-medium uppercase",
                    SEVERITY_STYLES[selectedTicket.severity],
                  )}
                >
                  {selectedTicket.severity} severity
                </span>
                <span
                  className={cn(
                    "text-xs px-2 py-0.5 rounded border font-medium",
                    STATUS_STYLES[selectedTicket.status],
                  )}
                >
                  {STATUS_LABELS[selectedTicket.status]}
                </span>
              </div>

              <div className="flex flex-col gap-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Description
                </p>
                <p className="text-sm whitespace-pre-wrap">
                  {selectedTicket.description}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div>
                  <span className="font-semibold text-muted-foreground">
                    Submitted by
                  </span>
                  <p className="truncate">{selectedTicket.userEmail}</p>
                </div>
                <div>
                  <span className="font-semibold text-muted-foreground">
                    Date
                  </span>
                  <p>{new Date(selectedTicket.createdAt).toLocaleString()}</p>
                </div>
                {selectedTicket.pageUrl && (
                  <div className="col-span-2">
                    <span className="font-semibold text-muted-foreground">
                      Page URL
                    </span>
                    <p className="truncate">{selectedTicket.pageUrl}</p>
                  </div>
                )}
                {selectedTicket.appVersion && (
                  <div>
                    <span className="font-semibold text-muted-foreground">
                      App Version
                    </span>
                    <p>{selectedTicket.appVersion}</p>
                  </div>
                )}
              </div>

              {selectedTicket.deviceInfo && (
                <div>
                  <button
                    onClick={() => setExpandedDevice((v) => !v)}
                    className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {expandedDevice ? (
                      <ChevronUp className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    )}
                    Device Info
                  </button>
                  {expandedDevice && (
                    <p className="text-xs mt-1 text-muted-foreground break-all">
                      {selectedTicket.deviceInfo}
                    </p>
                  )}
                </div>
              )}

              <div className="border-t pt-4 flex flex-col gap-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Admin Actions
                </p>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ticket-status" className="text-xs">
                    Status
                  </Label>
                  <Select
                    value={detailStatus}
                    onValueChange={(v) =>
                      setDetailStatus(v as SupportTicketStatus)
                    }
                  >
                    <SelectTrigger
                      id="ticket-status"
                      data-testid="select-ticket-status"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ticket-note" className="text-xs">
                    Internal Note
                  </Label>
                  <Textarea
                    id="ticket-note"
                    placeholder="Add an internal note..."
                    value={detailNote}
                    onChange={(e) => setDetailNote(e.target.value)}
                    rows={3}
                    data-testid="input-ticket-note"
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setSelectedTicket(null)}
                disabled={updateMut.isPending}
              >
                Close
              </Button>
              <Button
                onClick={() => {
                  updateMut.mutate({
                    id: selectedTicket.id,
                    status: detailStatus,
                    adminNote: detailNote,
                  });
                }}
                disabled={updateMut.isPending}
                data-testid="btn-update-ticket"
              >
                {updateMut.isPending && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </Card>
  );
}

const ACTION_TYPE_LABELS: Record<string, string> = {
  user_login: "User Login",
  user_provisioned: "User Provisioned",
  user_role_changed: "Role Changed",
  user_status_changed: "Status Changed",
  equipment_created: "Equipment Created",
  equipment_updated: "Equipment Updated",
  equipment_deleted: "Equipment Deleted",
  equipment_scanned: "Equipment Scanned",
  equipment_checked_out: "Checked Out",
  equipment_returned: "Returned",
  equipment_reverted: "Scan Reverted",
  equipment_bulk_deleted: "Bulk Deleted",
  equipment_bulk_moved: "Bulk Moved",
  equipment_imported: "Equipment Imported",
  folder_created: "Folder Created",
  folder_updated: "Folder Updated",
  folder_deleted: "Folder Deleted",
  alert_acknowledged: "Alert Acknowledged",
  alert_acknowledgment_removed: "Alert Ack Removed",
};

const ALL_ACTION_TYPES = Object.keys(ACTION_TYPE_LABELS);

function actionBadgeClass(actionType: string): string {
  if (actionType.includes("deleted"))
    return "bg-red-50 text-red-700 border-red-200";
  if (actionType.includes("created") || actionType.includes("provisioned"))
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (actionType.includes("login"))
    return "bg-muted text-muted-foreground border-border";
  if (actionType.includes("role") || actionType.includes("status"))
    return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-muted text-muted-foreground border-border";
}

function AuditLogsSection() {
  const [actionFilter, setActionFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [appliedFilters, setAppliedFilters] = useState<{
    actionType: string;
    from: string;
    to: string;
  }>({ actionType: "", from: "", to: "" });
  const [page, setPage] = useState(1);

  function applyFilters() {
    setAppliedFilters({
      actionType: actionFilter,
      from: fromDate,
      to: toDate,
    });
    setPage(1);
  }

  function clearFilters() {
    setActionFilter("");
    setFromDate("");
    setToDate("");
    setAppliedFilters({ actionType: "", from: "", to: "" });
    setPage(1);
  }

  const hasFilters =
    appliedFilters.actionType || appliedFilters.from || appliedFilters.to;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["/api/audit-logs", appliedFilters, page],
    queryFn: () =>
      api.auditLogs.list({
        actionType: appliedFilters.actionType || undefined,
        from: appliedFilters.from || undefined,
        to: appliedFilters.to || undefined,
        page,
      }),
    staleTime: 30_000,
  });

  const items = data?.items ?? [];

  return (
    <Card className="bg-card border-border/60 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-muted-foreground" />
            Audit Logs
          </CardTitle>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => refetch()}
            disabled={isLoading}
            data-testid="btn-refresh-audit-logs"
          >
            <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filter controls */}
        <div
          className="space-y-3 p-3 bg-muted/30 rounded-xl border"
          data-testid="audit-log-filters"
        >
          <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5" />
            Filter Logs
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Select
              value={actionFilter || "all"}
              onValueChange={(v) => setActionFilter(v === "all" ? "" : v)}
            >
              <SelectTrigger
                className="h-8 text-sm"
                data-testid="filter-action"
              >
                <SelectValue placeholder="All actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                {ALL_ACTION_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {ACTION_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-8 text-sm flex-1"
                data-testid="filter-from"
              />
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-8 text-sm flex-1"
                data-testid="filter-to"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={applyFilters}
              className="text-xs h-7"
              data-testid="btn-apply-filters"
            >
              Apply
            </Button>
            {hasFilters && (
              <Button
                variant="outline"
                size="sm"
                onClick={clearFilters}
                className="text-xs h-7"
                data-testid="btn-clear-filters"
              >
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Log table */}
        {isLoading ? (
          <div className="flex flex-col gap-2" data-testid="audit-log-loading">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        ) : isError ? (
          <div
            className="flex flex-col items-center py-8 gap-2 text-center"
            data-testid="audit-log-error"
          >
            <XCircle className="w-8 h-8 text-destructive/60" />
            <p className="text-sm font-medium text-destructive">
              Failed to load audit logs
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div
            className="flex flex-col items-center py-10 gap-2 text-center"
            data-testid="audit-log-empty"
          >
            <ClipboardList className="w-8 h-8 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">
              No audit log entries
            </p>
            <p className="text-xs text-muted-foreground">
              {hasFilters
                ? "Try adjusting your filters."
                : "Activity will appear here once actions are performed."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5" data-testid="audit-log-list">
            {items.map((entry) => (
              <AuditLogRow key={entry.id} entry={entry} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {(data?.hasMore || page > 1) && (
          <div
            className="flex items-center justify-between pt-2"
            data-testid="audit-log-pagination"
          >
            <p className="text-xs text-muted-foreground">Page {page}</p>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || isLoading}
                data-testid="btn-prev-page"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={!data?.hasMore || isLoading}
                data-testid="btn-next-page"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AuditLogRow({ entry }: { entry: AuditLog }) {
  return (
    <div
      className="flex flex-col gap-1 p-3 rounded-xl border border-border/60 bg-background hover:bg-muted/30 transition-colors"
      data-testid="audit-log-row"
    >
      <div className="flex items-start gap-2 flex-wrap">
        <span
          className={cn(
            "text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border shrink-0 mt-0.5",
            actionBadgeClass(entry.actionType),
          )}
        >
          {ACTION_TYPE_LABELS[entry.actionType] ?? entry.actionType}
        </span>
        <p className="text-sm text-foreground leading-snug flex-1 min-w-0">
          {entry.performedByEmail}
          {entry.targetType && entry.targetId && (
            <span className="text-muted-foreground"> · {entry.targetType}</span>
          )}
        </p>
      </div>
      <p className="text-xs text-muted-foreground pl-0.5">
        {format(new Date(entry.timestamp), "MMM d, yyyy 'at' h:mm a")}
      </p>
    </div>
  );
}
