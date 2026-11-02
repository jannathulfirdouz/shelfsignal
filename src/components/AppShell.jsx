import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ensureViewerRole } from "@/lib/server-fns";
import { LayoutDashboard, Upload, ShieldCheck, LogOut, Menu, X, LineChart, BadgeCheck, Home, BarChart3, Boxes, Scale, Lock, Users, TrendingUp, BrainCircuit, Lightbulb, Info } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { Tour } from "@/components/Tour";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, signedInOnly: true },
  { to: "/sales", label: "Sales", icon: BarChart3 },
  { to: "/inventory", label: "Inventory", icon: Boxes },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/forecasting", label: "Forecasting", icon: TrendingUp },
  { to: "/actions", label: "Action centre", icon: Lightbulb },
  { to: "/import", label: "Import data", icon: Upload, importerOnly: true },
  { to: "/data-quality", label: "Data quality", icon: BadgeCheck },
  { to: "/models", label: "Models", icon: BrainCircuit, govOnly: true },
  { to: "/governance", label: "Governance", icon: Scale },
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
  const { user, isLoadingAuth, logout, navigateToLogin } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const role = user?.app_role || user?.data?.app_role || "viewer";
  const isOwner = role === "owner";
  const canImport = role === "owner" || role === "analyst";
  // No session once auth has resolved means the public, read-only demo visitor.
  const isDemo = !isLoadingAuth && !user;

  // A newly created account arrives with no role: settle it as viewer once, so a
  // sign-up from the login page can never reach a higher role.
  const ensureRole = useServerFn(ensureViewerRole);
  const missingRole = Boolean(user) && !user.app_role && !user.data?.app_role;
  const roleSettled = useRef(false);
  useEffect(() => {
    if (!missingRole || roleSettled.current) return;
    roleSettled.current = true;
    ensureRole({ data: {} }).catch(() => { roleSettled.current = false; });
  }, [missingRole, ensureRole]);

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Mobile top bar */}
      <header className="flex items-center justify-between bg-sidebar px-4 py-3 text-sidebar-foreground md:hidden">
        <Link to="/home" className="flex items-center gap-2 font-semibold">
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

            <nav className="mt-2 flex-1 space-y-1 overflow-y-auto px-3 pb-2">
              {NAV.filter(
                (n) =>
                  (!n.ownerOnly || isOwner) &&
                  (!n.importerOnly || canImport) &&
                  (!n.govOnly || canImport) &&
                  (!n.signedInOnly || !isDemo),
              ).map((n) => (
                <NavItem key={n.to} {...n} onClick={() => setOpen(false)} />
              ))}
            </nav>

            <div className="space-y-3 border-t border-sidebar-border p-4">
              <Link
                to="/about"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-lg px-1 py-1 text-xs text-sidebar-foreground/70 hover:text-sidebar-foreground"
              >
                <Info className="h-3.5 w-3.5" />
                About this app
              </Link>

              {isDemo ? (
                <div className="space-y-2 rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/70">Public demo</p>
                  <p className="text-[11px] text-sidebar-foreground/60">Read-only. Sign in to run models, import data or decide actions.</p>
                  <Button size="sm" className="w-full" onClick={() => navigateToLogin()}>Sign in</Button>
                </div>
              ) : (
                <>
                  {isOwner && (
                    <RoleSwitcher
                      onApplied={() => {
                        setOpen(false);
                        router.invalidate();
                      }}
                    />
                  )}
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
                </>
              )}
            </div>
          </div>
        </aside>

        {open && <div className="fixed inset-0 z-30 bg-black/30 md:hidden" onClick={() => setOpen(false)} />}

        {/* Main */}
        <main className="min-w-0 flex-1">
          {isDemo && (
            <div className="border-b border-amber-200 bg-amber-50">
              <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs text-amber-900 md:px-8">
                <span>Public demo · read-only. Nothing you click here changes the data.</span>
                <button onClick={() => navigateToLogin()} className="font-semibold underline underline-offset-2">Sign in</button>
              </div>
            </div>
          )}
          <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">{children}</div>
        </main>
      </div>

      <Tour />
    </div>
  );
}