import { describe, expect, test } from "vitest";
import { loadQuiz } from "./content.ts";
import { scoreObjective, trackFor, xpForAttempt } from "./scoring.ts";

const quiz = loadQuiz("what-investment-banks-do");
const key = Object.fromEntries(
  quiz.questions.flatMap((q) =>
    q.kind === "long_answer" ? [] : [[q.id, q.answer]],
  ),
);

describe("scoreObjective", () => {
  test("a fully correct submission scores full marks", () => {
    const r = scoreObjective(quiz, key);
    expect(r.score).toBe(r.max);
    expect(r.max).toBe(4);
  });

  test("a wrong answer costs exactly one mark", () => {
    const r = scoreObjective(quiz, { ...key, q1: 999 });
    expect(r.score).toBe(3);
  });

  // A half-finished submission must still produce a result, never an error.
  test("missing answers are wrong, not fatal", () => {
    const r = scoreObjective(quiz, {});
    expect(r.score).toBe(0);
    expect(r.max).toBe(4);
  });

  // Guards the true/false path specifically: `false` is a legitimate answer and
  // must not be treated as absent.
  test("false is a real answer, not a missing one", () => {
    const tf = quiz.questions.find((q) => q.kind === "true_false")!;
    expect(scoreObjective(quiz, { [tf.id]: false }).score).toBe(1);
  });

  test("the long answer is separated out and never scored here", () => {
    const r = scoreObjective(quiz, { ...key, q5: "some prose" });
    expect(r.longAnswer?.response).toBe("some prose");
    expect(r.max).toBe(4);
    expect(r.perQuestion.every((q) => q.id !== "q5")).toBe(true);
  });
});

describe("xpForAttempt", () => {
  test("full marks award the module's full xp", () => {
    expect(xpForAttempt(100, { score: 4, max: 4 }, 5, 5)).toBe(100);
  });

  test("a pending long answer is scored on the objective part alone", () => {
    expect(xpForAttempt(100, { score: 2, max: 4 }, null, 5)).toBe(50);
  });

  test("zero never goes negative", () => {
    expect(xpForAttempt(100, { score: 0, max: 4 }, 0, 5)).toBe(0);
  });
});

describe("trackFor", () => {
  test.each([
    [0, 6, "beginner"],
    [2, 6, "beginner"],
    [3, 6, "intermediate"],
    [4, 6, "intermediate"],
    [5, 6, "advanced"],
    [6, 6, "advanced"],
  ])("%i/%i places the user on %s", (score, max, expected) => {
    expect(trackFor(score, max)).toBe(expected);
  });

  test("an empty quiz does not divide by zero", () => {
    expect(trackFor(0, 0)).toBe("beginner");
  });
});
