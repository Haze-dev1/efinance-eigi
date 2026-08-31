import { randomUUID } from "node:crypto";
import { attempts, moduleProgress, type AttemptDoc } from "../db/mongo.ts";
import { loadModules, loadQuiz } from "../lib/content.ts";
import { gradeLongAnswer } from "../lib/grading.ts";
import { isDuplicateKey } from "../lib/mongo-errors.ts";
import {
  scoreObjective,
  xpForAttempt,
  type Submission,
} from "../lib/scoring.ts";
import { awardXp } from "./profile.ts";

export class DuplicateAttempt extends Error {}

// The whole submission path. Ordering matters and is deliberate:
//   1. score the objective questions in code
//   2. persist the attempt, which is where idempotency is enforced
//   3. award XP for what is already known
//   4. grade the long answer out of band
// A failure at step 4 leaves a usable result behind (invariant 6).
export async function submitAttempt(
  userId: string,
  slug: string,
  submission: Submission,
) {
  const module = loadModules().find((m) => m.slug === slug);
  if (!module) throw new Error(`unknown module: ${slug}`);

  const quiz = loadQuiz(slug);
  const objective = scoreObjective(quiz, submission.answers);
  const longAnswerMax = objective.longAnswer?.question.maxScore ?? 5;
  const provisionalXp = xpForAttempt(module.xp, objective, null, longAnswerMax);

  const doc: AttemptDoc = {
    _id: randomUUID(),
    attemptKey: submission.attemptKey,
    userId,
    moduleSlug: slug,
    submittedAt: new Date(),
    answers: submission.answers,
    objectiveScore: objective.score,
    objectiveMax: objective.max,
    longAnswer: objective.longAnswer?.response ?? "",
    gradingStatus: "pending",
    longAnswerScore: null,
    longAnswerMax,
    longAnswerFeedback: null,
    xpAwarded: provisionalXp,
  };

  try {
    await (await attempts()).insertOne(doc);
  } catch (err) {
    // Invariant 7: the unique index on attemptKey is the idempotency guarantee.
    // A replayed submission returns the original result and awards nothing twice.
    if (isDuplicateKey(err, "attemptKey")) throw new DuplicateAttempt(slug);
    throw err;
  }

  // A retake of a module already completed must not award its XP a second time,
  // so progress is recorded once and XP follows that insert, not the attempt.
  let firstCompletion = true;
  try {
    await (
      await moduleProgress()
    ).insertOne({
      _id: randomUUID(),
      userId,
      moduleSlug: slug,
      completedAt: new Date(),
      xpAwarded: provisionalXp,
    });
  } catch (err) {
    if (isDuplicateKey(err)) firstCompletion = false;
    else throw err;
  }

  if (firstCompletion) await awardXp(userId, provisionalXp);
  else
    await (
      await attempts()
    ).updateOne({ _id: doc._id }, { $set: { xpAwarded: 0 } });

  return {
    attempt: { ...doc, xpAwarded: firstCompletion ? provisionalXp : 0 },
    objective,
    module,
  };
}

// Called after the response is already on its way to the client. Any XP the long
// answer earns is added on top of what was awarded at submission time.
export async function gradePending(
  attemptId: string,
  userId: string,
  slug: string,
) {
  const col = await attempts();
  const attempt = await col.findOne({ _id: attemptId });
  if (!attempt || attempt.gradingStatus !== "pending") return;

  const question = loadQuiz(slug).questions.find(
    (q) => q.kind === "long_answer",
  );
  if (!question || question.kind !== "long_answer") return;

  const result = await gradeLongAnswer(question, attempt.longAnswer);
  if (result.status === "failed") {
    await col.updateOne(
      { _id: attemptId },
      {
        $set: {
          gradingStatus: "failed",
          longAnswerFeedback: result.reason.slice(0, 500),
        },
      },
    );
    return;
  }

  const module = loadModules().find((m) => m.slug === slug);
  // A retake earns no further XP, so the delta is computed against what this
  // attempt was actually credited rather than against the module's full value.
  const totalXp =
    attempt.xpAwarded === 0
      ? 0
      : xpForAttempt(
          module?.xp ?? 0,
          { score: attempt.objectiveScore, max: attempt.objectiveMax },
          result.grade.score,
          attempt.longAnswerMax,
        );
  const delta = Math.max(totalXp - attempt.xpAwarded, 0);

  await col.updateOne(
    { _id: attemptId },
    {
      $set: {
        gradingStatus: "graded",
        longAnswerScore: result.grade.score,
        longAnswerFeedback: result.grade.feedback,
        xpAwarded: attempt.xpAwarded + delta,
      },
    },
  );
  await awardXp(userId, delta);
}
