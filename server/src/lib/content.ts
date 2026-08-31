import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { TRACKS } from "../db/mongo.ts";

export const CONTENT_DIR = join(import.meta.dirname, "../../../content");

// Invariant 11: sources is required and must be non-empty. All prose is written
// originally; these are the references it was researched from and links out to.
const sourceSchema = z.object({
  title: z.string().min(1),
  url: z.url(),
});

// The five curriculum topics live in content/topics.json rather than in code:
// they carry a title and blurb the dashboard renders, so they are content, and
// content review is code review. loadModules() rejects any module pointing at a
// topic that is not listed there.
const topicSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  order: z.number().int().positive(),
  title: z.string().min(1),
  blurb: z.string().min(1),
});

export type Topic = z.infer<typeof topicSchema>;

const moduleSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  // Which of the five topics this chapter belongs to.
  topic: z.string().regex(/^[a-z0-9-]+$/),
  // Position within the topic, 1-based. Distinct from `order`, which is global.
  chapter: z.number().int().positive(),
  title: z.string().min(1),
  summary: z.string().min(1),
  track: z.enum(TRACKS),
  order: z.number().int().nonnegative(),
  xp: z.number().int().positive(),
  minutes: z.number().int().positive(),
  sources: z.array(sourceSchema).min(1),
});

export type Module = z.infer<typeof moduleSchema>;

const mcqSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("mcq"),
  prompt: z.string().min(1),
  choices: z.array(z.string().min(1)).min(2),
  answer: z.number().int().nonnegative(),
  explanation: z.string().min(1),
});

const trueFalseSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("true_false"),
  prompt: z.string().min(1),
  answer: z.boolean(),
  explanation: z.string().min(1),
});

const longAnswerSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("long_answer"),
  prompt: z.string().min(1),
  // Never sent to the client. Given to the grader as the marking guide.
  rubric: z.array(z.string().min(1)).min(1),
  maxScore: z.number().int().positive(),
});

const quizSchema = z.object({
  slug: z.string().min(1),
  questions: z
    .array(
      z.discriminatedUnion("kind", [
        mcqSchema,
        trueFalseSchema,
        longAnswerSchema,
      ]),
    )
    .min(1),
});

export type Quiz = z.infer<typeof quizSchema>;
export type Question = Quiz["questions"][number];
export type LongAnswerQuestion = z.infer<typeof longAnswerSchema>;

export function loadTopics(dir = CONTENT_DIR): Topic[] {
  const raw: unknown = JSON.parse(
    readFileSync(join(dir, "topics.json"), "utf8"),
  );
  return z
    .array(topicSchema)
    .parse(raw)
    .sort((a, b) => a.order - b.order);
}

export function loadModules(dir = CONTENT_DIR): Module[] {
  const raw: unknown = JSON.parse(
    readFileSync(join(dir, "modules.json"), "utf8"),
  );
  const modules = z.array(moduleSchema).parse(raw);

  const slugs = new Set<string>();
  const topicIds = new Set(loadTopics(dir).map((t) => t.id));
  const seenChapters = new Set<string>();

  for (const m of modules) {
    if (slugs.has(m.slug)) throw new Error(`duplicate module slug: ${m.slug}`);
    slugs.add(m.slug);

    // A module pointing at a topic that does not exist would silently vanish
    // from the dashboard rather than failing anywhere visible.
    if (!topicIds.has(m.topic)) {
      throw new Error(`${m.slug}: unknown topic "${m.topic}"`);
    }
    const chapterKey = `${m.topic}#${m.chapter}`;
    if (seenChapters.has(chapterKey)) {
      throw new Error(`two modules claim ${chapterKey}`);
    }
    seenChapters.add(chapterKey);
  }
  return modules.sort((a, b) => a.order - b.order);
}

export function loadQuiz(slug: string, dir = CONTENT_DIR): Quiz {
  const raw: unknown = JSON.parse(
    readFileSync(join(dir, "quizzes", `${slug}.json`), "utf8"),
  );
  const quiz = quizSchema.parse(raw);

  // An mcq whose answer indexes past its choices scores every submission wrong
  // and nobody notices until a student complains. Catch it at load.
  for (const q of quiz.questions) {
    if (q.kind === "mcq" && q.answer >= q.choices.length) {
      throw new Error(
        `${slug}/${q.id}: answer index ${q.answer} is out of range`,
      );
    }
  }
  return quiz;
}

export function quizSlugs(dir = CONTENT_DIR): string[] {
  return readdirSync(join(dir, "quizzes"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
}

// Invariant 2: this is the only shape a quiz may take on its way to the browser.
// `answer`, `explanation`, and `rubric` are dropped here, once, for every caller.
export function redactQuiz(quiz: Quiz) {
  return {
    slug: quiz.slug,
    questions: quiz.questions.map((q) => {
      switch (q.kind) {
        case "mcq":
          return {
            id: q.id,
            kind: q.kind,
            prompt: q.prompt,
            choices: q.choices,
          };
        case "true_false":
          return { id: q.id, kind: q.kind, prompt: q.prompt };
        case "long_answer":
          return {
            id: q.id,
            kind: q.kind,
            prompt: q.prompt,
            maxScore: q.maxScore,
          };
      }
    }),
  };
}
