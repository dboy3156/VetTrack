import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ORPHAN_DRUG_ALERTS_QUERY_KEY } from "@/lib/event-reducer";
import type { CopAlertEntry } from "@/types/cop-alerts";
import { t } from "@/lib/i18n";

function reasonLabel(code: string): string {
  switch (code) {
    case "NO_PATIENT_LINKED":
      return t.cop.reason_NO_PATIENT_LINKED;
    case "NO_ACTIVE_HOSPITALIZATION":
      return t.cop.reason_NO_ACTIVE_HOSPITALIZATION;
    case "NO_ACTIVE_ORDER":
      return t.cop.reason_NO_ACTIVE_ORDER;
    case "QUANTITY_EXCEEDS_ORDER":
      return t.cop.reason_QUANTITY_EXCEEDS_ORDER;
    default:
      return code;
  }
}

export function CopDiscrepancyBanner(): JSX.Element | null {
  const qc = useQueryClient();
  const { data: alerts } = useQuery({
    queryKey: ORPHAN_DRUG_ALERTS_QUERY_KEY,
    initialData: [] as CopAlertEntry[],
    staleTime: Infinity,
  });

  if (!alerts?.length) return null;

  const latest = alerts[0];

  const patient = (() => {
    if (latest.variant === "order_mismatch") {
      return latest.animalDisplayName?.trim() || latest.animalId || t.cop.unknownPatient;
    }
    if (latest.variant === "charged_no_admin") {
      return latest.animalDisplayName?.trim() || latest.animalId || t.cop.unknownPatient;
    }
    if (latest.variant === "admin_no_dispense") {
      return latest.animalDisplayName?.trim() || latest.animalId || t.cop.unknownPatient;
    }
    return t.cop.unknownPatient;
  })();

  let title = t.cop.discrepancyTitle;
  let subtitle = t.cop.discrepancySubtitle;
  let detailLine: string | null = null;

  if (latest.variant === "charged_no_admin") {
    title = t.cop.chargedNoAdminTitle;
    subtitle = t.cop.chargedNoAdminSubtitle;
    detailLine = t.cop.chargedNoAdminDetail({
      billingId: latest.billingLedgerId.slice(0, 8),
      hours: latest.windowHours,
    });
  } else if (latest.variant === "admin_no_dispense") {
    title = t.cop.adminNoDispenseTitle;
    subtitle = t.cop.adminNoDispenseSubtitle;
    detailLine = t.cop.adminNoDispenseDetail({
      taskId: latest.taskId.slice(0, 8),
      hours: latest.lookbackHours,
    });
  }

  const firstLine = latest.variant === "order_mismatch" ? latest.orphanLines[0] : null;
  const drugSummary = firstLine ? t.cop.drugLine(firstLine.label, firstLine.quantity) : "";

  return (
    <Card className="border-amber-600 bg-amber-950/40 text-amber-50 shadow-md">
      <CardHeader className="flex flex-row items-start gap-3 space-y-0 pb-2">
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" aria-hidden />
        <div className="flex flex-1 flex-col gap-1">
          <CardTitle className="flex items-center justify-between gap-2 text-base text-amber-50">
            <span>{title}</span>
            {latest.dismissable ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-amber-100 hover:bg-amber-900/50"
                aria-label={t.cop.dismiss}
                onClick={() => {
                  qc.setQueryData(ORPHAN_DRUG_ALERTS_QUERY_KEY, (prev: CopAlertEntry[] | undefined) =>
                    (prev ?? []).filter((x) => x.eventId !== latest.eventId),
                  );
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-0 text-sm">
        <p>{subtitle}</p>
        {detailLine ? <p className="text-xs opacity-90">{detailLine}</p> : null}
        <p className="font-medium">
          {t.cop.patientLabel}: {patient}
          {latest.variant === "order_mismatch" && drugSummary ? ` — ${drugSummary}` : ""}
        </p>
        {latest.variant === "order_mismatch" && firstLine ? (
          <p className="text-xs opacity-90">
            {t.cop.reasonsPrefix}: {firstLine.reasons.map((r) => reasonLabel(r)).join("; ")}
          </p>
        ) : null}
        {!latest.dismissable ? (
          <p className="text-xs text-amber-200/90">{t.cop.resolveOnlyFooter}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
