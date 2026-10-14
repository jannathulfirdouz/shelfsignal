import { useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { useServerFn } from "@tanstack/react-start";
import { setRoleAndStore } from "@/lib/server-fns";
import { base44 } from "@/api/base44Client";
import { Loader2, UserRoundCog } from "lucide-react";

const ROLES = [
  { value: "owner", label: "Owner" },
  { value: "analyst", label: "Analyst" },
  { value: "store_manager", label: "Store manager" },
  { value: "viewer", label: "Viewer (read-only)" },
];

export function RoleSwitcher({ onApplied }) {
  const { user, refresh } = useAuth();
  const setRole = useServerFn(setRoleAndStore);
  const [stores, setStores] = useState([]);
  const [role, setRoleState] = useState(user?.app_role || user?.data?.app_role || "viewer");
  const [storeId, setStoreId] = useState(user?.store_id || user?.data?.store_id || "");
  const [saving, setSaving] = useState(false);

  function loadStores() {
    base44.entities.Store.list({ limit: 50 })
      .then((page) => setStores(page.items ?? []))
      .catch(() => setStores([]));
  }

  useEffect(() => {
    loadStores();
  }, []);

  useEffect(() => {
    setRoleState(user?.app_role || user?.data?.app_role || "viewer");
    setStoreId(user?.store_id || user?.data?.store_id || "");
  }, [user]);

  async function apply() {
    setSaving(true);
    try {
      await setRole({ data: { userId: user.id, appRole: role, storeId: role === "store_manager" ? storeId : "" } });
      await refresh();
      onApplied?.();
    } finally {
      setSaving(false);
    }
  }

  const selectCls =
    "w-full rounded-md border border-sidebar-border bg-sidebar-accent px-2.5 py-1.5 text-xs text-sidebar-accent-foreground focus:outline-none focus:ring-1 focus:ring-accent";

  return (
    <div className="rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/70">
        <UserRoundCog className="h-3.5 w-3.5" />
        Demo role switcher
      </div>
      <select value={role} onChange={(e) => setRoleState(e.target.value)} className={selectCls}>
        {ROLES.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      {role === "store_manager" && (
        <select
          value={storeId}
          onChange={(e) => setStoreId(e.target.value)}
          onFocus={loadStores}
          onMouseDown={loadStores}
          className={`${selectCls} mt-2 ${!storeId ? "text-sidebar-foreground/50" : ""}`}
        >
          <option value="">Select a store…</option>
          {stores.map((s) => (
            <option key={s.id} value={s.store_id}>
              {s.store_id} — {s.name}
            </option>
          ))}
        </select>
      )}
      {role === "store_manager" && !storeId && (
        <p className="mt-1.5 text-[11px] text-amber-300">A store is required for store managers.</p>
      )}
      <button
        onClick={apply}
        disabled={saving || (role === "store_manager" && !storeId)}
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md bg-accent px-2.5 py-1.5 text-xs font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        Apply role
      </button>
    </div>
  );
}