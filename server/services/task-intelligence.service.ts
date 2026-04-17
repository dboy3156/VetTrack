import { and, asc, eq, inArray } from "drizzle-orm";
import { appointments, db } from "../db.js";
import { incrementMetric } from "../lib/metrics.js";

const ACTIVE_STATUSES = ["pending", "assigned", "scheduled", "arrived", "in_progress"] as const;
const MAX_SCAN = 100;
const SOON_WINDOW_MS = 15 * 60 * 1000;

export type SuggestionType = "OVERDUE_WARNING" | "START_NOW" | "OVERLOADED" | "PICK_FROM_QUEUE";
export type SuggestionSeverity = "high" | "medium" | "low";

export interface TaskSuggestion {
  type: SuggestionType;
  message: string;
  severity: SuggestionSeverity;
}

type TaskRow = typeof appointments.$inferSelect;

function serializeAppointment(row: TaskRow) {
  return {
    ...row,
    vetId: row.vetId ?? null,
    startTime: new Date(row.startTime).toISOString(),
    endTime: new Date(row.endTime).toISOString(),
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

type SerializedTask = ReturnType<typeof serializeAppointment>;

export interface TaskRecommendations {
  nextBestTask: (SerializedTask & {
    reason: string;
    score: number;
    scoreBreakdown: {
      overdue: number;
      critical: number;
      startsSoon: number;
      assigned: number;
      inProgress: number;
    };
  }) | null;
  urgentTasks: SerializedTask[];
  overloaded: boolean;
  suggestions: TaskSuggestion[];
}

function priorityRank(priority: string | null | undefined): number {
  if (priority === "critical") return 3;
  if (priority === "high") return 2;
  return 1;
}

function isOverdue(task: SerializedTask, nowMs: number): boolean {
  return new Date(task.endTime).getTime() < nowMs;
}

function startsSoon(task: SerializedTask, nowMs: number): boolean {
  const startMs = new Date(task.startTime).getTime();
  return startMs >= nowMs && startMs <= nowMs + SOON_WINDOW_MS;
}

function shouldShowSuggestion(key: string, cooldownMs: number): boolean {
  const now = Date.now();
  const last = suggestionCooldowns.get(key) ?? 0;
  if (now - last < cooldownMs) {
    incrementMetric("suggestions_suppressed");
    return false;
  }
  suggestionCooldowns.set(key, now);
  return true;
}

type ScoreContext = {
  nowMs: number;
  userId: string;
};

const suggestionCooldowns = new Map<string, number>();

function scoreTask(
  task: SerializedTask,
  context: ScoreContext,
): {
  total: number;
  breakdown: {
    overdue: number;
    critical: number;
    startsSoon: number;
    assigned: number;
    inProgress: number;
  };
} {
  let score = 0;
  const breakdown = {
    overdue: 0,
    critical: 0,
    startsSoon: 0,
    assigned: 0,
    inProgress: 0,
  };
  const overdue = isOverdue(task, context.nowMs);
  const soon = startsSoon(task, context.nowMs);
  const assignedToUser = task.vetId === context.userId;
  const inProgress = task.status === "in_progress";

  if (overdue) {
    score += 100;
    breakdown.overdue = 100;
  }
  if (task.priority === "critical") {
    score += 50;
    breakdown.critical = 50;
  }
  if (soon) {
    score += 30;
    breakdown.startsSoon = 30;
  }
  if (assignedToUser) {
    score += 20;
    breakdown.assigned = 20;
  }
  if (task.priority === "high") score += 10;
  if (inProgress) {
    score -= 10;
    breakdown.inProgress = -10;
  }

  incrementMetric("scoring_runs");
  return { total: score, breakdown };
}

function buildTaskReason(task: SerializedTask, nowMs: number, userId: string): string {
  const reasons: string[] = [];
  if (isOverdue(task, nowMs)) reasons.push("it is overdue");
  if (task.priority === "critical") reasons.push("it is critical priority");
  if (startsSoon(task, nowMs)) {
    const mins = Math.max(0, Math.round((new Date(task.startTime).getTime() - nowMs) / 60000));
    reasons.push(`it starts in ${mins} minutes`);
  }
  if (task.vetId === userId) reasons.push("it is assigned to you");
  if (reasons.length === 0) {
    return "It is the highest-scoring upcoming task";
  }
  return `This task is recommended because ${reasons.join(" and ")}`;
}

function dedupeSuggestions(suggestions: TaskSuggestion[]): TaskSuggestion[] {
  const severityWeight: Record<SuggestionSeverity, number> = { high: 3, medium: 2, low: 1 };
  const grouped = new Map<SuggestionType, TaskSuggestion>();
  for (const suggestion of suggestions) {
    const existing = grouped.get(suggestion.type);
    if (!existing || severityWeight[suggestion.severity] > severityWeight[existing.severity]) {
      grouped.set(suggestion.type, suggestion);
    }
  }
  return Array.from(grouped.values());
}

export async function getTaskRecommendations(clinicId: string, userId: string): Promise<TaskRecommendations> {
  const t0 = Date.now();
  try {
    const c = clinicId.trim();
    const uid = userId.trim();
    if (!c || !uid) {
      return { nextBestTask: null, urgentTasks: [], overloaded: false, suggestions: [] };
    }

    const rows = await db
      .select()
      .from(appointments)
      .where(and(eq(appointments.clinicId, c), inArray(appointments.status, [...ACTIVE_STATUSES])))
      .orderBy(asc(appointments.startTime), asc(appointments.id))
      .limit(MAX_SCAN);

    const tasks = rows.map(serializeAppointment);
    const nowMs = Date.now();
    const myTasks = tasks.filter((task) => task.vetId === uid || task.vetId === null);
    const candidateTasks = myTasks.length > 0 ? myTasks : tasks;
    const assignedTasks = tasks.filter((task) => task.vetId === uid);
    const allActiveTasks = tasks;
    const overdueMyTasks = assignedTasks.filter((task) => isOverdue(task, nowMs));

    const urgentTasks = candidateTasks
      .filter((task) => isOverdue(task, nowMs) || task.priority === "critical" || startsSoon(task, nowMs))
      .sort((a, b) => {
        const overdueDiff = Number(isOverdue(b, nowMs)) - Number(isOverdue(a, nowMs));
        if (overdueDiff !== 0) return overdueDiff;
        const priorityDiff = priorityRank(b.priority) - priorityRank(a.priority);
        if (priorityDiff !== 0) return priorityDiff;
        const startDiff = new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
        if (startDiff !== 0) return startDiff;
        return a.id.localeCompare(b.id);
      });

    const scored = candidateTasks
      .slice()
      .map((task) => ({ task, scored: scoreTask(task, { nowMs, userId: uid }) }))
      .sort((a, b) => {
        if (b.scored.total !== a.scored.total) return b.scored.total - a.scored.total;
        const startDiff = new Date(a.task.startTime).getTime() - new Date(b.task.startTime).getTime();
        if (startDiff !== 0) return startDiff;
        return a.task.id.localeCompare(b.task.id);
      });

    const top = scored[0] ?? null;
    const nextBestTask =
      top != null
        ? {
            ...top.task,
            score: top.scored.total,
            scoreBreakdown: top.scored.breakdown,
            reason: buildTaskReason(top.task, nowMs, uid),
          }
        : null;

    const overloaded = assignedTasks.length > 5;

    const suggestions: TaskSuggestion[] = [];
    if (overdueMyTasks.length > 0) {
      suggestions.push({ type: "OVERDUE_WARNING", message: `You have ${overdueMyTasks.length} overdue tasks`, severity: "high" });
    }

    const soonestUrgent = urgentTasks.find((task) => startsSoon(task, nowMs));
    if (soonestUrgent) {
      const mins = Math.max(0, Math.round((new Date(soonestUrgent.startTime).getTime() - nowMs) / 60000));
      suggestions.push({
        type: "START_NOW",
        message: `Start task ${soonestUrgent.id.slice(0, 8)} now (starting in ${mins} min)`,
        severity: "medium",
      });
    }

    if (overloaded) {
      suggestions.push({ type: "OVERLOADED", message: "You are overloaded", severity: "high" });
    }

    if (allActiveTasks.length === 0) {
      suggestions.push({ type: "PICK_FROM_QUEUE", message: "No tasks for today - you're all caught up", severity: "low" });
    } else if (assignedTasks.length === 0) {
      suggestions.push({ type: "PICK_FROM_QUEUE", message: "No tasks assigned - pick from queue", severity: "low" });
    }

    const deduped = dedupeSuggestions(suggestions);
    const cooldowns: Record<SuggestionType, number> = {
      OVERDUE_WARNING: 5 * 60 * 1000,
      OVERLOADED: 2 * 60 * 1000,
      START_NOW: 60 * 1000,
      PICK_FROM_QUEUE: 2 * 60 * 1000,
    };
    const visibleSuggestions = deduped.filter((s) => shouldShowSuggestion(`${c}:${uid}:${s.type}`, cooldowns[s.type]));

    incrementMetric("recommendations_generated");
    if (visibleSuggestions.length > 0) {
      incrementMetric("suggestions_triggered", visibleSuggestions.length);
    }
    if (nextBestTask) {
      incrementMetric("recommendations_shown");
    }

    const elapsed = Date.now() - t0;
    if (elapsed > 50) {
      console.warn("INTELLIGENCE_SLOW", { clinicId: c, userId: uid, elapsedMs: elapsed, taskCount: tasks.length });
    }

    return {
      nextBestTask,
      urgentTasks,
      overloaded,
      suggestions: visibleSuggestions,
    };
  } catch (err) {
    console.error("INTELLIGENCE_ERROR", {
      clinicId: clinicId?.trim() || null,
      userId: userId?.trim() || null,
      reason: (err as Error).message,
    });
    return { nextBestTask: null, urgentTasks: [], overloaded: false, suggestions: [] };
  }
}
