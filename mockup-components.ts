import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { customFetch } from "@/lib/api";
import { Shield, User, ChevronDown } from "lucide-react";
import { useUserRole } from "@/lib/use-user-role";
import { Redirect } from "wouter";

type UserRecord = {
  clerkId: string;
  role: "admin" | "technician";
  createdAt: string;
};

function useUsers() {
  return useQuery<UserRecord[]>({
    queryKey: ["admin-users"],
    queryFn: () => customFetch("/api/users"),
    retry: false,
  });
}

function useUpdateUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clerkId, role }: { clerkId: string; role: "admin" | "technician" }) =>
      customFetch(`/api/users/${clerkId}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });
}

export default function AdminUsers() {
  const { role, isLoading: roleLoading } = useUserRole();
  const { data: users, isLoading: usersLoading } = useUsers();
  const updateRole = useUpdateUserRole();
  const [editing, setEditing] = useState<string | null>(null);

  if (!roleLoading && role !== "admin") {
    return <Redirect to="/" />;
  }

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold">User Management</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Manage user roles. Admins have full access. Technicians can scan, view, and add equipment, but cannot delete.
        </p>

        {usersLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 bg-muted rounded-lg animate-pulse" />
            ))}
          </div>
        ) : !users || users.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">
            No users have signed in yet.
          </div>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden divide-y divide-border">
            {users.map((user) => (
              <div key={user.clerkId} className="flex items-center justify-between px-4 py-3 bg-white">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{user.clerkId}</p>
                    <p className="text-xs text-muted-foreground">
                      Joined {new Date(user.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="relative ml-4 shrink-0">
                  <button
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${
                      user.role === "admin"
                        ? "border-primary text-primary bg-primary/5 hover:bg-primary/10"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                    onClick={() => setEditing(editing === user.clerkId ? null : user.clerkId)}
                    disabled={updateRole.isPending}
                  >
                    {user.role === "admin" && <Shield className="w-3.5 h-3.5" />}
                    <span className="capitalize">{user.role}</span>
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>

                  {editing === user.clerkId && (
                    <div className="absolute right-0 top-full mt-1 w-36 bg-white border border-border rounded-lg shadow-lg z-50 py-1">
                      {(["admin", "technician"] as const).map((r) => (
                        <button
                          key={r}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-muted ${
                            user.role === r ? "font-semibold text-primary" : "text-foreground"
                          }`}
                          onClick={() => {
                            setEditing(null);
                            if (user.role !== r) {
                              updateRole.mutate({ clerkId: user.clerkId, role: r });
                            }
                          }}
                        >
                          {r === "admin" && <Shield className="w-3.5 h-3.5 text-primary" />}
                          <span className="capitalize">{r}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
