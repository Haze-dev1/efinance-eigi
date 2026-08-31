import { useState } from "react";
import type { PublicQuestion } from "../lib/api";
import { Button } from "../components/Chrome";

export type Answers = Record<string, number | boolean | string>;

/** Shared by the placement quiz and every module quiz. */
export function QuizForm({
  questions,
  submitLabel,
  busy,
  onSubmit,
}: {
  questions: PublicQuestion[];
  submitLabel: string;
  busy: boolean;
  onSubmit: (answers: Answers) => void;
}) {
  const [answers, setAnswers] = useState<Answers>({});
  const objective = questions.filter((q) => q.kind !== "long_answer");
  const answered = objective.filter((q) => answers[q.id] !== undefined).length;

  function set(id: string, value: number | boolean | string) {
    setAnswers((a) => ({ ...a, [id]: value }));
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(answers);
      }}
      className="mt-8"
    >
      <ol className="grid gap-10">
        {questions.map((q, i) => (
          <li key={q.id}>
            <div className="flex gap-3">
              <span className="font-data text-[0.66rem] text-muted tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="flex-1">
                <p className="font-body text-[1.05rem] leading-snug">
                  {q.prompt}
                </p>

                {q.kind === "mcq" && (
                  <div className="mt-4 grid gap-2">
                    {q.choices.map((c, ci) => (
                      <Choice
                        key={c}
                        name={q.id}
                        label={c}
                        checked={answers[q.id] === ci}
                        onChange={() => set(q.id, ci)}
                      />
                    ))}
                  </div>
                )}

                {q.kind === "true_false" && (
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {[true, false].map((v) => (
                      <Choice
                        key={String(v)}
                        name={q.id}
                        label={v ? "True" : "False"}
                        checked={answers[q.id] === v}
                        onChange={() => set(q.id, v)}
                      />
                    ))}
                  </div>
                )}

                {q.kind === "long_answer" && (
                  <div className="mt-4">
                    <textarea
                      rows={7}
                      value={(answers[q.id] as string) ?? ""}
                      onChange={(e) => set(q.id, e.target.value)}
                      placeholder="Write your answer here."
                      className="w-full rounded-lg border border-rule-soft bg-surface/50 px-4 py-3 font-body leading-relaxed text-text placeholder:text-muted/60 focus:border-violet"
                    />
                    <p className="mt-1.5 font-data text-[0.6rem] uppercase tracking-[0.16em] text-muted">
                      Marked out of {q.maxScore} against a rubric
                    </p>
                  </div>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-10 flex flex-wrap items-center gap-4 border-t border-rule-soft pt-6">
        <Button type="submit" disabled={busy}>
          {busy ? "Marking…" : submitLabel}
        </Button>
        <span className="font-data text-[0.62rem] uppercase tracking-[0.16em] text-muted">
          {answered} of {objective.length} answered
        </span>
      </div>
    </form>
  );
}

function Choice({
  name,
  label,
  checked,
  onChange,
}: {
  name: string;
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-2.5 font-body text-[0.97rem] transition ${
        checked
          ? "border-mint bg-mint-dim/50"
          : "border-rule-soft bg-surface/40 hover:border-violet hover:bg-surface-2"
      }`}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="mt-1.5 accent-[var(--color-mint)]"
      />
      <span>{label}</span>
    </label>
  );
}
