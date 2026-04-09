import { useSync } from "@/hooks/use-sync";
import { Loader } from "@/components/ui/loader";

interface SmartLoaderProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function SmartLoader({ size = "md", className }: SmartLoaderProps) {
  const { isSyncing } = useSync();
  return (
    <Loader
      size={size}
      variant={isSyncing ? "syncing" : "default"}
      label={isSyncing ? "Syncing data..." : undefined}
      className={className}
    />
  );
}
