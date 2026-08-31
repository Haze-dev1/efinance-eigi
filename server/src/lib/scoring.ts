import { z } from "zod";
import type { LongAnswerQuestion, Quiz } from "./content.ts";

export const submissionSchema = z.object({
  attemptKey: z.uuid(),
  answers: z.record(
    z.string(),
    z.union([z.number().int(), z.boolean(), z.string()]),
  ),
});

export type Submission = z.infer<typeof submissionSchema>;

export type ObjectiveResult = {
  score: number;
  max: number;
  perQuestion: {
    id: string;
    correct: boolean;
    expected: number | boolean;
    explanation: string;
  }[];
  longAnswer: { question: LongAnswerQuestion; response: string } | null;
};

// Invariant 4: MCQ and true/false are decided here, in code, against the stored
// key. The model never sees them and cannot mark a correct answer wrong.
export function scoreObjective(
  quiz: Quiz,
  answers: Submission["answers"],
): ObjectiveResult {
  let score = 0;
  let max = 0;
  const perQuestion: ObjectiveResult["perQuestion"] = [];
  let longAnswer: ObjectiveResult["longAnswer"] = null;

  for (const q of quiz.questions) {
    if (q.kind === "long_answer") {
      const given = answers[q.id];
      longAnswer = {
        question: q,
        response: typeof given === "string" ? given : "",
      };
      continue;
    }

    max += 1;
    const given = answers[q.id];
    // A missing or wrong-typed answer is wrong, never an error. A half-finished
    // submission still produces a result rather than a 400.
    const correct = q.kind === "mcq" ? given === q.answer : given === q.answer;
    if (correct) score += 1;
    perQuestion.push({
      id: q.id,
      correct,
      expected: q.answer,
      explanation: q.explanation,
    });
  }

  return { score, max, perQuestion, longAnswer };
}

// XP is derived here and only here (invariant 8). The client is told the number;
// it never proposes one.
export function xpForAttempt(
  moduleXp: number,
  objective: { score: number; max: number },
  longAnswerScore: number | null,
  longAnswerMax: number,
): number {
  const objectiveMax = Math.max(objective.max, 1);
  const totalEarned = objective.score + (longAnswerScore ?? 0);
  const totalPossible =
    objectiveMax + (longAnswerScore === null ? 0 : longAnswerMax);
  const ratio = totalEarned / Math.max(totalPossible, 1);
  return Math.round(moduleXp * ratio);
}

export const TRACK_THRESHOLDS = { intermediate: 0.5, advanced: 0.8 } as const;

// The placement quiz decides which track a user starts on. Ratio, not raw score,
// so the placement quiz can grow without silently re-banding existing users.
export function trackFor(
  score: number,
  max: number,
): "beginner" | "intermediate" | "advanced" {
  const ratio = score / Math.max(max, 1);
  if (ratio >= TRACK_THRESHOLDS.advanced) return "advanced";
  if (ratio >= TRACK_THRESHOLDS.intermediate) return "intermediate";
  return "beginner";
}

export type QuestionReview = {
  id: string;
  kind: "mcq" | "true_false";
  prompt: string;
  correct: boolean;
  /** What the student picked, rendered for display. null when unanswered. */
  given: string | null;
  /** The right answer, rendered for display. */
  expected: string;
  explanation: string;
};

/**
 * The per-question breakdown shown on the results page.
 *
 * This deliberately includes the answer key, which `redactQuiz` strips. The rule
 * in invariant 2 is that keys never reach the client *before* an attempt is
 * scored — showing someone what they got wrong afterwards is the entire point of
 * marking. Only ever build this from an attempt already stored for that user.
 */
export function reviewFor(
  quiz: Quiz,
  answers: Submission["answers"],
): QuestionReview[] {
  const review: QuestionReview[] = [];

  for (const q of quiz.questions) {
    if (q.kind === "long_answer") continue;
    const given = answers[q.id];

    review.push({
      id: q.id,
      kind: q.kind,
      prompt: q.prompt,
      correct: given === q.answer,
      given: given === undefined ? null : renderAnswer(q, given),
      expected: renderAnswer(q, q.answer),
      explanation: q.explanation,
    });
  }
  return review;
}

function renderAnswer(
  q: Extract<Quiz["questions"][number], { kind: "mcq" | "true_false" }>,
  value: number | boolean | string,
): string {
  if (q.kind === "true_false")
    return value === true ? "True" : value === false ? "False" : "—";
  // An out-of-range index means a malformed submission, not a crash.
  return typeof value === "number" ? (q.choices[value] ?? "—") : "—";
}
