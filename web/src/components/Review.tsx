import type { QuestionReview } from "../lib/api";

/**
 * The per-question breakdown. Shown only after an attempt has been marked, which
 * is the one moment the answer key is legitimately visible to the student.
 */
export function ReviewList({ review }: { review: QuestionReview[] }) {
  return (
    <ol className="mt-5 grid gap-3">
      {review.map((q, i) => (
        <li
          key={q.id}
          className={`rounded-xl border p-4 ${
            q.correct
              ? "border-mint/35 bg-mint-dim/50"
              : "border-rose/40 bg-rose-dim/50"
          }`}
        >
          <div className="flex items-baseline gap-2.5">
            <span className="font-data text-[0.62rem] tracking-[0.16em] text-muted uppercase">
              Q{i + 1}
            </span>
            <span
              className={`font-data text-[0.62rem] tracking-[0.16em] uppercase ${
                q.correct ? "text-mint" : "text-rose"
              }`}
            >
              {q.correct ? "Correct" : "Not quite"}
            </span>
          </div>

          <p className="mt-2 font-body text-[1rem] leading-snug text-text">
            {q.prompt}
          </p>

          <dl className="mt-3 grid gap-1.5 font-body text-[0.93rem]">
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-muted">You answered</dt>
              <dd className={q.correct ? "text-text" : "text-rose"}>
                {q.given ?? "nothing"}
              </dd>
            </div>
            {!q.correct && (
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-muted">Correct answer</dt>
                <dd className="text-mint">{q.expected}</dd>
              </div>
            )}
          </dl>

          <p className="mt-3 border-t border-rule-soft pt-3 font-body text-[0.93rem] leading-relaxed text-muted">
            {q.explanation}
          </p>
        </li>
      ))}
    </ol>
  );
}
