import { useCallback, useMemo, useRef, useState } from "react";
import { Redirect } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorCard } from "@/components/ui/error-card";
import { api } from "@/lib/api";
import { t } from "@/lib/i18n";
import { validateMergedForecastForApproval } from "../../lib/forecast/approve-gate";
import { applyManualQuantities, normalizeQuantityKey } from "@/lib/pharmacyForecastMerge";
import { useAuth } from "@/hooks/use-auth";
import type { ForecastDrugEntry, ForecastResult, ForecastPatientEntry } from "@/types";
import { Syringe, Loader2, FileUp, ClipboardPaste, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

function canAccessPharmacyForecast(role: string | null | undefined, effectiveRole: string | null | undefined): boolean {
  const r = String(effectiveRole ?? role ?? "").trim().toLowerCase();
  return (
    r === "technician" ||
    r === "lead_technician" ||
    r === "vet_tech" ||
    r === "senior_technician" ||
    r === "vet" ||
    r === "admin"
  );
}

function defaultWindowHours(): 24 | 72 {
  return new Date().getDay() === 4 ? 72 : 24;
}

function badgeVariantForDrug(d: ForecastDrugEntry): "sterilized" | "ok" | "secondary" | "maintenance" | "default" {
  if (d.flags.length > 0) return "maintenance";
  if (d.type === "cri") return "sterilized";
  if (d.type === "ld") return "ok";
  if (d.type === "prn") return "secondary";
  return "default";
}

function buildEmailPreviewBody(
  result: ForecastResult,
  technicianLabel: string,
  summaryLine: string,
): string {
  const lines: string[] = [];
  lines.push(summaryLine);
  lines.push(`${technicianLabel}`);
  lines.push("");
  for (const p of [...result.patients].sort((a, b) =>
    a.recordNumber.localeCompare(b.recordNumber, undefined, { numeric: true }),
  )) {
    lines.push("---");
    lines.push(`${p.name} · ${p.recordNumber} · ${p.species} · ${p.weightKg}`);
    lines.push(`${p.ownerName} · ${p.ownerPhone}`);
    for (const d of p.drugs) {
      const qty = d.quantityUnits == null ? "—" : String(d.quantityUnits);
      lines.push(`• ${d.drugName} (${d.type}) · ${qty} ${d.unitLabel}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export default function PharmacyForecastPage() {
  const { role, effectiveRole, isLoaded, name, email } = useAuth();
  const resolvedRole = String(effectiveRole ?? role ?? "").trim().toLowerCase();
  const canUse = canAccessPharmacyForecast(role, effectiveRole);

  const [step, setStep] = useState<"input" | "review">("input");
  const [inputMode, setInputMode] = useState<"paste" | "pdf">("paste");
  const [pasteText, setPasteText] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [windowHours, setWindowHours] = useState<24 | 72>(() => defaultWindowHours());

  const [forecastResult, setForecastResult] = useState<ForecastResult | null>(null);
  /** Server-issued parse session; approve sends only this + manual quantities */
  const [forecastParseId, setForecastParseId] = useState<string | null>(null);
  const [manualQty, setManualQty] = useState<Record<string, number>>({});

  const isThursday = new Date().getDay() === 4;

  const pharmacyEmailQuery = useQuery({
    queryKey: ["/api/forecast/clinic/pharmacy-email"],
    queryFn: api.forecast.getPharmacyEmail,
    enabled: isLoaded && canUse,
    retry: false,
  });

  const mergedPreview = useMemo(() => {
    if (!forecastResult) return null;
    return applyManualQuantities(forecastResult, manualQty);
  }, [forecastResult, manualQty]);

  const summary = useMemo(() => {
    if (!mergedPreview) return null;
    let cri = 0;
    let prn = 0;
    let ld = 0;
    let drugs = 0;
    let flags = 0;
    for (const p of mergedPreview.patients) {
      flags += p.flags.length;
      for (const d of p.drugs) {
        drugs += 1;
        flags += d.flags.length;
        if (d.type === "cri") cri += 1;
        if (d.type === "prn") prn += 1;
        if (d.type === "ld") ld += 1;
      }
    }
    return { drugs, cri, prn, ld, flags };
  }, [mergedPreview]);

  const approvalGate = useMemo(() => {
    if (!mergedPreview) return { ok: true as const };
    return validateMergedForecastForApproval(mergedPreview);
  }, [mergedPreview]);

  const parseMutation = useMutation({
    mutationFn: async () => {
      const params = { windowHours, weekendMode: windowHours === 72 };
      if (inputMode === "pdf") {
        if (!pdfFile) throw new Error(t.pharmacyForecast.errors.noFile);
        return api.forecast.parseMultipart(pdfFile, params);
      }
      const text = pasteText.trim();
      if (!text) throw new Error(t.pharmacyForecast.errors.noText);
      return api.forecast.parseJson({ text, ...params });
    },
    onSuccess: (data) => {
      const { parseId, ...rest } = data;
      const init: Record<string, number> = {};
      for (const p of rest.patients) {
        for (const d of p.drugs) {
          const key = normalizeQuantityKey(p.recordNumber, d.drugName);
          if (d.type === "prn" || d.flags.length > 0) init[key] = d.quantityUnits ?? 0;
        }
      }
      setManualQty(init);
      setForecastParseId(parseId);
      setForecastResult(rest);
      setStep("review");
      toast.success(t.pharmacyForecast.parseOk);
    },
    onError: (e: Error) => toast.error(e.message || t.pharmacyForecast.parseFailed),
  });

  const approveMutation = useMutation({
    mutationFn: () => {
      if (!forecastParseId) throw new Error("no parse session");
      return api.forecast.approve({ parseId: forecastParseId, manualQuantities: manualQty });
    },
    onSuccess: (res) => {
      toast.success(t.pharmacyForecast.approveOk);
      if (res.mailtoBodyTruncated) {
        toast.message(t.pharmacyForecast.mailtoTruncatedWarning);
      }
      if (res.mailtoUrl) {
        window.location.href = res.mailtoUrl;
      }
      setStep("input");
      setForecastResult(null);
      setForecastParseId(null);
      setPasteText("");
      setPdfFile(null);
      setManualQty({});
    },
    onError: (e: Error) => toast.error(e.message || t.pharmacyForecast.approveFailed),
  });

  const technicianLabel = name || email || "";

  const previewText = useMemo(() => {
    if (!mergedPreview) return "";
    const summary = t.pharmacyForecast.emailPreviewSummary(
      mergedPreview.patients.length,
      mergedPreview.windowHours,
    );
    return buildEmailPreviewBody(mergedPreview, technicianLabel, summary);
  }, [mergedPreview, technicianLabel, t]);

  const handleQtyChange = useCallback((key: string, raw: string) => {
    const n = parseInt(raw, 10);
    setManualQty((prev) => ({
      ...prev,
      [key]: Number.isFinite(n) && n >= 0 ? n : 0,
    }));
  }, []);

  if (isLoaded && resolvedRole === "student") {
    return <Redirect to="/equipment" replace />;
  }

  if (isLoaded && !canUse) {
    return (
      <Layout title={t.pharmacyForecast.title}>
        <ErrorCard
          message={`${t.pharmacyForecast.accessDenied}: ${t.pharmacyForecast.accessDeniedDetail}`}
        />
      </Layout>
    );
  }

  const pharmacyMissing = !pharmacyEmailQuery.data?.pharmacyEmail?.trim();

  return (
    <Layout title={t.pharmacyForecast.title}>
      <div className="space-y-4 pb-28 max-w-2xl mx-auto px-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Syringe className="h-6 w-6 text-primary" />
            {t.pharmacyForecast.title}
          </h1>
          <p className="text-sm text-muted-foreground">{t.pharmacyForecast.subtitle}</p>
        </div>

        {pharmacyMissing ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {t.pharmacyForecast.pharmacyEmailMissing}
          </div>
        ) : null}

        {step === "input" ? (
          <div className="space-y-4">
            {isThursday ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-amber-900">{t.pharmacyForecast.weekendBanner}</span>
                <Button type="button" variant="outline" size="sm" onClick={() => setWindowHours(24)}>
                  {t.pharmacyForecast.switchTo24}
                </Button>
              </div>
            ) : null}

            <div className="flex gap-2">
              <Button
                type="button"
                variant={inputMode === "paste" ? "default" : "outline"}
                size="sm"
                className="gap-2"
                onClick={() => setInputMode("paste")}
              >
                <ClipboardPaste className="h-4 w-4" />
                {t.pharmacyForecast.modePaste}
              </Button>
              <Button
                type="button"
                variant={inputMode === "pdf" ? "default" : "outline"}
                size="sm"
                className="gap-2"
                onClick={() => setInputMode("pdf")}
              >
                <FileUp className="h-4 w-4" />
                {t.pharmacyForecast.modePdf}
              </Button>
            </div>

            <div className="flex flex-wrap gap-4 items-center text-sm">
              <Label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="wh"
                  checked={windowHours === 24}
                  onChange={() => setWindowHours(24)}
                  className="accent-primary"
                />
                {t.pharmacyForecast.hours24}
              </Label>
              <Label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="wh"
                  checked={windowHours === 72}
                  onChange={() => setWindowHours(72)}
                  className="accent-primary"
                />
                {t.pharmacyForecast.hours72}
              </Label>
            </div>

            {inputMode === "paste" ? (
              <Textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={t.pharmacyForecast.pastePlaceholder}
                className="min-h-[160px] font-mono text-sm"
              />
            ) : (
              <div className="space-y-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
                />
                <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>
                  {t.pharmacyForecast.choosePdf}
                </Button>
                {pdfFile ? <p className="text-xs text-muted-foreground">{pdfFile.name}</p> : null}
              </div>
            )}

            <Button
              className="w-full"
              disabled={parseMutation.isPending}
              onClick={() => parseMutation.mutate()}
            >
              {parseMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t.pharmacyForecast.parseAction}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-2 -ms-2"
              onClick={() => {
                setStep("input");
                setForecastResult(null);
                setForecastParseId(null);
                setManualQty({});
              }}
            >
              <ArrowLeft className="h-4 w-4" />
              {t.pharmacyForecast.back}
            </Button>

            {summary ? (
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{t.pharmacyForecast.chipDrugs(summary.drugs)}</Badge>
                <Badge variant="outline">{t.pharmacyForecast.chipCri(summary.cri)}</Badge>
                <Badge variant="outline">{t.pharmacyForecast.chipPrn(summary.prn)}</Badge>
                <Badge variant="outline">{t.pharmacyForecast.chipLd(summary.ld)}</Badge>
                <Badge variant="maintenance">{t.pharmacyForecast.chipFlags(summary.flags)}</Badge>
              </div>
            ) : null}

            <Tabs defaultValue="review">
              <TabsList className="w-full grid grid-cols-2">
                <TabsTrigger value="review">{t.pharmacyForecast.tabReview}</TabsTrigger>
                <TabsTrigger value="email">{t.pharmacyForecast.tabEmail}</TabsTrigger>
              </TabsList>
              <TabsContent value="review" className="space-y-3 mt-3">
                {forecastResult?.patients.map((p: ForecastPatientEntry) => (
                  <Card key={`${p.recordNumber}-${p.name}`}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">
                        {p.name || t.common.unknown} · {p.recordNumber} · {p.weightKg} kg
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {p.flags.includes("PATIENT_UNKNOWN") ? (
                        <div className="text-xs font-medium text-amber-800">{t.pharmacyForecast.patientUnknown}</div>
                      ) : null}
                      {p.drugs.map((d: ForecastDrugEntry) => {
                        const key = normalizeQuantityKey(p.recordNumber, d.drugName);
                        const needsInput = d.type === "prn" || d.flags.length > 0;
                        const variant = badgeVariantForDrug(d);
                        const showFlagBg = d.flags.length > 0;
                        return (
                          <div
                            key={key}
                            className={cn(
                              "flex flex-col gap-2 rounded-lg border p-2 text-sm",
                              showFlagBg ? "border-amber-200 bg-amber-50" : "border-border",
                            )}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-medium">{d.drugName}</span>
                              <Badge variant={variant}>{d.type}</Badge>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {d.concentration} · {d.route}
                            </div>
                            {needsInput ? (
                              <div className="flex items-center gap-2">
                                <Label className="text-xs shrink-0">{t.pharmacyForecast.quantity}</Label>
                                <Input
                                  type="number"
                                  min={0}
                                  className="h-8 max-w-[100px]"
                                  value={manualQty[key] ?? ""}
                                  onChange={(e) => handleQtyChange(key, e.target.value)}
                                />
                                <span className="text-xs text-muted-foreground">{d.unitLabel}</span>
                              </div>
                            ) : (
                              <div className="text-sm">
                                {t.pharmacyForecast.quantity}:{" "}
                                <span className="font-semibold">{d.quantityUnits ?? "—"}</span> {d.unitLabel}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>
              <TabsContent value="email" className="mt-3">
                <pre className="whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 text-xs font-mono max-h-[420px] overflow-auto" dir="rtl">
                  {previewText}
                </pre>
              </TabsContent>
            </Tabs>

            <div className="text-xs text-muted-foreground">{t.pharmacyForecast.approveNote}</div>

            <div className="space-y-2">
              <Button
                className={cn(
                  "w-full",
                  approvalGate.ok && !pharmacyMissing ? "bg-green-600 hover:bg-green-600/90 text-white" : "bg-muted text-muted-foreground",
                )}
                disabled={
                  approveMutation.isPending ||
                  !approvalGate.ok ||
                  pharmacyMissing ||
                  !forecastResult ||
                  !forecastParseId
                }
                onClick={() => approveMutation.mutate()}
              >
                {approveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {!approvalGate.ok ? t.pharmacyForecast.approveCannotShort : t.pharmacyForecast.approveSend}
              </Button>
              {!approvalGate.ok ? (
                <p className="text-xs text-muted-foreground text-center px-1">
                  {t.pharmacyForecast.approveGateLabel(approvalGate.code, approvalGate.message)}
                </p>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
