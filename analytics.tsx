@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,200..800&family=JetBrains+Mono:ital,wght@0,100..800;1,100..800&display=swap');
@import "tailwindcss";
@import "tw-animate-css";
@plugin "@tailwindcss/typography";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: hsl(var(--background));
  --color-foreground: hsl(var(--foreground));
  --color-border: hsl(var(--border));
  --color-input: hsl(var(--input));
  --color-ring: hsl(var(--ring));

  --color-card: hsl(var(--card));
  --color-card-foreground: hsl(var(--card-foreground));
  --color-card-border: hsl(var(--card-border));

  --color-popover: hsl(var(--popover));
  --color-popover-foreground: hsl(var(--popover-foreground));
  --color-popover-border: hsl(var(--popover-border));

  --color-primary: hsl(var(--primary));
  --color-primary-foreground: hsl(var(--primary-foreground));
  --color-primary-border: var(--primary-border);

  --color-secondary: hsl(var(--secondary));
  --color-secondary-foreground: hsl(var(--secondary-foreground));
  --color-secondary-border: var(--secondary-border);

  --color-muted: hsl(var(--muted));
  --color-muted-foreground: hsl(var(--muted-foreground));
  --color-muted-border: var(--muted-border);

  --color-accent: hsl(var(--accent));
  --color-accent-foreground: hsl(var(--accent-foreground));
  --color-accent-border: var(--accent-border);

  --color-destructive: hsl(var(--destructive));
  --color-destructive-foreground: hsl(var(--destructive-foreground));
  --color-destructive-border: var(--destructive-border);

  --color-sidebar: hsl(var(--sidebar));
  --color-sidebar-foreground: hsl(var(--sidebar-foreground));
  --color-sidebar-border: hsl(var(--sidebar-border));
  --color-sidebar-primary: hsl(var(--sidebar-primary));
  --color-sidebar-primary-foreground: hsl(var(--sidebar-primary-foreground));
  --color-sidebar-primary-border: var(--sidebar-primary-border);
  --color-sidebar-accent: hsl(var(--sidebar-accent));
  --color-sidebar-accent-foreground: hsl(var(--sidebar-accent-foreground));
  --color-sidebar-accent-border: var(--sidebar-accent-border);
  --color-sidebar-ring: hsl(var(--sidebar-ring));

  --font-sans: var(--app-font-sans);
  --font-serif: var(--app-font-serif);
  --font-mono: var(--app-font-mono);

  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}

:root {
  --button-outline: rgba(0,0,0, .10);
  --badge-outline: rgba(0,0,0, .05);
  --opaque-button-border-intensity: -10;
  --elevate-1: rgba(0,0,0, .03);
  --elevate-2: rgba(0,0,0, .08);

  --app-font-sans: 'Bricolage Grotesque', system-ui, sans-serif;
  --app-font-mono: 'JetBrains Mono', monospace;
  --radius: 0.5rem;

  --background: 60 10% 96%;
  --foreground: 240 10% 12%;

  --card: 0 0% 100%;
  --card-foreground: 240 10% 12%;
  --card-border: 240 5% 85%;

  --border: 240 5% 85%;
  --input: 240 5% 85%;
  --ring: 174 72% 40%;

  --sidebar: 0 0% 100%;
  --sidebar-foreground: 240 10% 12%;
  --sidebar-border: 240 5% 85%;
  --sidebar-primary: 174 72% 40%;
  --sidebar-primary-foreground: 0 0% 100%;
  --sidebar-accent: 174 30% 92%;
  --sidebar-accent-foreground: 240 10% 12%;
  --sidebar-ring: 174 72% 40%;

  --popover: 0 0% 100%;
  --popover-foreground: 240 10% 12%;
  --popover-border: 240 5% 85%;

  --primary: 174 72% 40%;
  --primary-foreground: 0 0% 100%;

  --secondary: 174 20% 92%;
  --secondary-foreground: 240 10% 12%;

  --muted: 174 10% 90%;
  --muted-foreground: 240 5% 45%;

  --accent: 174 72% 40%;
  --accent-foreground: 0 0% 100%;

  --destructive: 0 84% 60%;
  --destructive-foreground: 0 0% 100%;

  /* Automatically computed borders */
  --sidebar-primary-border: hsl(from hsl(var(--sidebar-primary)) h s calc(l + var(--opaque-button-border-intensity)) / alpha);
  --sidebar-accent-border: hsl(from hsl(var(--sidebar-accent)) h s calc(l + var(--opaque-button-border-intensity)) / alpha);
  --primary-border: hsl(from hsl(var(--primary)) h s calc(l + var(--opaque-button-border-intensity)) / alpha);
  --secondary-border: hsl(from hsl(var(--secondary)) h s calc(l + var(--opaque-button-border-intensity)) / alpha);
  --muted-border: hsl(from hsl(var(--muted)) h s calc(l + var(--opaque-button-border-intensity)) / alpha);
  --accent-border: hsl(from hsl(var(--accent)) h s calc(l + var(--opaque-button-border-intensity)) / alpha);
  --destructive-border: hsl(from hsl(var(--destructive)) h s calc(l + var(--opaque-button-border-intensity)) / alpha);
}

