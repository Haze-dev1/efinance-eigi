import { describe, expect, test } from "vitest";
import { loadModules, loadQuiz, quizSlugs, redactQuiz } from "./content.ts";

describe("content loads and is well-formed", () => {
  const modules = loadModules();

  test("every module parses", () => {
    expect(modules.length).toBeGreaterThan(0);
  });

  // Invariant 11. This is a legal requirement, not a style preference: all prose
  // is written originally and must cite what it was researched from.
  test("every module cites at least one source", () => {
    for (const m of modules) {
      expect(m.sources.length, `${m.slug} has no sources`).toBeGreaterThan(0);
      for (const s of m.sources) expect(s.url).toMatch(/^https?:\/\//);
    }
  });

  test("every module has a quiz and every quiz has a module", () => {
    const moduleSlugs = new Set(modules.map((m) => m.slug));
    const quizzes = new Set(quizSlugs());
    for (const slug of moduleSlugs)
      expect(quizzes.has(slug), `${slug} has no quiz`).toBe(true);
    for (const slug of quizzes) {
      if (slug === "placement") continue;
      expect(moduleSlugs.has(slug), `quiz ${slug} has no module`).toBe(true);
    }
  });

  test("every module quiz is 3 mcq + 1 true/false + 1 long answer", () => {
    for (const m of modules) {
      const kinds = loadQuiz(m.slug).questions.map((q) => q.kind);
      expect(kinds.filter((k) => k === "mcq").length, m.slug).toBe(3);
      expect(kinds.filter((k) => k === "true_false").length, m.slug).toBe(1);
      expect(kinds.filter((k) => k === "long_answer").length, m.slug).toBe(1);
    }
  });
});

// Invariant 2: answer keys never reach the browser.
describe("redactQuiz", () => {
  test("strips answers, explanations and rubrics", () => {
    for (const slug of quizSlugs()) {
      const serialized = JSON.stringify(redactQuiz(loadQuiz(slug)));
      expect(serialized).not.toContain('answer":');
      expect(serialized).not.toContain("explanation");
      expect(serialized).not.toContain("rubric");
    }
  });

  test("keeps what the client needs to render", () => {
    const redacted = redactQuiz(loadQuiz("what-investment-banks-do"));
    const mcq = redacted.questions.find((q) => q.kind === "mcq");
    expect(mcq && "choices" in mcq && mcq.choices.length).toBeGreaterThan(1);
  });
});
