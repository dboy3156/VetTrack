import { Card, CardContent } from "@/components/ui/card";

export function SkeletonEquipmentCard() {
  return (
    <Card className="bg-card border-border/60 shadow-sm">
      <CardContent className="p-4 flex items-center gap-3 min-h-[72px]">
        {/* Icon placeholder */}
        <div className="w-10 h-10 rounded-lg bg-muted animate-pulse shrink-0" />
        {/* Text placeholders */}
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <div className="h-4 w-3/4 rounded-md bg-muted animate-pulse" />
          <div className="h-3 w-1/2 rounded-md bg-muted animate-pulse" />
        </div>
        {/* Trailing badge placeholder */}
        <div className="h-6 w-16 rounded-full bg-muted animate-pulse shrink-0" />
      </CardContent>
    </Card>
  );
}

export function SkeletonAlertCard() {
  return (
    <Card className="bg-card border-border/60 shadow-sm overflow-hidden">
      {/* Main row */}
      <div className="p-4 flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-muted animate-pulse shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0 flex flex-col gap-2 pt-0.5">
          <div className="h-3.5 w-2/3 rounded-md bg-muted animate-pulse" />
          <div className="h-3 w-4/5 rounded-md bg-muted animate-pulse" />
        </div>
        <div className="w-4 h-4 rounded bg-muted animate-pulse shrink-0 mt-1" />
      </div>
      {/* Action footer placeholder */}
      <div className="px-4 pb-3">
        <div className="h-8 w-full rounded-xl bg-muted animate-pulse" />
      </div>
    </Card>
  );
}
