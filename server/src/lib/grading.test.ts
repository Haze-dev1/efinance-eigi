import { expect, test } from "vitest";
import { retryableUpstreamError } from "./grading.ts";

// Observed live: OpenRouter answers HTTP 200 with this body when the upstream
// provider is down. Without detecting it, a transient outage looks like a
// permanent parse failure and is never retried.
test("detects a 200-with-error envelope as retryable", () => {
  const body = {
    error: { message: "Upstream error from Nvidia: overloaded", code: 502 },
  };
  expect(retryableUpstreamError(body)).toContain("502");
});

test("treats rate limiting as retryable", () => {
  expect(
    retryableUpstreamError({ error: { message: "rate limited", code: 429 } }),
  ).not.toBeNull();
});

test("does not retry an error that will fail identically", () => {
  // A malformed request or a bad model id is our fault; retrying wastes time.
  expect(
    retryableUpstreamError({ error: { message: "no such model", code: 400 } }),
  ).toBeNull();
});

test("a real completion is not mistaken for an error", () => {
  const body = {
    choices: [{ message: { content: '{"score":3,"feedback":"ok"}' } }],
  };
  expect(retryableUpstreamError(body)).toBeNull();
});
