import rateLimit from "express-rate-limit";

export const scanLimiter = rateLimit({
  windowMs: 60_000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many scan actions. Please wait a moment." },
});

export const checkoutLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many checkout/return actions. Please wait a moment." },
});
