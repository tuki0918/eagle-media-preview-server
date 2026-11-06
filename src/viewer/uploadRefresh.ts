const UPLOAD_REFRESH_DELAYS_MS = [1000, 2000, 4000, 8000];

interface FollowUploadedItemsOptions {
  delays?: number[];
  isCurrent: () => boolean;
  readTotal: () => Promise<number>;
  refresh: (total: number) => void;
  wait?: (delayMs: number) => Promise<void>;
}

function waitFor(delayMs: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}

/**
 * Refreshes right away, then watches the library total for a short while and refreshes again when
 * it changes: Eagle's API doesn't say whether an added item is listed by the time it answers.
 */
export async function followUploadedItems(options: FollowUploadedItemsOptions) {
  try {
    await followItems(options);
  } catch (error) {
    // A failure from a session that has ended says nothing about the current one.
    if (options.isCurrent()) throw error;
  }
}

async function followItems({ delays = UPLOAD_REFRESH_DELAYS_MS, isCurrent, readTotal, refresh, wait = waitFor }: FollowUploadedItemsOptions) {
  let total = await readTotal();
  if (!isCurrent()) return;
  refresh(total);
  for (const delay of delays) {
    await wait(delay);
    if (!isCurrent()) return;
    const latest = await readTotal();
    if (!isCurrent()) return;
    if (latest !== total) {
      total = latest;
      refresh(total);
    }
  }
}
