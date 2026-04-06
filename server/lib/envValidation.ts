const INSECURE_FALLBACKS: Record<string, string[]> = {
  SESSION_SECRET: ["vettrack-dev-secret", "dev-secret", "secret", "changeme", "password"],
};

const REQUIRED_IN_PRODUCTION: string[] = [
  "DATABASE_URL",
  "SESSION_SECRET",
  "CLERK_SECRET_KEY",
  "VITE_CLERK_PUBLISHABLE_KEY",
];

export function validateEnv(): void {
  if (process.env.NODE_ENV !== "production") return;

  const errors: string[] = [];

  for (const varName of REQUIRED_IN_PRODUCTION) {
    const value = process.env[varName];
    if (!value || value.trim() === "") {
      errors.push(`  - ${varName} is required in production but is missing or empty`);
    }
  }

  for (const [varName, insecureValues] of Object.entries(INSECURE_FALLBACKS)) {
    const value = process.env[varName];
    if (value && insecureValues.includes(value)) {
      errors.push(
        `  - ${varName} is set to a known insecure fallback value ("${value}"). Use a strong, random secret in production.`
      );
    }
  }

  if (errors.length > 0) {
    console.error("\n❌ FATAL: Production environment validation failed:\n");
    for (const err of errors) {
      console.error(err);
    }
    console.error(
      "\nFix the above issues before starting the application in production.\n"
    );
    process.exit(1);
  }

  console.log("✅ Production environment validation passed");
}
