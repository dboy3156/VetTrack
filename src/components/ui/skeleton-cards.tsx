import { Card, CardContent } from "@/components/ui/card";

/**
 * SkeletonEquipmentCard — pixel-matches the real EquipmentItem card.
 *
 * aspectRatio "5/4" is set on the CardContent so the browser reserves the
 * exact same block space as the live card before any data arrives.
 * This eliminates the CLS that occurred when the live card replaced the skeleton.
 */
export function SkeletonEquipmentCard() {
  return (
    <Card className="bg-card border-border/60 shadow-sm overflow-hidden">
      <CardContent
        className="p-4 flex items-center gap-3"
        style={{ aspectRatio: "5/4", minHeight: 72 }}
      >
        {/* Icon placeholder — matches real card's 40×40 icon */}
        <div
          className="rounded-lg bg-muted animate-pulse shrink-0"
          style={{ width: 40, height: 40, aspectRatio: "1/1" }}
        />
        {/* Text area */}
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <div className="h-4 w-3/4 rounded-md bg-muted animate-pulse" />
          <div className="h-3 w-1/2 rounded-md bg-muted animate-pulse" />
        </div>
        {/* Trailing badge placeholder — flexShrink:0 prevents sibling shift */}
        <div
          className="h-6 w-16 rounded-full bg-muted animate-pulse"
          style={{ flexShrink: 0, minWidth: 64 }}
        />
      </CardContent>
    </Card>
  );
}

/**
 * AuditRowSkeleton — pixel-matches an AuditLogRow.
 *
 * Fixed minHeight:60 keeps the container stable between loading and loaded states.
 * Shimmer is driven by animate-pulse (same as all other skeletons in the app).
 */
export function AuditRowSkeleton() {
  return (
    <div
      className="flex items-start gap-3 px-4 py-3 border-b last:border-b-0"
      style={{ minHeight: 60 }}
    >
      {/* Timestamp column — fixed width matches the real timestamp span */}
      <div
        className="h-3 rounded-md bg-muted animate-pulse mt-0.5"
        style={{ width: 130, flexShrink: 0 }}
      />
      {/* Content column */}
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        {/* Action badge row */}
        <div className="flex items-center gap-2">
          <div className="h-5 w-24 rounded-full bg-muted animate-pulse" style={{ flexShrink: 0 }} />
          <div className="h-3 w-1/3 rounded-md bg-muted animate-pulse" />
        </div>
        {/* Staff row */}
        <div className="h-3 w-2/5 rounded-md bg-muted animate-pulse" />
      </div>
      {/* Target ID pill — hidden on mobile but always reserved */}
      <div
        className="h-3 w-14 rounded-md bg-muted animate-pulse hidden sm:block"
        style={{ flexShrink: 0 }}
      />
    </div>
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
