import React, { createContext, useContext, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Boxes,
  Activity,
  BarChart3,
  Settings,
  ChevronLeft,
  AlertTriangle,
  Printer,
  Shield,
} from "lucide-react";
import { useUserRole } from "@/lib/use-user-role";

/* ================= CONTEXT ================= */

type SidebarContextType = {
  open: boolean;
  toggle: () => void;
};

const SidebarContext = createContext<SidebarContextType | null>(null);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  const toggle = () => setOpen((prev) => !prev);

  return (
    <SidebarContext.Provider value={{ open, toggle }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("Sidebar must be used inside SidebarProvider");
  return ctx;
}

/* ================= NAV ITEMS ================= */

type NavItem = {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { name: "Dashboard",  href: "/dashboard",  icon: LayoutDashboard },
  { name: "Equipment",  href: "/equipment",  icon: Boxes },
  { name: "Activity",   href: "/activity",   icon: Activity },
  { name: "Analytics",  href: "/analytics",  icon: BarChart3 },
  { name: "Alerts",     href: "/alerts",     icon: AlertTriangle },
  { name: "Print QR",   href: "/print",      icon: Printer },
  { name: "Settings",   href: "/settings",   icon: Settings },
  { name: "Users",      href: "/admin/users", icon: Shield, adminOnly: true },
];

/* ================= HELPERS ================= */

// מסמן active גם לנתיבים מקוננים: /equipment/new → Equipment active
function isRouteActive(location: string, href: string): boolean {
  if (href === "/dashboard" || href === "/") {
    return location === "/" || location === "/dashboard";
  }
  return location === href || location.startsWith(href + "/");
}

/* ================= SIDEBAR ================= */

export function Sidebar() {
  const [location] = useLocation();
  const { open, toggle } = useSidebar();
  const { isAdmin } = useUserRole();

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.adminOnly || isAdmin,
  );

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-20 bg-black/40 md:hidden"
          onClick={toggle}
        />
      )}

      <aside
        className={`
          h-screen border-r bg-background flex flex-col z-30
          transition-all duration-300
          fixed md:relative
          ${open ? "w-64 translate-x-0" : "w-16 -translate-x-full md:translate-x-0"}
        `}
      >
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-3 border-b shrink-0">
          {open && (
            <span className="font-bold text-lg tracking-tight">VetTrack</span>
          )}
          <button
            onClick={toggle}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors ml-auto"
            aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
          >
            <ChevronLeft
              className={`w-4 h-4 transition-transform duration-300 ${
                open ? "" : "rotate-180"
              }`}
            />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const active = isRouteActive(location, item.href);

            return (
              // תוקן: Link ישירות ללא <a> פנימי
              <Link
                key={item.href}
                href={item.href}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                  transition-all duration-150 active:scale-[0.97]
                  ${active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }
                  ${!open ? "justify-center" : ""}
                `}
                title={!open ? item.name : undefined}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {open && <span className="truncate">{item.name}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t text-xs text-muted-foreground shrink-0">
          {open ? "VetTrack v1.0" : "v1"}
        </div>
      </aside>
    </>
  );
}
