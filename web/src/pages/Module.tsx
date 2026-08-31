import { MDXProvider } from "@mdx-js/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { ComponentType } from "react";
import {
  api,
  type AttemptResult,
  type ModuleMeta,
  type Profile,
  type PublicQuiz,
} from "../lib/api";
import { Button, Eyebrow, Header } from "../components/Chrome";
import { Callout } from "../components/Callout";
import { Chart } from "../components/Chart";
import { Diagram } from "../components/Diagram";
import { Tombstone } from "../components/Tombstone";
import { ReviewList } from "../components/Review";
import { QuizForm, type Answers } from "./Quiz";

// Prose is compiled at build time from content/, the same tree the server reads.
const PROSE = import.meta.glob<{ default: ComponentType }>(
  "@content/modules/*.mdx",
);

const mdxComponents = { Callout, Chart, Diagram };

type Detail = { module: ModuleMeta; quiz: PublicQuiz };
type Stage = "reading" | "quiz" | "result";

export default function Module({
  profile,
  onProgress,
}: {
  profile: Profile;
  onProgress: () => Promise<void>;
}) {
  const { slug = "" } = useParams();
  // Keying on the slug remounts the view, which resets reading/quiz/result state
  // for free. Clearing it by hand in an effect would render the stale module first.
  return (
    <ModuleView
      key={slug}
      slug={slug}
      profile={profile}
      onProgress={onProgress}
    />
  );
}

