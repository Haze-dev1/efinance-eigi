import { expect, test } from "vitest";
import { isDuplicateKey } from "./mongo-errors.ts";

// Shape the driver actually throws on a unique-index collision.
const dup = Object.assign(new Error("E11000 duplicate key error collection"), {
  code: 11000,
  keyPattern: { attemptKey: 1 },
});

test("recognises a duplicate on the named field", () => {
  expect(isDuplicateKey(dup, "attemptKey")).toBe(true);
});

test("recognises a duplicate without naming a field", () => {
  expect(isDuplicateKey(dup)).toBe(true);
});

test("does not match a duplicate on a different index", () => {
  expect(isDuplicateKey(dup, "emailLower")).toBe(false);
});

test("does not match other errors", () => {
  expect(isDuplicateKey(new Error("boom"), "attemptKey")).toBe(false);
  expect(isDuplicateKey({ code: 121 }, "attemptKey")).toBe(false);
  expect(isDuplicateKey(null, "attemptKey")).toBe(false);
});
