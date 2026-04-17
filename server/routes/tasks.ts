import { Router, type Response } from "express";
import { requireAuth, requireEffectiveRole } from "../middleware/auth.js";
import {
  AppointmentServiceError,
  completeTask,
  getActiveTasks,
  getTasksForTechnicianToday,
  startTask,
} from "../services/appointments.service.js";
import { getTaskRecommendations } from "../services/task-intelligence.service.js";
import { getTaskDashboard } from "../services/task-recall.service.js";
import { canPerformTaskAction, type TaskAction } from "../lib/task-rbac.js";

const router = Router();

function sendServiceError(res: Response, err: unknown) {
  if (err instanceof AppointmentServiceError) {
    res.status(err.status).json({
      error: err.code,
      message: err.message,
      details: err.details ?? null,
    });
    return true;
  }
  return false;
}

function resolveTaskAuthRole(req: { authUser?: { role?: string }; effectiveRole?: string }): string {
  if (req.authUser?.role === "admin") return "admin";
  return req.effectiveRole ?? req.authUser?.role ?? "";
}

function requireTaskActionPermission(
  req: { authUser?: { role?: string }; effectiveRole?: string },
  res: Response,
  action: TaskAction,
): boolean {
  const role = resolveTaskAuthRole(req);
  if (canPerformTaskAction(role, action)) return true;
  res.status(403).json({ error: "INSUFFICIENT_ROLE", message: "Insufficient task permissions" });
  return false;
}

router.get("/dashboard", requireAuth, requireEffectiveRole("technician"), async (req, res) => {
  if (!requireTaskActionPermission(req, res, "task.read")) return;
  if (!req.authUser) {
    return res.status(401).json({ error: "Unauthorized", message: "Authentication required" });
  }
  const clinicId = req.clinicId;
  if (!clinicId?.trim()) {
    return res.status(400).json({ error: "VALIDATION_FAILED", message: "clinicId is required" });
  }
  try {
    const dashboard = await getTaskDashboard(clinicId, req.authUser.id);
    return res.json(dashboard);
  } catch (err) {
    console.error("tasks:dashboard", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to load task dashboard" });
  }
});

router.post("/:id/start", requireAuth, requireEffectiveRole("technician"), async (req, res) => {
  if (!requireTaskActionPermission(req, res, "task.start")) return;
  if (!req.params.id?.trim()) {
    return res.status(400).json({ error: "VALIDATION_FAILED", message: "id param is required" });
  }
  if (!req.authUser) {
    return res.status(401).json({ error: "Unauthorized", message: "Authentication required" });
  }
  try {
    const task = await startTask(req.clinicId!, req.params.id, {
      userId: req.authUser.id,
      email: req.authUser.email,
    });
    return res.json({ task });
  } catch (err) {
    if (sendServiceError(res, err)) return;
    console.error("tasks:start", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to start task" });
  }
});

router.post("/:id/complete", requireAuth, requireEffectiveRole("technician"), async (req, res) => {
  if (!requireTaskActionPermission(req, res, "task.complete")) return;
  if (!req.params.id?.trim()) {
    return res.status(400).json({ error: "VALIDATION_FAILED", message: "id param is required" });
  }
  if (!req.authUser) {
    return res.status(401).json({ error: "Unauthorized", message: "Authentication required" });
  }
  try {
    const task = await completeTask(req.clinicId!, req.params.id, {
      userId: req.authUser.id,
      email: req.authUser.email,
    });
    return res.json({ task });
  } catch (err) {
    if (sendServiceError(res, err)) return;
    console.error("tasks:complete", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to complete task" });
  }
});

router.get("/me", requireAuth, requireEffectiveRole("technician"), async (req, res) => {
  if (!requireTaskActionPermission(req, res, "task.read")) return;
  if (!req.authUser) {
    return res.status(401).json({ error: "Unauthorized", message: "Authentication required" });
  }
  try {
    const tasks = await getTasksForTechnicianToday(req.clinicId!, req.authUser.id);
    return res.json({ tasks });
  } catch (err) {
    if (sendServiceError(res, err)) return;
    console.error("tasks:me", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to load tasks" });
  }
});

router.get("/active", requireAuth, requireEffectiveRole("technician"), async (req, res) => {
  if (!requireTaskActionPermission(req, res, "task.read")) return;
  try {
    const tasks = await getActiveTasks(req.clinicId!);
    return res.json({ tasks });
  } catch (err) {
    if (sendServiceError(res, err)) return;
    console.error("tasks:active", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to load active tasks" });
  }
});

router.get("/recommendations", requireAuth, requireEffectiveRole("technician"), async (req, res) => {
  if (!requireTaskActionPermission(req, res, "task.read")) return;
  if (!req.authUser) {
    return res.status(401).json({ error: "Unauthorized", message: "Authentication required" });
  }
  const clinicId = req.clinicId;
  if (!clinicId?.trim()) {
    return res.status(400).json({ error: "VALIDATION_FAILED", message: "clinicId is required" });
  }
  try {
    const data = await getTaskRecommendations(clinicId, req.authUser.id);
    return res.json(data);
  } catch (err) {
    console.error("tasks:recommendations", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to load recommendations" });
  }
});

export default router;
