import { expect, test } from "bun:test";
import { dropPosition, positionBetween } from "./index.ts";

test("positionBetween orders new item between neighbours", () => {
  expect(positionBetween()).toBe(1024);
  expect(positionBetween(undefined, 1024)).toBe(512);
  expect(positionBetween(1024)).toBe(2048);
  const mid = positionBetween(1024, 2048);
  expect(mid).toBeGreaterThan(1024);
  expect(mid).toBeLessThan(2048);
});

test("dropPosition: backward lands before target, forward lands after", () => {
  const items = [
    { id: "a", position: 1024 },
    { id: "b", position: 2048 },
    { id: "c", position: 3072 },
  ];
  expect(dropPosition(items, "c", "a")).toBe(512); // c before a
  expect(dropPosition(items, "a", "b")).toBe(2560); // a after b
  expect(dropPosition(items, "a")).toBe(4096); // a to end
  expect(dropPosition([], "x")).toBe(1024); // into empty list
});
