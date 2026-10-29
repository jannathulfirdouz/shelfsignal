import { useEffect, useState } from "react";
import { Link, useLocation, useRouter } from "@tanstack/react-router";
import { LayoutDashboard, Upload, ShieldCheck, LogOut, Menu, X, LineChart, BadgeCheck, Home, BarChart3, Boxes, Scale, Lock } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { RoleSwitcher } from "@/components/RoleSwitcher";

const NAV = [
  { to: "/", label: "Home", icon: Home },
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/sales", label: "Sales", icon: BarChart3 },
  { to: "/inventory", label: "Inventory", icon: Boxes },
  { to: "/import", label: "Import data", icon: Upload, importerOnly: true },
  { to: "/data-quality", label: "Data quality", icon: BadgeCheck },
  { to: "/governance", label: "Governance", icon: Scale, govOnly: true },
  { to: "/privacy", label: "Privacy", icon: Lock, ownerOnly: true },
  { to: "/admin", label: "Admin", icon: ShieldCheck, ownerOnly: true },
];

function NavItem({ to, label, icon: Icon, onClick }) {
  const location = useLocation();
  const active = location.pathname === to;
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-accent text-accent-foreground"
          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}

export function AppShell({ children }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const role = user?.app_role || user?.data?.app_role || "viewer";
  const isOwner = role === "owner";
  const canImport = role === "owner" || role === "analyst";

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Mobile top bar */}
      <header className="flex items-center justify-between bg-sidebar px-4 py-3 text-sidebar-foreground md:hidden">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <LineChart className="h-5 w-5 text-accent" />
          ShelfSignal
        </Link>
        <button onClick={() => setOpen((v) => !v)} aria-label="Menu" className="rounded-md p-1.5 hover:bg-sidebar-accent">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-64 transform bg-sidebar text-sidebar-foreground transition-transform md:static md:translate-x-0 ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex h-full flex-col">
            <div className="flex items-center gap-2.5 px-5 py-5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <LineChart className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold leading-tight text-white">ShelfSignal</p>
                <p className="text-[11px] text-sidebar-foreground/70">Retail intelligence</p>
              </div>
            </div>

            <nav className="mt-2 flex-1 space-y-1 px-3">
              {NAV.filter((n) => (!n.ownerOnly || isOwner) && (!n.importerOnly || canImport) && (!n.govOnly || canImport)).map((n) => (
                <NavItem key={n.to} {...n} onClick={() => setOpen(false)} />
              ))}
            </nav>

            <div className="space-y-3 border-t border-sidebar-border p-4">
              <RoleSwitcher
                onApplied={() => {
                  setOpen(false);
                  router.invalidate();
                }}
              />
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-sidebar-foreground">{user?.email || "Signed in"}</p>
                  <p className="text-[11px] capitalize text-sidebar-foreground/60">{role.replace("_", " ")}</p>
                </div>
                <button
                  onClick={() => logout()}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </aside>

        {open && <div className="fixed inset-0 z-30 bg-black/30 md:hidden" onClick={() => setOpen(false)} />}

        {/* Main */}
        <main className="min-w-0 flex-1">
          <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">{children}</div>
        </main>
      </div>
    </div>
  );
}