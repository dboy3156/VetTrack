import { SkeletonEquipmentCard } from "@/components/ui/skeleton-cards";

interface EquipmentListSkeletonProps {
  count?: number;
}

export function EquipmentListSkeleton({ count = 6 }: EquipmentListSkeletonProps) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonEquipmentCard key={i} />
      ))}
    </div>
  );
}
