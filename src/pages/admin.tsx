import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { api } from "@/lib/api";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Shield, Users, FolderOpen, Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";

export default function AdminPage() {
  const { isAdmin } = useAuth();
  const [, navigate] = useLocation();

  if (!isAdmin) {
    return (
      <Layout>
        <Helmet>
          <title>Admin — VetTrack</title>
          <meta name="description" content="VetTrack administration panel. Manage equipment folders, user roles, and system settings for your veterinary clinic." />
        </Helmet>
        <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
          <Shield className="w-12 h-12 text-muted-foreground" />
          <h1 className="text-2xl font-bold">Admin Only</h1>
          <p className="text-sm text-muted-foreground">You need admin access to view this page.</p>
          <Button variant="ghost" onClick={() => navigate("/")}>
            Go Home
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Helmet>
        <title>Admin — VetTrack</title>
        <meta name="description" content="VetTrack administration panel. Manage equipment folders, user roles, and system settings for your veterinary clinic." />
        <link rel="canonical" href="https://vettrack.replit.app/admin" />
      </Helmet>
      <div className="flex flex-col gap-6 pb-24">
        <h1 className="text-2xl font-bold leading-tight flex items-center gap-2">
          <Shield className="w-6 h-6 text-primary" />
          Admin
        </h1>
        <FoldersSection />
        <UsersSection />
      </div>
    </Layout>
  );
}

function FoldersSection() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editFolder, setEditFolder] = useState<{ id: string; name: string } | null>(null);
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
    mutationFn: ({ id, name }: { id: string; name: string }) => api.folders.update(id, name),
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
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-primary" />
            Folders
          </CardTitle>
          <Button
            size="sm"
            onClick={() => { setFolderName(""); setCreateOpen(true); }}
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
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {/* Manual folders */}
            {manualFolders.map((f) => (
              <div key={f.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-xl border">
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{f.name}</span>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => { setEditFolder(f); setFolderName(f.name); }}
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
                          Equipment in this folder will become unfiled.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteMut.mutate(f.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Delete
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
          if (!open) { setCreateOpen(false); setEditFolder(null); setFolderName(""); }
        }}
      >
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>{editFolder ? "Edit Folder" : "Create Folder"}</DialogTitle>
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
              disabled={!folderName.trim() || createMut.isPending || updateMut.isPending}
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
  const style = ROLE_BADGE_STYLES[r] ?? "bg-slate-100 text-slate-700 border-slate-200";
  const label = ROLE_LABELS[r] ?? role;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${style}`}>
      {label}
    </span>
  );
}

function UsersSection() {
  const queryClient = useQueryClient();

  const { data: users, isLoading } = useQuery({
    queryKey: ["/api/users"],
    queryFn: api.users.list,
  });

  const updateRoleMut = useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole }) =>
      api.users.updateRole(id, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast.success("Role updated");
    },
    onError: () => toast.error("Failed to update role"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          Users
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex flex-col gap-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
          </div>
        ) : users?.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No users found. Users appear here once they sign in.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {users?.map((user) => (
              <div key={user.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-xl border gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium truncate">{user.name || user.email}</p>
                    <RoleBadge role={user.role} />
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                </div>
                <Select
                  value={user.role}
                  onValueChange={(role) => updateRoleMut.mutate({ id: user.id, role: role as UserRole })}
                >
                  <SelectTrigger className="w-36 h-9 text-xs shrink-0" data-testid={`select-role-${user.id}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="vet">Vet</SelectItem>
                    <SelectItem value="technician">Technician</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
