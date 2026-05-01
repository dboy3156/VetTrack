import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getErImpact } from "@/lib/er-api";
import { t } from "@/lib/i18n";
import type { ErKpiWindowDays } from "../../shared/er-types";

const WINDOWS: ErKpiWindowDays[] = [7, 14, 30];

export default function ErImpactPage() {
  const [windowDays, setWindowDays] = useState<ErKpiWindowDays>(14);

  const q = useQuery({
    queryKey: ["er", "impact", windowDays],
    queryFn: () => getErImpact({ window: windowDays }),
  });

  const body = useMemo(() => {
    if (q.isLoading) return <p className="text-muted-foreground text-sm">{t.erImpact.noData}</p>;
    if (q.isError || !q.data) {
      return <p className="text-destructive text-sm">{t.erImpact.loadError}</p>;
    }
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {q.data.comparisons.map((c) => (
          <Card key={c.kpi}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{t.erImpact.kpi[c.kpi]}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div>
                <span className="text-muted-foreground">{t.erImpact.metricBaseline}: </span>
                <span className="tabular-nums">{c.baselineValue ?? "—"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">{t.erImpact.metricCurrent}: </span>
                <span className="tabular-nums">{c.currentValue ?? "—"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">{t.erImpact.metricDelta}: </span>
                <span className="tabular-nums">{c.absoluteDelta ?? "—"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">{t.erImpact.metricDeltaPct}: </span>
                <span className="tabular-nums">{c.percentDelta ?? "—"}</span>
              </div>
              <div className="text-muted-foreground text-xs">
                {t.erImpact.confidence[c.confidence as keyof typeof t.erImpact.confidence]}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }, [q.data, q.isError, q.isLoading]);

  return (
    <Layout>
      <Helmet>
        <title>{t.erImpact.title}</title>
      </Helmet>
      <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4 md:p-8">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t.erImpact.title}</h1>
            <p className="text-muted-foreground text-sm">{t.erImpact.subtitle}</p>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-muted-foreground text-xs font-medium">{t.erImpact.windowLabel}</span>
            <Select
              value={String(windowDays)}
              onValueChange={(v) => setWindowDays(Number(v) as ErKpiWindowDays)}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WINDOWS.map((w) => (
                  <SelectItem key={w} value={String(w)}>
                    {t.erImpact.windowDays(w)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {q.data ? (
          <p className="text-muted-foreground text-xs">
            {t.erImpact.baselinePeriod}: {q.data.baselineStartDate} → {q.data.baselineEndDate} · {t.erImpact.generatedAt}:{" "}
            {new Date(q.data.generatedAt).toLocaleString()}
          </p>
        ) : null}

        {body}
      </div>
    </Layout>
  );
}
