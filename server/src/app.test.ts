import { expect, test } from "vitest";
import { buildApp } from "./app.ts";

test("GET /api/health", async () => {
  const res = await buildApp().inject({ method: "GET", url: "/api/health" });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ ok: true });
});
