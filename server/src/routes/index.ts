import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { waitlist } from "../db/mongo.ts";
import { issueToken, requireUser } from "../lib/auth.ts";
import {
  loadModules,
  loadQuiz,
  loadTopics,
  redactQuiz,
} from "../lib/content.ts";
import { isDuplicateKey } from "../lib/mongo-errors.ts";
import {
  reviewFor,
  scoreObjective,
  submissionSchema,
  trackFor,
} from "../lib/scoring.ts";
import {
  DuplicateAttempt,
  gradePending,
  submitAttempt,
} from "../services/attempts.ts";
import {
  EmailTaken,
  attemptByKey,
  authenticate,
  completedModules,
  createUser,
  getProfile,
  recordPlacement,
  toPublic,
} from "../services/profile.ts";

const credentials = z.object({
  email: z.email(),
  password: z.string().min(8, "password must be at least 8 characters"),
});

const RANK = { beginner: 0, intermediate: 1, advanced: 2 } as const;

export function registerRoutes(app: FastifyInstance) {
  app.get("/api/health", () => ({ ok: true }));

  // ── public ──────────────────────────────────────────────────────────────
  app.post("/api/waitlist", async (req, reply) => {
    const parsed = z.object({ email: z.email() }).safeParse(req.body);
    if (!parsed.success)
      return reply.code(400).send({ error: "a valid email is required" });

    try {
      await (
        await waitlist()
      ).insertOne({
        _id: randomUUID(),
        email: parsed.data.email,
        emailLower: parsed.data.email.toLowerCase(),
        createdAt: new Date(),
      });
    } catch (err) {
      if (!isDuplicateKey(err)) throw err;
    }
    // Always the same response: whether an address is already on the list is not
    // something an anonymous caller should be able to probe.
    return { ok: true };
  });

  // ── auth ────────────────────────────────────────────────────────────────
  app.post("/api/auth/signup", async (req, reply) => {
    const parsed = credentials.safeParse(req.body);
    if (!parsed.success)
      return reply.code(400).send({ error: parsed.error.issues[0].message });

    try {
      const user = await createUser(parsed.data.email, parsed.data.password);
      return {
        session: {
          access_token: await issueToken({ id: user._id, email: user.email }),
        },
        profile: toPublic(user),
      };
    } catch (err) {
      if (err instanceof EmailTaken) {
        return reply
          .code(409)
          .send({ error: "an account with that email already exists" });
      }
      throw err;
    }
  });

  app.post("/api/auth/login", async (req, reply) => {
    const parsed = credentials.safeParse(req.body);
    if (!parsed.success)
      return reply.code(400).send({ error: "email and password are required" });

    const user = await authenticate(parsed.data.email, parsed.data.password);
    // One message for both "no such account" and "wrong password": distinguishing
    // them tells an attacker which addresses are registered.
    if (!user)
      return reply.code(401).send({ error: "invalid email or password" });

    return {
      session: {
        access_token: await issueToken({ id: user._id, email: user.email }),
      },
      profile: toPublic(user),
    };
  });

  // ── authenticated ───────────────────────────────────────────────────────
  const authed = { preHandler: requireUser };

  app.get("/api/me", authed, async (req, reply) => {
    const profile = await getProfile(req.user!.id);
    // The token verified but the user is gone — a deleted account holding a
    // still-valid token. Treat it as signed out rather than 500ing.
    if (!profile)
      return reply.code(401).send({ error: "account no longer exists" });
    return toPublic(profile);
  });

  app.get("/api/placement", authed, () => redactQuiz(loadQuiz("placement")));

  app.post("/api/placement", authed, async (req, reply) => {
    const parsed = submissionSchema.safeParse(req.body);
    if (!parsed.success)
      return reply.code(400).send({ error: "malformed submission" });

    const quiz = loadQuiz("placement");
    const objective = scoreObjective(quiz, parsed.data.answers);
    const track = trackFor(objective.score, objective.max);
    await recordPlacement(req.user!.id, track, objective.score);

    return {
      track,
      score: objective.score,
      max: objective.max,
      review: reviewFor(quiz, parsed.data.answers),
    };
  });

  app.get("/api/modules", authed, async (req) => {
    const profile = await getProfile(req.user!.id);
    const done = await completedModules(req.user!.id);
    const ceiling = RANK[profile?.track ?? "beginner"];

    // A user sees their own track and everything easier, so an advanced
    // placement never hides the foundations from someone who wants them.
    const modules = loadModules()
      .filter((m) => RANK[m.track] <= ceiling)
      .map((m) => ({
        ...m,
        completed: done.has(m.slug),
        xpEarned: done.get(m.slug) ?? null,
      }));

    return {
      track: profile?.track ?? null,
      xp: profile?.xp ?? 0,
      topics: loadTopics(),
      modules,
    };
  });

  app.get("/api/modules/:slug", authed, async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const module = loadModules().find((m) => m.slug === slug);
    if (!module) return reply.code(404).send({ error: "no such module" });

    return { module, quiz: redactQuiz(loadQuiz(slug)) };
  });

  app.post("/api/modules/:slug/submit", authed, async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const parsed = submissionSchema.safeParse(req.body);
    if (!parsed.success)
      return reply.code(400).send({ error: "malformed submission" });
    if (!loadModules().some((m) => m.slug === slug)) {
      return reply.code(404).send({ error: "no such module" });
    }

    let result;
    try {
      result = await submitAttempt(req.user!.id, slug, parsed.data);
    } catch (err) {
      if (err instanceof DuplicateAttempt) {
        return reply
          .code(200)
          .send({ replayed: true, attemptKey: parsed.data.attemptKey });
      }
      throw err;
    }

    // Invariant 6: grading runs after the response, so a slow or failing
    // OpenRouter never delays or blocks the student's result.
    const { attempt } = result;
    void gradePending(attempt._id, req.user!.id, slug).catch((err) =>
      req.log.error(
        { err, attemptId: attempt._id },
        "background grading failed",
      ),
    );

    return { attemptKey: attempt.attemptKey };
  });

  // Polled by the results page until grading settles.
  app.get("/api/attempts/:attemptKey", authed, async (req, reply) => {
    const { attemptKey } = req.params as { attemptKey: string };
    if (!z.uuid().safeParse(attemptKey).success) {
      return reply.code(400).send({ error: "malformed attempt key" });
    }

    const attempt = await attemptByKey(req.user!.id, attemptKey);
    if (!attempt) return reply.code(404).send({ error: "no such attempt" });

    const quiz = loadQuiz(attempt.moduleSlug);
    const longAnswerQuestion = quiz.questions.find(
      (q) => q.kind === "long_answer",
    );

    return {
      attemptKey: attempt.attemptKey,
      moduleSlug: attempt.moduleSlug,
      objective: { score: attempt.objectiveScore, max: attempt.objectiveMax },
      // Safe here and only here: this attempt has already been scored for this
      // user, so showing them what they got wrong reveals nothing they can reuse.
      review: reviewFor(quiz, attempt.answers),
      longAnswer: {
        status: attempt.gradingStatus,
        prompt: longAnswerQuestion?.prompt ?? null,
        response: attempt.longAnswer,
        score: attempt.longAnswerScore,
        max: attempt.longAnswerMax,
        // A failure reason is an internal diagnostic, never shown to a student.
        feedback:
          attempt.gradingStatus === "graded"
            ? attempt.longAnswerFeedback
            : null,
      },
      xpAwarded: attempt.xpAwarded,
    };
  });
}
