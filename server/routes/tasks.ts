import { Router, type Response } from "express";
import { requireAuth, requireEffectiveRole } from "../middleware/auth.js";
import {
  AppointmentServiceError,
  completeTask,
  getActiveTasks,
  getTasksForTechnicianToday,
  startTask,
} from "../services/appointments.service.js";

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

router.post("/:id/start", requireAuth, requireEffectiveRole("technician"), async (req, res) => {
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
  try {
    const tasks = await getActiveTasks(req.clinicId!);
    return res.json({ tasks });
  } catch (err) {
    if (sendServiceError(res, err)) return;
    console.error("tasks:active", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to load active tasks" });
  }
});

export default router;
