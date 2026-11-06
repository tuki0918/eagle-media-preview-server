import { expect, test } from "vitest";
import { followUploadedItems } from "./uploadRefresh";

function run(totals: number[], isCurrent: () => boolean = () => true) {
  const refreshed: number[] = [];
  const remaining = [...totals];
  const done = followUploadedItems({
    delays: totals.slice(1).map(() => 0),
    isCurrent,
    readTotal: async () => remaining.shift()!,
    refresh: (total) => refreshed.push(total),
    wait: async () => {},
  });
  return { done, refreshed };
}

test("refreshes right away, even when the item is already listed", async () => {
  const { done, refreshed } = run([11, 11, 11]);
  await done;
  expect(refreshed).toEqual([11]);
});

test("refreshes again each time an item appears late", async () => {
  const { done, refreshed } = run([10, 10, 11, 12, 12]);
  await done;
  expect(refreshed).toEqual([10, 11, 12]);
});

test("a failure is reported while the session lasts, and ignored once it has ended", async () => {
  const failing = (isCurrent: () => boolean) => followUploadedItems({
    isCurrent,
    readTotal: async () => {
      throw new Error("401");
    },
    refresh: () => {},
  });
  await expect(failing(() => true)).rejects.toThrow("401");
  await expect(failing(() => false)).resolves.toBeUndefined();
});

test("stops when a newer batch of uploads takes over", async () => {
  let current = true;
  const refreshed: number[] = [];
  await followUploadedItems({
    delays: [0, 0],
    isCurrent: () => current,
    readTotal: async () => 5,
    refresh: (total) => {
      refreshed.push(total);
      current = false;
    },
    wait: async () => {},
  });
  expect(refreshed).toEqual([5]);
});

test("a failed read reaches the caller", async () => {
  await expect(followUploadedItems({
    delays: [],
    isCurrent: () => true,
    readTotal: async () => {
      throw new Error("Authentication required");
    },
    refresh: () => {},
  })).rejects.toThrow("Authentication required");
});
