import { expect, test } from "vitest";
import { hashPassword, verifyPassword } from "./passwords.ts";

test("a correct password verifies", async () => {
  const stored = await hashPassword("correct horse battery staple");
  expect(await verifyPassword("correct horse battery staple", stored)).toBe(
    true,
  );
});

test("a wrong password does not", async () => {
  const stored = await hashPassword("correct horse battery staple");
  expect(await verifyPassword("Correct horse battery staple", stored)).toBe(
    false,
  );
  expect(await verifyPassword("", stored)).toBe(false);
});

test("the same password hashes differently every time", async () => {
  // Distinct salts: two users with the same password must not share a hash.
  expect(await hashPassword("hunter2")).not.toBe(await hashPassword("hunter2"));
});

test("a malformed stored hash is rejected, not thrown on", async () => {
  for (const bad of [
    "",
    "nonsense",
    "bcrypt$1$2$3",
    "scrypt$65536$onlythree",
  ]) {
    expect(await verifyPassword("hunter2", bad)).toBe(false);
  }
});
