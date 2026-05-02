// Desktop sidebar: icon rail + optional operational column (overflow-visible so inline dialogs are not clipped).
import { IconSidebar } from "@/components/layout/IconSidebar";
import type { SidebarItem } from "@/components/layout/IconSidebar";
import { useAuth } from "@/hooks/use-auth";
import { ErModeToggle } from "@/features/er-admin/ErModeToggle";
import { cn } from "@/lib/utils";

interface SidebarProps {
  sidebarItems?: SidebarItem[];
}

export function Sidebar({ sidebarItems }: SidebarProps) {
  const { userId, isLoaded, canManageErMode } = useAuth();
  const showOps = Boolean(isLoaded && userId && canManageErMode);

  if (!sidebarItems?.length && !showOps) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex flex-row shrink-0 min-h-0 overflow-x-visible overflow-y-auto max-h-[100dvh]",
        showOps && "border-e border-ivory-border bg-[#f0ede6]",
      )}
    >
      {sidebarItems && sidebarItems.length > 0 ? <IconSidebar items={sidebarItems} /> : null}
      {showOps ? (
        <div className="w-[176px] shrink-0 border-s border-ivory-border/70 px-2 py-3 overflow-visible flex flex-col gap-2">
          <ErModeToggle />
        </div>
      ) : null}
    </div>
  );
}
