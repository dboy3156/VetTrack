import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import {
  ShieldCheck,
  Play,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  SkipForward,
  Activity,
  Zap,
  Server,
  Search,
  Trash2,
  FlaskConical,
  RefreshCw,
  CalendarClock,
  ToggleLeft,
  ToggleRight,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { toast } from "sonner";

const API = "/api/stability";

async function fetchStatus() {
  const res = await fetch(`${API}/status`, { credentials: "include" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function fetchResults() {
  const res = await fetch(`${API}/results`, { credentials: "include" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function fetchLogs(limit: number, search: string) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (search) params.set("search", search);
  const res = await fetch(`${API}/logs?${params}`, { credentials: "include" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

type TestStatus = "pass" | "fail" | "warn" | "skip";
type Suite = "functional" | "stress" | "edge";

interface TestResult {
  id: string;
  suite: Suite;
  name: string;
  status: TestStatus;
  durationMs: number;
  expected?: string;
  actual?: string;
  detail?: string;
}

interface TestReport {
  runId: string;
  startedAt: string;
  finishedAt: string | null;
  status: "idle" | "running" | "done" | "error";
  results: TestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    warned: number;
    skipped: number;
    avgLatencyMs: number;
    maxLatencyMs: number;
  };
}

interface StabilityStatus {
  running: boolean;
  testModeEnabled: boolean;
  scheduleHours: number;
  lastRun: TestReport | null;
}

interface LogEntry {
  id: string;
  timestamp: string;
  level: "info" | "success" | "warn" | "error";
  category: string;
  action: string;
  detail?: string;
  durationMs?: number;
}

function statusBadge(s: TestStatus) {
  const cfg: Record<TestStatus, { label: string; className: string; icon: React.ReactNode }> = {
    pass: { label: "PASS", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300", icon: <CheckCircle2 className="w-3 h-3" /> },
    fail: { label: "FAIL", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300", icon: <XCircle className="w-3 h-3" /> },
    warn: { label: "WARN", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300", icon: <AlertTriangle className="w-3 h-3" /> },
    skip: { label: "SKIP", className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400", icon: <SkipForward className="w-3 h-3" /> },
  };
  const c = cfg[s];
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-semibold", c.className)}>
      {c.icon}{c.label}
    </span>
  );
}

function logLevelColor(level: LogEntry["level"]) {
  return {
    info: "text-blue-600 dark:text-blue-400",
    success: "text-green-600 dark:text-green-400",
    warn: "text-amber-600 dark:text-amber-400",
    error: "text-red-600 dark:text-red-400",
  }[level];
}

function suiteLabel(s: Suite) {
  return {
    functional: { label: "Functional", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
    stress: { label: "Stress", className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" },
    edge: { label: "Edge Case", className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" },
  }[s];
}

function SystemStatusBadge({ status, running }: { status: TestReport | null; running: boolean }) {
  if (running) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-semibold text-sm">
        <RefreshCw className="w-4 h-4 animate-spin" />
        Testing in progress...
      </div>
    );
  }
  if (!status) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-semibold text-sm">
        <Activity className="w-4 h-4" />
        No tests run yet
      </div>
    );
  }
  const failed = status.summary.failed;
  const warned = status.summary.warned;
  if (failed > 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 font-semibold text-sm">
        <XCircle className="w-4 h-4" />
        Issues Detected ({failed} failed)
      </div>
    );
  }
  if (warned > 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-semibold text-sm">
        <AlertTriangle className="w-4 h-4" />
        Warnings ({warned} warned)
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 font-semibold text-sm">
      <ShieldCheck className="w-4 h-4" />
      All Tests Stable
    </div>
  );
}

function SuiteSection({ suite, results }: { suite: Suite; results: TestResult[] }) {
  const [expanded, setExpanded] = useState(true);
  const sl = suiteLabel(suite);
  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const warned = results.filter((r) => r.status === "warn").length;

  return (
    <div className="border rounded-xl overflow-hidden dark:border-gray-700">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between p-4 bg-muted/40 hover:bg-muted/60 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className={cn("text-xs font-semibold px-2 py-0.5 rounded", sl.className)}>{sl.label}</span>
          <span className="font-medium text-sm">{results.length} tests</span>
          <span className="text-xs text-green-600 dark:text-green-400">{passed} passed</span>
          {failed > 0 && <span className="text-xs text-red-600 dark:text-red-400">{failed} failed</span>}
          {warned > 0 && <span className="text-xs text-amber-600 dark:text-amber-400">{warned} warned</span>}
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {expanded && (
        <div className="divide-y dark:divide-gray-700">
          {results.map((r) => (
            <div key={r.id} className="p-3 flex flex-col gap-1 text-sm bg-background">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium flex-1 min-w-0 truncate">{r.name}</span>
                <div className="flex items-center gap-2 shrink-0">
                  {r.durationMs > 0 && (
                    <span className="text-xs text-muted-foreground font-mono">{r.durationMs}ms</span>
                  )}
                  {statusBadge(r.status)}
                </div>
              </div>
              {(r.expected || r.actual) && (
                <div className="flex gap-4 text-xs text-muted-foreground font-mono">
                  {r.expected && <span>expected: <span className="text-foreground">{r.expected}</span></span>}
                  {r.actual && <span>actual: <span className={cn(r.status === "fail" ? "text-red-500" : "text-foreground")}>{r.actual}</span></span>}
                </div>
              )}
              {r.detail && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">{r.detail}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const SCHEDULE_OPTIONS = [
  { label: "Disabled", value: 0 },
  { label: "Every 2 hours", value: 2 },
  { label: "Every 4 hours", value: 4 },
  { label: "Every 8 hours", value: 8 },
  { label: "Every 12 hours", value: 12 },
  { label: "Every 24 hours", value: 24 },
];

export default function StabilityDashboardPage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [logSearch, setLogSearch] = useState("");
  const [logLimit] = useState(150);

  const { data: statusData, isLoading: statusLoading } = useQuery<StabilityStatus>({
    queryKey: ["/api/stability/status"],
    queryFn: fetchStatus,
    refetchInterval: 5000,
  });

  const { data: results } = useQuery<TestReport>({
    queryKey: ["/api/stability/results"],
    queryFn: fetchResults,
    refetchInterval: statusData?.running ? 3000 : 10000,
    enabled: !statusLoading,
  });

  const { data: logs = [], isLoading: logsLoading } = useQuery<LogEntry[]>({
    queryKey: ["/api/stability/logs", logLimit, logSearch],
    queryFn: () => fetchLogs(logLimit, logSearch),
    refetchInterval: 5000,
  });

  const runMutation = useMutation({
    mutationFn: () => fetch(`${API}/run`, { method: "POST", credentials: "include" }).then((r) => r.json()),
    onSuccess: () => {
      toast.success("Test run started");
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["/api/stability/status"] });
        qc.invalidateQueries({ queryKey: ["/api/stability/results"] });
      }, 1000);
    },
    onError: () => toast.error("Failed to start test run"),
  });

  const testModeMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      fetch(`${API}/test-mode`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      }).then((r) => r.json()),
    onSuccess: (_, enabled) => {
      toast.success(enabled ? "Testing mode enabled" : "Testing mode disabled");
      qc.invalidateQueries({ queryKey: ["/api/stability/status"] });
    },
  });

  const scheduleMutation = useMutation({
    mutationFn: (hours: number) =>
      fetch(`${API}/schedule`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours }),
      }).then((r) => r.json()),
    onSuccess: (data) => {
      toast.success(data.message);
      qc.invalidateQueries({ queryKey: ["/api/stability/status"] });
    },
  });

  const clearLogsMutation = useMutation({
    mutationFn: () =>
      fetch(`${API}/logs`, { method: "DELETE", credentials: "include" }).then((r) => r.json()),
    onSuccess: () => {
      toast.success("Logs cleared");
      qc.invalidateQueries({ queryKey: ["/api/stability/logs"] });
    },
  });

  if (!isAdmin) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <ShieldCheck className="w-12 h-12 text-muted-foreground" />
          <p className="text-muted-foreground">Admin access required</p>
          <Button asChild variant="outline"><Link href="/">Go Home</Link></Button>
        </div>
      </Layout>
    );
  }

  const status = statusData;
  const report = results;
  const summary = report?.summary;
  const isRunning = status?.running ?? false;

  const functionalResults = report?.results.filter((r) => r.suite === "functional") ?? [];
  const stressResults = report?.results.filter((r) => r.suite === "stress") ?? [];
  const edgeResults = report?.results.filter((r) => r.suite === "edge") ?? [];

  return (
    <Layout>
      <Helmet>
        <title>Stability Dashboard — VetTrack</title>
      </Helmet>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FlaskConical className="w-6 h-6 text-primary" />
              Stability Dashboard
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Detect bugs, crashes, and performance issues before real-world use
            </p>
          </div>
          <SystemStatusBadge status={report ?? null} running={isRunning} />
        </div>

        {/* Controls Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Run button */}
          <Card>
            <CardContent className="p-4 flex flex-col gap-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Test Suite</p>
              <Button
                onClick={() => runMutation.mutate()}
                disabled={isRunning || runMutation.isPending}
                className="gap-2 w-full"
              >
                {isRunning ? (
                  <><RefreshCw className="w-4 h-4 animate-spin" />Running...</>
                ) : (
                  <><Play className="w-4 h-4" />Run All Tests</>
                )}
              </Button>
              {report?.finishedAt && (
                <p className="text-xs text-muted-foreground text-center">
                  Last run: {format(new Date(report.finishedAt), "HH:mm:ss")}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Testing Mode */}
          <Card>
            <CardContent className="p-4 flex flex-col gap-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Testing Mode</p>
              <button
                onClick={() => testModeMutation.mutate(!(status?.testModeEnabled ?? false))}
                disabled={testModeMutation.isPending}
                className="flex items-center gap-3 py-2 px-3 rounded-lg border hover:bg-muted/50 transition-colors w-full"
              >
                {status?.testModeEnabled ? (
                  <ToggleRight className="w-5 h-5 text-primary" />
                ) : (
                  <ToggleLeft className="w-5 h-5 text-muted-foreground" />
                )}
                <span className={cn("text-sm font-medium", status?.testModeEnabled ? "text-primary" : "text-muted-foreground")}>
                  {status?.testModeEnabled ? "Enabled" : "Disabled"}
                </span>
              </button>
              <p className="text-xs text-muted-foreground">Enable to run CRUD tests safely with isolated test data</p>
            </CardContent>
          </Card>

          {/* Schedule */}
          <Card>
            <CardContent className="p-4 flex flex-col gap-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <CalendarClock className="w-3.5 h-3.5" />Auto Schedule
              </p>
              <select
                value={status?.scheduleHours ?? 0}
                onChange={(e) => scheduleMutation.mutate(Number(e.target.value))}
                className="w-full text-sm border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={scheduleMutation.isPending}
              >
                {SCHEDULE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              {(status?.scheduleHours ?? 0) > 0 && (
                <p className="text-xs text-green-600 dark:text-green-400">
                  Next run auto-scheduled every {status!.scheduleHours}h
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Summary Stats */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Passed", value: summary.passed, icon: <CheckCircle2 className="w-4 h-4" />, color: "text-green-600 dark:text-green-400" },
              { label: "Failed", value: summary.failed, icon: <XCircle className="w-4 h-4" />, color: "text-red-600 dark:text-red-400" },
              { label: "Avg Latency", value: `${summary.avgLatencyMs}ms`, icon: <Zap className="w-4 h-4" />, color: "text-primary" },
              { label: "Max Latency", value: `${summary.maxLatencyMs}ms`, icon: <Activity className="w-4 h-4" />, color: summary.maxLatencyMs > 3000 ? "text-red-600" : "text-muted-foreground" },
            ].map((stat) => (
              <Card key={stat.label}>
                <CardContent className="p-4 flex flex-col gap-1">
                  <div className={cn("flex items-center gap-1.5 text-xs font-semibold text-muted-foreground")}>
                    <span className={stat.color}>{stat.icon}</span>
                    {stat.label}
                  </div>
                  <p className={cn("text-2xl font-bold", stat.color)}>{stat.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Test Results */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Server className="w-4 h-4" />
              Test Results
              {isRunning && <RefreshCw className="w-3.5 h-3.5 animate-spin text-muted-foreground ml-auto" />}
              {report?.status === "done" && (
                <Badge variant="outline" className="ml-auto text-xs">
                  {format(new Date(report.finishedAt!), "dd MMM HH:mm:ss")}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {statusLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : !report || report.results.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
                <FlaskConical className="w-10 h-10 opacity-30" />
                <p className="text-sm">No test results yet. Click <strong>Run All Tests</strong> to start.</p>
              </div>
            ) : (
              <>
                {functionalResults.length > 0 && (
                  <SuiteSection suite="functional" results={functionalResults} />
                )}
                {stressResults.length > 0 && (
                  <SuiteSection suite="stress" results={stressResults} />
                )}
                {edgeResults.length > 0 && (
                  <SuiteSection suite="edge" results={edgeResults} />
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Internal Action Log */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="w-4 h-4" />
              Internal Action Log
              <span className="ml-auto text-xs font-normal text-muted-foreground">{logs.length} entries</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search logs..."
                  className="pl-9"
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                />
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => clearLogsMutation.mutate()}
                disabled={clearLogsMutation.isPending}
                title="Clear all logs"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => qc.invalidateQueries({ queryKey: ["/api/stability/logs"] })}
                title="Refresh logs"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
            <div className="rounded-lg border dark:border-gray-700 overflow-hidden">
              <div className="max-h-80 overflow-y-auto font-mono text-xs divide-y dark:divide-gray-700">
                {logsLoading ? (
                  <div className="p-4 text-muted-foreground">Loading logs...</div>
                ) : logs.length === 0 ? (
                  <div className="p-4 text-muted-foreground">No log entries{logSearch ? " matching search" : ""}.</div>
                ) : (
                  logs.map((entry) => (
                    <div key={entry.id} className="flex gap-2 px-3 py-1.5 hover:bg-muted/30 transition-colors">
                      <span className="text-muted-foreground shrink-0 tabular-nums">
                        {format(new Date(entry.timestamp), "HH:mm:ss")}
                      </span>
                      <span className={cn("shrink-0 w-14 font-semibold", logLevelColor(entry.level))}>
                        {entry.level.toUpperCase()}
                      </span>
                      <span className="text-muted-foreground shrink-0">[{entry.category}]</span>
                      <span className="flex-1 truncate">{entry.action}</span>
                      {entry.detail && (
                        <span className="text-muted-foreground shrink-0 truncate max-w-[120px]" title={entry.detail}>
                          {entry.detail}
                        </span>
                      )}
                      {entry.durationMs !== undefined && (
                        <span className="text-muted-foreground shrink-0">{entry.durationMs}ms</span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Logs auto-refresh every 5 seconds. Up to 1,000 entries stored in memory (resets on server restart).
            </p>
          </CardContent>
        </Card>

        {/* Test Layer Reference */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              What Gets Tested
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-3 pt-0">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <p className="font-semibold text-foreground mb-1 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />Functional
                </p>
                <ul className="space-y-0.5 text-xs list-disc list-inside">
                  <li>Server health &amp; uptime</li>
                  <li>Equipment list &amp; detail</li>
                  <li>Analytics endpoint</li>
                  <li>Activity feed &amp; users</li>
                  <li>Equipment CRUD (test mode)</li>
                  <li>QR scan workflow (test mode)</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-foreground mb-1 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />Stress
                </p>
                <ul className="space-y-0.5 text-xs list-disc list-inside">
                  <li>5 concurrent list requests</li>
                  <li>10 rapid sequential requests</li>
                  <li>3 concurrent analytics calls</li>
                  <li>Latency spike detection</li>
                  <li>Performance degradation check</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-foreground mb-1 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />Edge Cases
                </p>
                <ul className="space-y-0.5 text-xs list-disc list-inside">
                  <li>Missing required fields → 400</li>
                  <li>Nonexistent resource → 404</li>
                  <li>Invalid scan status → 4xx</li>
                  <li>Empty request body → 400</li>
                  <li>5000-char field (XSS/overflow)</li>
                  <li>Duplicate scan (test mode)</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
