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
import { validateMergedForecastForApproval } from "@/lib/forecast/approveGate";
import { applyManualQuantities, normalizeQuantityKey } from "@/lib/pharmacyForecastMerge";
import { useAuth } from "@/hooks/use-auth";
import type { ForecastDrugEntry, ForecastResult, ForecastPatientEntry } from "@/types";
import type { AuditState, PatientAuditState, DrugAuditEntry } from "@/types";
import { Checkbox } from "@/components/ui/checkbox";
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
  const formatter = new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    weekday: "long",
  });
  return formatter.format(new Date()).includes("חמישי") ? 72 : 24;
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
    lines.push(
      `${p.name} · ${p.recordNumber} · ${p.species}${p.age ? ` · age ${p.age}` : ""}${p.color ? ` · ${p.color}` : ""} · ${p.weightKg} kg`,
    );
    lines.push(`${p.ownerName} · ${p.ownerPhone}`);
    for (const d of p.drugs) {
      const qty = d.quantityUnits == null ? "—" : String(d.quantityUnits);
      lines.push(`• ${d.drugName} (${d.type}) · ${qty} ${d.unitLabel}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

const PATIENT_WARNING_FLAGS = [
  "PATIENT_UNKNOWN",
  "WEIGHT_UNKNOWN",
  "WEIGHT_UNCERTAIN",
  "ALL_DRUGS_EXCLUDED",
] as const;

function initAuditState(parseId: string, result: ForecastResult): AuditState {
  const patients: Record<string, PatientAuditState> = {};
  for (const p of result.patients) {
    const drugs: Record<string, DrugAuditEntry> = {};
    for (const d of p.drugs) {
      drugs[d.drugName] = {
        forecastedQty: d.quantityUnits,
        onHandQty: 0,
        orderQty: d.quantityUnits ?? 0,
        confirmed: false,
      };
    }
    patients[p.recordNumber] = {
      recordNumber: p.recordNumber,
      warningAcknowledgements: {},
      weightOverride: null,
      patientNameOverride: null,
      drugs,
    };
  }
  return { forecastRunId: parseId, patients };
}

function isPatientAuditComplete(
  pAudit: PatientAuditState,
  p: ForecastPatientEntry,
): boolean {
  for (const flag of p.flags) {
    if (!(PATIENT_WARNING_FLAGS as readonly string[]).includes(flag)) continue;
    if (flag === "WEIGHT_UNKNOWN") {
      if (pAudit.weightOverride == null || pAudit.weightOverride <= 0) return false;
    } else {
      if (!pAudit.warningAcknowledgements[flag]) return false;
    }
  }
  if (p.drugs.length > 0) {
    for (const d of p.drugs) {
      if (!pAudit.drugs[d.drugName]?.confirmed) return false;
    }
  }
  return true;
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
  /** Keys (`normalizeQuantityKey`) for DOSE_HIGH / DOSE_LOW lines acknowledged by pharmacist. */
  const [pharmacistDoseAcks, setPharmacistDoseAcks] = useState<Record<string, boolean>>({});
  const [auditState, setAuditState] = useState<AuditState | null>(null);
  const [activeTab, setActiveTab] = useState<"review" | "audit" | "email">("review");

  const isThursday = new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    weekday: "long",
  })
    .format(new Date())
    .includes("חמישי");

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
    const keys = new Set(
      Object.entries(pharmacistDoseAcks)
        .filter(([, v]) => v)
        .map(([k]) => k),
    );
    return validateMergedForecastForApproval(mergedPreview, { pharmacistDoseAckKeys: keys });
  }, [mergedPreview, pharmacistDoseAcks]);

  const auditComplete = useMemo(() => {
    if (!auditState || !forecastResult) return false;
    return forecastResult.patients.every((p) => {
      const pAudit = auditState.patients[p.recordNumber];
      return pAudit != null && isPatientAuditComplete(pAudit, p);
    });
  }, [auditState, forecastResult]);

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
      setPharmacistDoseAcks({});
      setForecastParseId(parseId);
      setForecastResult(rest);
      setAuditState(initAuditState(parseId, rest));
      setActiveTab("review");
      setStep("review");
      toast.success(t.pharmacyForecast.parseOk);
    },
    onError: (e: Error) => toast.error(e.message || t.pharmacyForecast.parseFailed),
  });

  const approveMutation = useMutation({
    mutationFn: () => {
      if (!forecastParseId) throw new Error("no parse session");
      const trace: Record<string, { forecastedQty: number | null; onHandQty: number }> = {};
      const weightOverrides: Record<string, number> = {};
      if (auditState) {
        for (const pAudit of Object.values(auditState.patients)) {
          if (pAudit.weightOverride != null && pAudit.weightOverride > 0) {
            weightOverrides[pAudit.recordNumber] = pAudit.weightOverride;
          }
          for (const [drugName, entry] of Object.entries(pAudit.drugs)) {
            const key = normalizeQuantityKey(pAudit.recordNumber, drugName);
            trace[key] = { forecastedQty: entry.forecastedQty, onHandQty: entry.onHandQty };
          }
        }
      }
      return api.forecast.approve({
        parseId: forecastParseId,
        manualQuantities: manualQty,
        pharmacistDoseAcks: Object.entries(pharmacistDoseAcks)
          .filter(([, v]) => v)
          .map(([k]) => k),
        auditTrace: Object.keys(trace).length > 0 ? trace : undefined,
        patientWeightOverrides: Object.keys(weightOverrides).length > 0 ? weightOverrides : undefined,
      });
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
      setPharmacistDoseAcks({});
      setAuditState(null);
      setActiveTab("review");
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
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-foreground">
            {t.pharmacyForecast.pharmacyEmailMissing}
          </div>
        ) : null}

        {step === "input" ? (
          <div className="space-y-4">
            {isThursday ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-foreground">{t.pharmacyForecast.weekendBanner}</span>
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
                setPharmacistDoseAcks({});
                setAuditState(null);
                setActiveTab("review");
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

            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
              <TabsList className="w-full grid grid-cols-3">
                <TabsTrigger value="review">{t.pharmacyForecast.tabReview}</TabsTrigger>
                <TabsTrigger value="audit">{t.pharmacyForecast.tabAudit}</TabsTrigger>
                <TabsTrigger
                  value="email"
                  disabled={!auditComplete}
                  title={!auditComplete ? t.pharmacyForecast.auditTabLocked : undefined}
                >
                  {t.pharmacyForecast.tabEmail}
                </TabsTrigger>
              </TabsList>

              {/* ── Review tab — unchanged content ── */}
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
                      {p.flags.includes("WEIGHT_UNKNOWN") ? (
                        <div className="text-xs font-medium text-amber-800">{t.pharmacyForecast.weightUnknownBanner}</div>
                      ) : null}
                      {p.flags.includes("ALL_DRUGS_EXCLUDED") ? (
                        <div className="text-xs font-medium text-amber-800">
                          {t.pharmacyForecast.allDrugsExcludedWarning}
                        </div>
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
                            <div className="text-xs text-muted-foreground">{d.concentration} · {d.route}</div>
                            {d.flags.includes("DUPLICATE_LINE") ? (
                              <div className="text-xs text-amber-800">{t.pharmacyForecast.duplicateLineWarning}</div>
                            ) : null}
                            {(d.flags.includes("DOSE_HIGH") || d.flags.includes("DOSE_LOW")) && (
                              <label className="flex items-center gap-2 text-xs cursor-pointer">
                                <input
                                  type="checkbox"
                                  className="accent-primary"
                                  checked={pharmacistDoseAcks[key] ?? false}
                                  onChange={(e) =>
                                    setPharmacistDoseAcks((prev) => ({ ...prev, [key]: e.target.checked }))
                                  }
                                />
                                {t.pharmacyForecast.pharmacistDoseAckLabel}
                              </label>
                            )}
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
                            {mergedPreview && d.administrationsPer24h != null && d.administrationsInWindow != null ? (
                              <p className="text-xs text-muted-foreground pt-1">
                                {t.pharmacyForecast.quantityFrequencyBasis(
                                  d.administrationsPer24h,
                                  d.administrationsInWindow,
                                  mergedPreview.windowHours,
                                )}
                              </p>
                            ) : null}
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>

              {/* ── Audit tab ── */}
              <TabsContent value="audit" className="space-y-4 mt-3">
                {forecastResult && auditState
                  ? forecastResult.patients.map((p) => {
                      const pAudit = auditState.patients[p.recordNumber]!;
                      const patientFlags = p.flags.filter((f) =>
                        (PATIENT_WARNING_FLAGS as readonly string[]).includes(f),
                      );
                      const resolvedWarnings = patientFlags.filter((f) =>
                        f === "WEIGHT_UNKNOWN"
                          ? pAudit.weightOverride != null && pAudit.weightOverride > 0
                          : !!pAudit.warningAcknowledgements[f],
                      ).length;
                      const confirmedDrugs = p.drugs.filter((d) => pAudit.drugs[d.drugName]?.confirmed).length;
                      const complete = isPatientAuditComplete(pAudit, p);

                      const updateDrug = (drugName: string, patch: Partial<DrugAuditEntry>) => {
                        setAuditState((prev) => {
                          if (!prev) return prev;
                          const pp = prev.patients[p.recordNumber]!;
                          const dd = pp.drugs[drugName]!;
                          const merged = { ...dd, ...patch };
                          if ("onHandQty" in patch) {
                            merged.orderQty = Math.max(0, (merged.forecastedQty ?? 0) - merged.onHandQty);
                          }
                          return {
                            ...prev,
                            patients: {
                              ...prev.patients,
                              [p.recordNumber]: { ...pp, drugs: { ...pp.drugs, [drugName]: merged } },
                            },
                          };
                        });
                      };

                      const ackWarning = (flag: string, val: boolean) =>
                        setAuditState((prev) => {
                          if (!prev) return prev;
                          const pp = prev.patients[p.recordNumber]!;
                          return {
                            ...prev,
                            patients: {
                              ...prev.patients,
                              [p.recordNumber]: {
                                ...pp,
                                warningAcknowledgements: { ...pp.warningAcknowledgements, [flag]: val },
                              },
                            },
                          };
                        });

                      const setWeight = (kg: number) =>
                        setAuditState((prev) => {
                          if (!prev) return prev;
                          const pp = prev.patients[p.recordNumber]!;
                          return {
                            ...prev,
                            patients: { ...prev.patients, [p.recordNumber]: { ...pp, weightOverride: kg } },
                          };
                        });

                      return (
                        <Card key={p.recordNumber}>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-base flex items-center justify-between">
                              <span>
                                {p.name || t.common.unknown} · {p.recordNumber} ·{" "}
                                {pAudit.weightOverride ?? p.weightKg} kg
                              </span>
                              {complete ? <Badge variant="ok">✓ הושלם</Badge> : null}
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            {/* Warnings panel */}
                            {patientFlags.length > 0 && (
                              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-3">
                                <div className="text-xs font-semibold text-amber-900">
                                  {t.pharmacyForecast.auditWarningsTitle}
                                </div>
                                {patientFlags.map((flag) =>
                                  flag === "WEIGHT_UNKNOWN" ? (
                                    <div key={flag} className="space-y-1">
                                      <div className="text-xs font-medium text-amber-800">
                                        ⚠ WEIGHT_UNKNOWN — {t.pharmacyForecast.auditWeightLabel}
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <Input
                                          type="number"
                                          min={0.1}
                                          step={0.1}
                                          placeholder={t.pharmacyForecast.auditWeightPlaceholder}
                                          className="h-8 max-w-[90px]"
                                          value={pAudit.weightOverride ?? ""}
                                          onChange={(e) => {
                                            const v = parseFloat(e.target.value);
                                            if (v > 0) setWeight(v);
                                          }}
                                        />
                                        {pAudit.weightOverride != null && pAudit.weightOverride > 0 && (
                                          <span className="text-xs text-green-700">✓ {pAudit.weightOverride} ק״ג</span>
                                        )}
                                      </div>
                                    </div>
                                  ) : (
                                    <label key={flag} className="flex items-center gap-2 text-xs cursor-pointer">
                                      <Checkbox
                                        checked={!!pAudit.warningAcknowledgements[flag]}
                                        onCheckedChange={(v) => ackWarning(flag, !!v)}
                                      />
                                      <span className="font-medium text-amber-800">⚠ {flag}</span>
                                      <span className="text-amber-700">— {t.pharmacyForecast.auditAckLabel}</span>
                                    </label>
                                  ),
                                )}
                              </div>
                            )}

                            {/* Drug audit table */}
                            {p.drugs.length > 0 && (
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm border-collapse">
                                  <thead>
                                    <tr className="border-b text-xs text-muted-foreground">
                                      <th className="text-right py-1 px-2 font-medium">תרופה</th>
                                      <th className="text-center py-1 px-2 font-medium whitespace-nowrap">
                                        {t.pharmacyForecast.auditForecasted}
                                      </th>
                                      <th className="text-center py-1 px-2 font-medium whitespace-nowrap">
                                        {t.pharmacyForecast.auditOnHand}
                                      </th>
                                      <th className="text-center py-1 px-2 font-medium whitespace-nowrap">
                                        {t.pharmacyForecast.auditOrder}
                                      </th>
                                      <th className="text-center py-1 px-2 font-medium">
                                        {t.pharmacyForecast.auditConfirmed}
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {p.drugs.map((d) => {
                                      const entry = pAudit.drugs[d.drugName]!;
                                      return (
                                        <tr key={d.drugName} className="border-b last:border-0">
                                          <td className="py-2 px-2">
                                            <div className="font-medium">{d.drugName}</div>
                                            <div className="text-xs text-muted-foreground">
                                              {d.concentration} · {d.route}
                                            </div>
                                          </td>
                                          <td className="text-center py-2 px-2 tabular-nums">
                                            {entry.forecastedQty ?? "—"}{" "}
                                            <span className="text-xs text-muted-foreground">{d.unitLabel}</span>
                                          </td>
                                          <td className="text-center py-2 px-2">
                                            <Input
                                              type="number"
                                              min={0}
                                              className="h-7 w-16 text-center mx-auto"
                                              value={entry.onHandQty}
                                              onChange={(e) => {
                                                const v = parseInt(e.target.value, 10);
                                                updateDrug(d.drugName, {
                                                  onHandQty: Number.isFinite(v) && v >= 0 ? v : 0,
                                                });
                                              }}
                                            />
                                          </td>
                                          <td className="text-center py-2 px-2 tabular-nums font-semibold text-green-700">
                                            {entry.orderQty}
                                          </td>
                                          <td className="text-center py-2 px-2">
                                            <Checkbox
                                              checked={entry.confirmed}
                                              onCheckedChange={(v) =>
                                                updateDrug(d.drugName, { confirmed: !!v })
                                              }
                                            />
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}

                            {/* Progress + Generate button */}
                            <div className="flex items-center justify-between pt-1">
                              <span className="text-xs text-muted-foreground">
                                {confirmedDrugs} / {p.drugs.length} תרופות · {resolvedWarnings} /{" "}
                                {patientFlags.length} אזהרות
                              </span>
                              <Button
                                size="sm"
                                disabled={!complete}
                                onClick={() => {
                                  const newQty = { ...manualQty };
                                  for (const d of p.drugs) {
                                    const entry = pAudit.drugs[d.drugName];
                                    if (entry != null) {
                                      newQty[normalizeQuantityKey(p.recordNumber, d.drugName)] = entry.orderQty;
                                    }
                                  }
                                  setManualQty(newQty);
                                  // If every patient is now complete, open email tab
                                  if (auditComplete) setActiveTab("email");
                                }}
                              >
                                {t.pharmacyForecast.auditGenerateEmail}
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })
                  : null}
              </TabsContent>

              {/* ── Email tab ── */}
              <TabsContent value="email" className="mt-3">
                <pre
                  className="whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 text-xs font-mono max-h-[420px] overflow-auto"
                  dir="rtl"
                >
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
                  !forecastParseId ||
                  !auditComplete
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
