import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  api,
  type PlacementResult,
  type Profile,
  type PublicQuiz,
} from "../lib/api";
import { ReviewList } from "../components/Review";
import { Button, Eyebrow, Header } from "../components/Chrome";
import { TRACK_LABEL } from "../lib/tracks";
import { QuizForm, type Answers } from "./Quiz";

export default function Placement({
  profile,
  onPlaced,
}: {
  profile: Profile | null;
  onPlaced: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState<PublicQuiz | null>(null);
  const [result, setResult] = useState<PlacementResult | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<PublicQuiz>("/placement")
      .then(setQuiz)
      .catch(() => setQuiz(null));
  }, []);

  async function submit(answers: Answers) {
    setBusy(true);
    try {
      setResult(
        await api<PlacementResult>("/placement", {
          method: "POST",
          body: JSON.stringify({ attemptKey: crypto.randomUUID(), answers }),
        }),
      );
      // The route guard on /learn reads `placed` from the profile App holds, so
      // it has to be refetched here or leaving this page bounces straight back.
      await onPlaced();
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <>
        <Header profile={profile} />
        <main className="mx-auto max-w-2xl px-5 py-14">
          <Eyebrow>Placed</Eyebrow>
          <h1 className="mt-4 font-display text-[2.4rem] leading-tight font-extrabold">
            You start as {TRACK_LABEL[result.track] === "Analyst" ? "an" : "a"}{" "}
            {TRACK_LABEL[result.track]}.
          </h1>
          <p className="mt-4 font-body text-[1.05rem] text-muted">
            {result.score} of {result.max} correct. This decides where you
            begin, not where you finish — everything below your level stays
            available.
          </p>

          <ReviewList review={result.review} />

          <div className="mt-10">
            <Button
              onClick={async () => {
                // Awaited again in case the refresh after submitting failed.
                await onPlaced();
                navigate("/learn");
              }}
            >
              See your modules
            </Button>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Header profile={profile} />
      <main className="mx-auto max-w-2xl px-5 py-14">
        <Eyebrow>Placement</Eyebrow>
        <h1 className="mt-4 font-display text-[2.2rem] leading-tight font-extrabold">
          Six questions. Answer honestly — guessing well only costs you later.
        </h1>
        <p className="mt-4 font-body text-[1.02rem] text-muted">
          There is no pass mark. This finds the level where the material is
          still teaching you something.
        </p>
        {quiz ? (
          <QuizForm
            questions={quiz.questions}
            submitLabel="Place me"
            busy={busy}
            onSubmit={submit}
          />
        ) : (
          <p className="mt-8 font-body text-muted">Loading the questions…</p>
        )}
      </main>
    </>
  );
}
