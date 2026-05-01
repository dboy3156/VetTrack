import { useEffect, useState } from "react";
import { getErImpact } from "@/lib/api";
import { formatDateTimeByLocale, t } from "@/lib/i18n";
import type { ErImpactResponse, ErKpiWindowDays } from "../../shared/er-types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const WINDOW_OPTIONS: ErKpiWindowDays[] = [7, 14, 30];

function formatNum(v: number | null, fractionDigits = 2): string {
  if (v === null || Number.isNaN(v)) return "—";
  return v.toFixed(fractionDigits);
}

export default function ErImpactPage() {
  const [windowDays, setWindowDays] = useState<ErKpiWindowDays>(14);
  const [data, setData] = useState<ErImpactResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getErImpact(windowDays)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) setError(t.erImpact.loadError);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [windowDays]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t.erImpact.title}</h1>
        <p className="mt-2 text-muted-foreground">{t.erImpact.subtitle}</p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="er-impact-window">{t.erImpact.windowLabel}</Label>
          <Select
            value={String(windowDays)}
            onValueChange={(v) => setWindowDays(Number(v) as ErKpiWindowDays)}
          >
            <SelectTrigger id="er-impact-window" className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WINDOW_OPTIONS.map((d) => (
                <SelectItem key={d} value={String(d)}>
                  {t.erImpact.windowDays(d)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-muted-foreground text-sm">{t.common.loading}</p>
      ) : null}

      {!loading && data ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t.erImpact.baselinePeriod}: {data.baselineStartDate} → {data.baselineEndDate}
            </CardTitle>
            <p className="text-muted-foreground text-sm">
              {t.erImpact.generatedAt}: {formatDateTimeByLocale(new Date(data.generatedAt))}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-3">
              {data.comparisons.map((row) => {
                const label =
                  row.kpi === "doorToTriageMinutesP50"
                    ? t.erImpact.kpi.doorToTriageMinutesP50
                    : row.kpi === "missedHandoffRate"
                      ? t.erImpact.kpi.missedHandoffRate
                      : t.erImpact.kpi.medDelayRate;
                const frac = row.kpi === "doorToTriageMinutesP50" ? 1 : 4;
                const conf =
                  row.confidence === "high"
                    ? t.erImpact.confidence.high
                    : row.confidence === "medium"
                      ? t.erImpact.confidence.medium
                      : t.erImpact.confidence.low;
                return (
                  <li
                    key={row.kpi}
                    className="flex flex-col gap-1 rounded-md border border-border p-3"
                  >
                    <span className="font-medium">{label}</span>
                    <span className="text-muted-foreground text-sm">{conf}</span>
                    <div className="mt-1 grid gap-1 text-sm sm:grid-cols-2">
                      <span>
                        {t.erImpact.metricBaseline}: {formatNum(row.baselineValue, frac)}
                      </span>
                      <span>
                        {t.erImpact.metricCurrent}: {formatNum(row.currentValue, frac)}
                      </span>
                      <span>
                        {t.erImpact.metricDelta}: {formatNum(row.absoluteDelta, frac)}
                      </span>
                      <span>
                        {t.erImpact.metricDeltaPct}:{" "}
                        {row.percentDelta === null ? "—" : `${row.percentDelta.toFixed(1)}%`}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
