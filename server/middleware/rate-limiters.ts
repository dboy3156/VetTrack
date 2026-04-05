import rateLimit from "express-rate-limit";

// Scan actions: 10/min — POST /api/equipment/:id/scan
export const scanLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many scan actions. Please wait a moment." },
});

// Checkout/return: 20/min — POST /api/equipment/:id/checkout|return
export const checkoutLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many checkout/return actions. Please wait a moment." },
});

// Auth/sensitive: 5/min — push subscribe, user creation
export const authSensitiveLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests on this endpoint. Please wait a minute." },
});
