import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/AuthContext";
import { listUsersForAdmin, setRoleAndStore } from "@/lib/server-fns";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Lock, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_authed/admin")({
  ssr: false,
  head: () => ({ meta: [{ title: "Admin · ShelfSignal" }] }),
  component: AdminPage,
});

const ROLES = ["owner", "store_manager", "analyst", "viewer"];

function AdminPage() {
  const { user, refresh } = useAuth();
  const role = user?.app_role || user?.data?.app_role || "viewer";
  const listUsers = useServerFn(listUsersForAdmin);
  const setRole = useServerFn(setRoleAndStore);
  const [users, setUsers] = useState(null);
  const [stores, setStores] = useState([]);
  const [saving, setSaving] = useState(null);

  function loadStores() {
    base44.entities.Store.list({ limit: 50 }).then((p) => setStores(p.items ?? [])).catch(() => setStores([]));
  }

  useEffect(() => {
    if (role !== "owner") return;
    listUsers().then(setUsers).catch(() => setUsers([]));
    loadStores();
  }, [role]);

  if (role !== "owner") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-20 text-center">
        <Lock className="h-8 w-8 text-muted-foreground" />
        <p className="font-medium">Owners only</p>
        <p className="max-w-sm text-sm text-muted-foreground">Switch to the owner role to manage users and roles.</p>
      </div>
    );
  }

  async function update(userId, appRole, storeId) {
    if (appRole === "store_manager" && !storeId) {
      // Block saving: show the store picker, but keep the previous role until a store is chosen.
      setUsers((prev) => prev?.map((u) => (u.id === userId ? { ...u, pending_role: appRole } : u)) ?? []);
      return;
    }
    setSaving(userId);
    try {
      await setRole({ data: { userId, appRole, storeId: appRole === "store_manager" ? storeId : "" } });
      if (userId === user.id) await refresh();
      setUsers((prev) => prev?.map((u) => (u.id === userId ? { ...u, app_role: appRole, store_id: storeId, pending_role: undefined } : u)) ?? []);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold md:text-3xl">
          <ShieldCheck className="h-6 w-6 text-accent" />
          Admin
        </h1>
        <p className="mt-1 text-muted-foreground">Manage app users, their roles and store assignments.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Users & roles</CardTitle>
          <CardDescription>Roles drive row-level access. Store managers only see their own store's data.</CardDescription>
        </CardHeader>
        <CardContent>
          {users === null ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : users.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No users found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="pb-2 font-medium">User</th>
                    <th className="pb-2 font-medium">Role</th>
                    <th className="pb-2 font-medium">Store</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-t border-border">
                      <td className="py-3">
                        <p className="font-medium">{u.email}</p>
                        <p className="text-xs text-muted-foreground">{u.full_name || "—"}</p>
                      </td>
                      <td className="py-3">
                        <select
                          value={u.pending_role || u.app_role}
                          onChange={(e) => update(u.id, e.target.value, u.store_id)}
                          disabled={saving === u.id}
                          className="rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r.replace("_", " ")}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3">
                        {(u.pending_role || u.app_role) === "store_manager" ? (
                          <select
                            value={u.store_id}
                            onChange={(e) => update(u.id, "store_manager", e.target.value)}
                            onFocus={loadStores}
                            onMouseDown={loadStores}
                            disabled={saving === u.id}
                            className="rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
                          >
                            <option value="">Select…</option>
                            {stores.map((s) => (
                              <option key={s.id} value={s.store_id}>
                                {s.store_id} — {s.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                        {u.pending_role === "store_manager" && !u.store_id && (
                          <p className="mt-1 text-xs text-amber-600">Select a store to save this role.</p>
                        )}
                        {saving === u.id && <Loader2 className="ml-2 inline h-3.5 w-3.5 animate-spin" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}