.dark {
  --button-outline: rgba(255,255,255, .10);
  --badge-outline: rgba(255,255,255, .05);
  --opaque-button-border-intensity: 10;
  --elevate-1: rgba(255,255,255, .04);
  --elevate-2: rgba(255,255,255, .09);

  --background: 240 10% 8%;
  --foreground: 60 10% 96%;

  --card: 240 10% 12%;
  --card-foreground: 60 10% 96%;
  --card-border: 240 10% 18%;

  --border: 240 10% 18%;
  --input: 240 10% 18%;
  --ring: 174 72% 40%;

  --sidebar: 240 10% 12%;
  --sidebar-foreground: 60 10% 96%;
  --sidebar-border: 240 10% 18%;
  --sidebar-primary: 174 72% 40%;
  --sidebar-primary-foreground: 0 0% 100%;
  --sidebar-accent: 240 10% 18%;
  --sidebar-accent-foreground: 60 10% 96%;
  --sidebar-ring: 174 72% 40%;

  --popover: 240 10% 12%;
  --popover-foreground: 60 10% 96%;
  --popover-border: 240 10% 18%;

  --primary: 174 72% 40%;
  --primary-foreground: 0 0% 100%;

  --secondary: 240 10% 18%;
  --secondary-foreground: 60 10% 96%;

  --muted: 240 10% 18%;
  --muted-foreground: 240 5% 65%;

  --accent: 174 72% 40%;
  --accent-foreground: 0 0% 100%;

  --destructive: 0 62% 30%;
  --destructive-foreground: 60 10% 96%;
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply font-sans antialiased bg-background text-foreground;
  }
}

@layer utilities {
  input[type="search"]::-webkit-search-cancel-button {
    @apply hidden;
  }
  [contenteditable][data-placeholder]:empty::before {
    content: attr(data-placeholder);
    color: hsl(var(--muted-foreground));
    pointer-events: none;
  }
  .toggle-elevate::before,
  .toggle-elevate-2::before {
    content: "";
    pointer-events: none;
    position: absolute;
    inset: 0px;
    border-radius: inherit;
    z-index: -1;
  }
  .toggle-elevate.toggle-elevated::before {
    background-color: var(--elevate-2);
  }
  .border.toggle-elevate::before {
    inset: -1px;
  }
  .hover-elevate:not(.no-default-hover-elevate),
  .active-elevate:not(.no-default-active-elevate),
  .hover-elevate-2:not(.no-default-hover-elevate),
  .active-elevate-2:not(.no-default-active-elevate) {
    position: relative;
    z-index: 0;
  }
  .hover-elevate:not(.no-default-hover-elevate)::after,
  .active-elevate:not(.no-default-active-elevate)::after,
  .hover-elevate-2:not(.no-default-hover-elevate)::after,
  .active-elevate-2:not(.no-default-active-elevate)::after {
    content: "";
    pointer-events: none;
    position: absolute;
    inset: 0px;
    border-radius: inherit;
    z-index: 999;
  }
  .hover-elevate:hover:not(.no-default-hover-elevate)::after,
  .active-elevate:active:not(.no-default-active-elevate)::after {
    background-color: var(--elevate-1);
  }
  .hover-elevate-2:hover:not(.no-default-hover-elevate)::after,
  .active-elevate-2:active:not(.no-default-active-elevate)::after {
    background-color: var(--elevate-2);
  }
  .border.hover-elevate:not(.no-hover-interaction-elevate)::after,
  .border.active-elevate:not(.no-active-interaction-elevate)::after,
  .border.hover-elevate-2:not(.no-hover-interaction-elevate)::after,
  .border.active-elevate-2:not(.no-active-interaction-elevate)::after,
  .border.hover-elevate:not(.no-hover-interaction-elevate)::after {
    inset: -1px;
  }
}

@media print {
  body {
    background: white !important;
    margin: 0;
    padding: 0;
  }

  .print\:hidden,
  header,
  nav {
    display: none !important;
  }

  .print\:block {
    display: block !important;
  }

  main {
    max-width: 100% !important;
    padding: 0 !important;
  }

  .print-label-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    padding: 12px;
  }

  .print-label {
    border: 1px solid #ccc;
    border-radius: 8px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    page-break-inside: avoid;
    break-inside: avoid;
  }

  .print-label-qr {
    width: 120px;
    height: 120px;
    image-rendering: pixelated;
  }

  .print-label-info {
    margin-top: 8px;
  }

  .print-label-name {
    font-weight: 700;
    font-size: 13px;
    line-height: 1.2;
    color: #000;
  }

  .print-label-id {
    font-family: monospace;
    font-size: 8px;
    color: #666;
    margin-top: 4px;
    word-break: break-all;
  }
}

/* QR scanner sweep animation */
@keyframes scan-line {
  0%   { top: 0%; opacity: 1; }
  90%  { top: 100%; opacity: 1; }
  100% { top: 100%; opacity: 0; }
}
.animate-scan-line {
  animation: scan-line 2s linear infinite;
}
