// src/lib/tokens.ts
// Typed mirrors of tailwind.config.ts ivory.* tokens.
// Import these when you need hex values outside of Tailwind classes
// (e.g. inline styles, canvas drawing, chart colours).

export const IVORY = {
  bg:       "#f3f1eb",
  surface:  "#ffffff",
  border:   "#d4d0c8",
  borderMd: "#b8b4aa",
  text:     "#111a12",
  text2:    "#354838",
  text3:    "#7a8a7e",
  navy:     "#0f1f11",
  green:    "#1e4a25",
  greenMid: "#1e7a32",
  greenBg:  "#e6f2e7",
  ok:       "#16a34a",
  warn:     "#d97706",
  err:      "#dc2626",
  info:     "#2563eb",
} as const;

export type IvoryToken = keyof typeof IVORY;
