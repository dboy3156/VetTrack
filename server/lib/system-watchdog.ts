import { evaluateAlerts } from "./alert-engine.js";

const DEFAULT_WATCHDOG_INTERVAL_MS = Number.parseInt(process.env.WATCHDOG_INTERVAL_MS ?? "45000", 10) || 45_000;
const DEFAULT_WATCHDOG_TIMEOUT_MS = Number.parseInt(process.env.WATCHDOG_TIMEOUT_MS ?? "10000", 10) || 10_000;

type WatchdogRunner = () => Promise<void>;

export interface WatchdogStatus {
  started: boolean;
  isRunning: boolean;
  completedRuns: number;
  skippedRuns: number;
  timeoutCount: number;
  lastRunStartedAt: string | null;
  lastRunFinishedAt: string | null;
  lastRunDurationMs: number | null;
  lastError: string | null;
}

interface WatchdogOptions {
  runChecks?: WatchdogRunner;
  intervalMs?: number;
  timeoutMs?: number;
}

const status: WatchdogStatus = {
  started: false,
  isRunning: false,
  completedRuns: 0,
  skippedRuns: 0,
  timeoutCount: 0,
  lastRunStartedAt: null,
  lastRunFinishedAt: null,
  lastRunDurationMs: null,
  lastError: null,
};

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

const defaultRunner: WatchdogRunner = async () => {
  await evaluateAlerts();
};

export async function runSystemWatchdogTick(options: WatchdogOptions = {}): Promise<boolean> {
  if (isRunning) {
    status.skippedRuns += 1;
    return false;
  }

  isRunning = true;
  status.isRunning = true;
  status.lastError = null;
  status.lastRunStartedAt = new Date().toISOString();
  const startedAt = Date.now();

  try {
    const runChecks = options.runChecks ?? defaultRunner;
    const timeoutMs = options.timeoutMs ?? DEFAULT_WATCHDOG_TIMEOUT_MS;
    await withTimeout(runChecks(), timeoutMs, "system watchdog");
    status.completedRuns += 1;
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    status.lastError = message;
    if (message.includes("timed out")) {
      status.timeoutCount += 1;
    }
    console.error("[watchdog] run failed", { error: message, ts: new Date().toISOString() });
    return false;
  } finally {
    status.lastRunFinishedAt = new Date().toISOString();
    status.lastRunDurationMs = Date.now() - startedAt;
    isRunning = false;
    status.isRunning = false;
  }
}

export function startSystemWatchdog(options: WatchdogOptions = {}): void {
  if (status.started) return;
  status.started = true;
  const intervalMs = options.intervalMs ?? DEFAULT_WATCHDOG_INTERVAL_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_WATCHDOG_TIMEOUT_MS;
  const runChecks = options.runChecks ?? defaultRunner;

  void runSystemWatchdogTick({ runChecks, timeoutMs });

  intervalHandle = setInterval(() => {
    void runSystemWatchdogTick({ runChecks, timeoutMs });
  }, intervalMs);
}

export function getSystemWatchdogStatus(): WatchdogStatus {
  return { ...status };
}

export function stopSystemWatchdogForTests(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  status.started = false;
  status.isRunning = false;
  status.completedRuns = 0;
  status.skippedRuns = 0;
  status.timeoutCount = 0;
  status.lastRunStartedAt = null;
  status.lastRunFinishedAt = null;
  status.lastRunDurationMs = null;
  status.lastError = null;
  isRunning = false;
}
