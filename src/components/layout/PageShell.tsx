// src/components/layout/PageShell.tsx
// Desktop page wrapper. Renders Topbar + optional IconSidebar + content area.
// Does NOT replace the existing mobile Layout — that stays for mobile views.
// Use this for desktop-first pages.

import { Topbar } from "@/components/layout/Topbar";
import { SidebarDivider } from "@/components/layout/IconSidebar";
import { Sidebar } from "@/components/layout/Sidebar";
import { useDirection } from "@/hooks/useDirection";
import type { SidebarItem } from "@/components/layout/IconSidebar";

interface PageShellProps {
  /** Sidebar items for the current section. Omit to hide the sidebar (e.g. on Home). */
  sidebarItems?: SidebarItem[];
  children: React.ReactNode;
}

export function PageShell({ sidebarItems, children }: PageShellProps) {
  const dir = useDirection();

  return (
    <div dir={dir} className="min-h-screen min-w-0 bg-ivory-bg text-ivory-text flex flex-col">
      <Topbar />
      <div className="flex flex-1 min-h-0 min-w-0 overflow-x-hidden overflow-y-hidden">
        <Sidebar sidebarItems={sidebarItems} />
        <section className="flex-1 min-h-0 min-w-0 px-5 sm:px-6 pt-3 pb-5 overflow-x-hidden overflow-y-auto overscroll-contain">
          {children}
        </section>
      </div>
    </div>
  );
}

export { SidebarDivider };
