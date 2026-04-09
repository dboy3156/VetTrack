import { Skeleton } from "@/components/ui/skeleton";
import { Layout } from "@/components/layout";

export function EquipmentDetailSkeleton() {
  return (
    <Layout>
      <div className="flex flex-col gap-4 pb-24">
        {/* Back button + title */}
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-xl" />
          <Skeleton className="h-6 w-44" />
        </div>

        {/* Hero card */}
        <Skeleton className="h-48 w-full rounded-2xl" />

        {/* Metadata rows */}
        <div className="flex flex-col gap-2 px-1">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="h-12 rounded-xl" />
        </div>

        {/* History / timeline block */}
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    </Layout>
  );
}
