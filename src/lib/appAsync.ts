export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timerTarget = getTimerTarget();
    const timeoutId = timerTarget.setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    promise.then(
      (value) => {
        timerTarget.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        timerTarget.clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

export function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => getTimerTarget().setTimeout(resolve, ms));
}

export async function yieldToUi(): Promise<void> {
  await new Promise<void>((resolve) => {
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => resolve());
      return;
    }
    getTimerTarget().setTimeout(resolve, 0);
  });
}

export async function runLimitedConcurrencyQueue<T>(
  items: T[],
  concurrency: number,
  shouldContinue: () => boolean,
  worker: (item: T, index: number) => Promise<void>,
  yieldFn: () => Promise<void> = yieldToUi,
): Promise<void> {
  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (shouldContinue()) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= items.length) return;
        await worker(items[index], index);
        await yieldFn();
      }
    }),
  );
}

function getTimerTarget(): Pick<typeof globalThis, "setTimeout" | "clearTimeout"> {
  if (typeof window !== "undefined") {
    return window;
  }
  return globalThis;
}
