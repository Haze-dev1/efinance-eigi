import { z } from "zod";
import { env } from "../env.ts";
import type { LongAnswerQuestion } from "./content.ts";

// Invariant 5: nothing the model returns is trusted. This schema is the only
// gate between OpenRouter's response and the database.
const gradeSchema = z.object({
  score: z.number().int(),
  feedback: z.string().min(1).max(2000),
});

export type Grade = z.infer<typeof gradeSchema>;

/**
 * OpenRouter returns HTTP 200 with an error envelope when the upstream provider
 * fails — observed as `{"error":{"message":"Upstream error from …","code":502}}`
 * on a 200. Treating that as a completion means a transient provider outage
 * looks like a permanent parse failure and is never retried.
 */
const errorEnvelope = z.object({
  error: z.object({ message: z.string(), code: z.number().optional() }),
});

export function retryableUpstreamError(body: unknown): string | null {
  const parsed = errorEnvelope.safeParse(body);
  if (!parsed.success) return null;
  const { message, code } = parsed.data.error;
  // 4xx other than rate-limiting is our fault and will fail again identically.
  const retryable = code === undefined || code === 429 || code >= 500;
  return retryable ? `${code ?? "?"}: ${message}` : null;
}
export type GradeResult =
  { status: "graded"; grade: Grade } | { status: "failed"; reason: string };

const TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function buildPrompt(question: LongAnswerQuestion, response: string): string {
  return [
    "You are marking one long-answer question from an investment banking course.",
    "",
    `QUESTION: ${question.prompt}`,
    "",
    "MARKING GUIDE — award one point for each point the student covers:",
    ...question.rubric.map((r, i) => `${i + 1}. ${r}`),
    "",
    `MAXIMUM SCORE: ${question.maxScore}`,
    "",
    "STUDENT ANSWER:",
    response.slice(0, 8000),
    "",
    "Reply with JSON only, no prose and no code fences:",
    `{"score": <integer 0-${question.maxScore}>, "feedback": "<2-4 sentences, addressed to the student, naming what they covered and what they missed>"}`,
  ].join("\n");
}

// Extracts the first JSON object in the text. Models wrap JSON in fences or
// preamble often enough that failing on it would mean losing valid grades.
function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start)
    throw new Error("no JSON object in response");
  return JSON.parse(candidate.slice(start, end + 1));
}

export async function gradeLongAnswer(
  question: LongAnswerQuestion,
  response: string,
): Promise<GradeResult> {
  // An empty answer is a zero, decided here. No point spending a call on it.
  if (response.trim().length === 0) {
    return {
      status: "graded",
      grade: {
        score: 0,
        feedback: "No answer was submitted for this question.",
      },
    };
  }
  return attemptGrade(question, response, 1);
}

async function attemptGrade(
  question: LongAnswerQuestion,
  response: string,
  attempt: number,
): Promise<GradeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.OPENROUTER_MODEL,
        temperature: 0,
        messages: [{ role: "user", content: buildPrompt(question, response) }],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      // Free and shared model pools return 429 with a Retry-After we should obey.
      // Observed on the very first call against a :free model, so this path is
      // the common case there, not an edge case.
      if ((res.status === 429 || res.status >= 500) && attempt < MAX_ATTEMPTS) {
        const after = Number(res.headers.get("retry-after"));
        await sleep(
          Number.isFinite(after) && after > 0
            ? after * 1000
            : 2 ** attempt * 1000,
        );
        return attemptGrade(question, response, attempt + 1);
      }
      return { status: "failed", reason: `openrouter ${res.status}: ${body}` };
    }

    const body: unknown = await res.json();
    const content = z
      .object({
        choices: z
          .array(z.object({ message: z.object({ content: z.string() }) }))
          .min(1),
      })
      .parse(body).choices[0].message.content;

    const grade = gradeSchema.parse(extractJson(content));

    // The model is capable of returning 7 out of 5. Clamp rather than reject:
    // a bounded score is more useful to the student than a failed grading.
    return {
      status: "graded",
      grade: {
        ...grade,
        score: Math.min(Math.max(grade.score, 0), question.maxScore),
      },
    };
  } catch (err) {
    return {
      status: "failed",
      reason: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}