function ModuleView({
  slug,
  profile,
  onProgress,
}: {
  slug: string;
  profile: Profile;
  onProgress: () => Promise<void>;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [Prose, setProse] = useState<ComponentType | null>(null);
  const [stage, setStage] = useState<Stage>("reading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AttemptResult | null>(null);

  useEffect(() => {
    api<Detail>(`/modules/${slug}`)
      .then(setDetail)
      .catch(() => setError("No such module."));

    const key = Object.keys(PROSE).find((p) => p.endsWith(`/${slug}.mdx`));
    if (key) void PROSE[key]().then((m) => setProse(() => m.default));
  }, [slug]);

  const submit = useCallback(
    async (answers: Answers) => {
      setBusy(true);
      setError("");
      try {
        const attemptKey = crypto.randomUUID();
        const submitted = await api<{ attemptKey: string }>(
          `/modules/${slug}/submit`,
          {
            method: "POST",
            body: JSON.stringify({ attemptKey, answers }),
          },
        );
        setResult(
          await api<AttemptResult>(`/attempts/${submitted.attemptKey}`),
        );
        setStage("result");
        // XP and completion just changed server-side; refresh so the header and
        // the dashboard reflect it without a manual reload.
        await onProgress();
      } catch {
        setError(
          "Your answers could not be submitted. Nothing was lost — try again.",
        );
      } finally {
        setBusy(false);
      }
    },
    [slug, onProgress],
  );

  if (error && !detail) {
    return (
      <>
        <Header profile={profile} />
        <main className="mx-auto max-w-2xl px-5 py-16">
          <p className="font-body">{error}</p>
          <Link
            to="/learn"
            className="mt-4 inline-block text-mint underline underline-offset-2"
          >
            Back to your modules
          </Link>
        </main>
      </>
    );
  }

  if (!detail) {
    return (
      <>
        <Header profile={profile} />
        <main className="mx-auto max-w-2xl px-5 py-16 font-body text-muted">
          Loading…
        </main>
      </>
    );
  }

  const { module, quiz } = detail;

  return (
    <>
      <Header profile={profile} />
      <main className="mx-auto max-w-3xl px-5 py-12">
        <Eyebrow>
          {module.minutes} min read · {module.xp} XP
        </Eyebrow>
        <h1 className="mt-4 font-display text-[2.4rem] leading-[1.05] font-extrabold">
          {module.title}
        </h1>

        {stage === "reading" && (
          <>
            <article className="prose-efinance mt-9 font-body">
              <MDXProvider components={mdxComponents}>
                {Prose ? <Prose /> : null}
              </MDXProvider>
            </article>

            <section className="mt-12 border-t border-rule-soft pt-6">
              <Eyebrow>Researched from</Eyebrow>
              <ul className="mt-3 grid gap-1.5">
                {module.sources.map((s) => (
                  <li key={s.url}>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="font-body text-[0.95rem] text-mint underline underline-offset-2"
                    >
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
              <p className="mt-3 max-w-lg font-body text-[0.88rem] text-muted">
                Written originally from these sources. Follow them for the long
                version.
              </p>
            </section>

            <div className="mt-10 border-t border-rule-soft pt-8">
              <Button onClick={() => setStage("quiz")}>Take the quiz</Button>
            </div>
          </>
        )}

        {stage === "quiz" && (
          <>
            <p className="mt-5 max-w-xl font-body text-[1.02rem] text-muted">
              Five questions. The last one is written and gets marked against a
              rubric.
            </p>
            {error && (
              <p
                role="alert"
                className="mt-6 rounded-lg border border-rose/35 bg-rose-dim px-4 py-3 font-body"
              >
                {error}
              </p>
            )}
            <QuizForm
              questions={quiz.questions}
              submitLabel="Submit answers"
              busy={busy}
              onSubmit={submit}
            />
          </>
        )}

        {stage === "result" && result && (
          <Result module={module} initial={result} />
        )}
      </main>
    </>
  );
}

function Result({
  module,
  initial,
}: {
  module: ModuleMeta;
  initial: AttemptResult;
}) {
  const [attempt, setAttempt] = useState(initial);
  const timer = useRef<number | undefined>(undefined);

  // Invariant 6 on the client side: the objective score and the full breakdown
  // are already on screen. This poll only fills in the written answer.
  useEffect(() => {
    if (attempt.longAnswer.status !== "pending") return;
    timer.current = window.setInterval(async () => {
      try {
        const next = await api<AttemptResult>(
          `/attempts/${attempt.attemptKey}`,
        );
        setAttempt(next);
        if (next.longAnswer.status !== "pending")
          window.clearInterval(timer.current);
      } catch {
        window.clearInterval(timer.current);
      }
    }, 2500);
    return () => window.clearInterval(timer.current);
  }, [attempt.attemptKey, attempt.longAnswer.status]);

  const { longAnswer, objective, review } = attempt;
  const wrong = review.filter((q) => !q.correct).length;

  return (
    <div className="mt-9">
      <Eyebrow>Marked</Eyebrow>
      <p className="mt-4 font-display text-[2.6rem] leading-none font-extrabold tabular-nums text-text">
        {objective.score}
        <span className="text-muted">/{objective.max}</span>
        <span className="ml-3 font-data text-sm font-normal tracking-[0.14em] text-muted uppercase">
          objective
        </span>
      </p>
      <p className="mt-2 font-body text-[0.98rem] text-muted">
        {wrong === 0
          ? "Every objective question correct."
          : `${wrong} to look at again — each one is explained below.`}
      </p>

      <section className="mt-9">
        <Eyebrow>Question by question</Eyebrow>
        <ReviewList review={review} />
      </section>

      <section className="card mt-9 p-5">
        <Eyebrow>Written answer</Eyebrow>
        {longAnswer.prompt && (
          <p className="mt-3 font-body text-[0.99rem] leading-snug text-text">
            {longAnswer.prompt}
          </p>
        )}
        {longAnswer.response && (
          <blockquote className="mt-3 border-l-2 border-rule pl-4 font-body text-[0.95rem] leading-relaxed text-muted">
            {longAnswer.response}
          </blockquote>
        )}

        {longAnswer.status === "pending" && (
          <p className="mt-4 font-body text-[0.99rem] text-muted">
            Being marked now. Your objective score above is already final and
            your XP is banked — this only adds to it.
          </p>
        )}
        {longAnswer.status === "failed" && (
          <p className="mt-4 font-body text-[0.99rem] text-muted">
            The marker could not be reached. Your objective score stands and
            your XP is banked. We will mark this and it will appear here.
          </p>
        )}
        {longAnswer.status === "graded" && (
          <>
            <p className="mt-4 font-display text-[1.6rem] font-extrabold tabular-nums text-text">
              {longAnswer.score}
              <span className="text-muted">/{longAnswer.max}</span>
            </p>
            <p className="mt-3 font-body text-[1rem] leading-relaxed text-text">
              {longAnswer.feedback}
            </p>
          </>
        )}
      </section>

      <div className="mt-10 max-w-xs">
        <Tombstone
          title={module.title}
          xp={attempt.xpAwarded}
          score={`${objective.score}/${objective.max}`}
          date={new Date()
            .toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })
            .toUpperCase()}
        />
      </div>

      <div className="mt-10 border-t border-rule-soft pt-6">
        <Link to="/learn">
          <Button>Back to your modules</Button>
        </Link>
      </div>
    </div>
  );
}
