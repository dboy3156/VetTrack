import { clerkSetup } from "@clerk/testing/playwright";

export default async function globalSetup() {
  const hasClerkTestKey = (process.env.CLERK_SECRET_KEY ?? "").startsWith("sk_test_");
  if (!hasClerkTestKey) return;

  await clerkSetup({
    publishableKey: process.env.VITE_CLERK_PUBLISHABLE_KEY,
    secretKey: process.env.CLERK_SECRET_KEY,
  });
}
