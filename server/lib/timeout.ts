export async function withTimeout<T>(work: Promise<T>, timeoutMs: number, label: string = "operation"): Promise<T> {
  const timeout = Math.max(1, Math.floor(timeoutMs));
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeout}ms`)), timeout);
    });
    return await Promise.race([work, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
