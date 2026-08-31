/**
 * The signature element.
 *
 * When a deal closes, banks print a "tombstone" — a deliberately plain, rigidly
 * typeset announcement. It is the industry's own trophy, and bankers keep them
 * in lucite on their desks for decades. Finishing a module mints one.
 *
 * Gold appears nowhere else in the app, so gold always means exactly this.
 */
export function Tombstone({
  title,
  xp,
  date,
  score,
}: {
  title: string;
  xp: number;
  date: string;
  score?: string;
}) {
  return (
    <figure className="relative overflow-hidden rounded-xl border border-gold/40 bg-gradient-to-b from-[#232522] to-[#161a20] px-6 py-7 text-center">
      {/* A single soft foil highlight — the only decoration that earns its place. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-16 h-32 bg-[radial-gradient(60%_100%_at_50%_100%,var(--color-gold),transparent)] opacity-15"
      />
      <div className="relative">
        <div className="font-data text-[0.58rem] tracking-[0.3em] text-gold uppercase">
          Completed
        </div>
        <div className="mx-auto my-3 h-px w-9 bg-gold/45" />
        <h3 className="font-display text-[1.05rem] leading-tight font-extrabold text-[#f2e9d8] uppercase">
          {title}
        </h3>
        <p className="mt-2.5 font-body text-[0.88rem] text-[#a9b0b8] italic">
          has been read, answered and marked
        </p>
        <div className="mx-auto my-4 h-px w-full bg-gold/15" />
        <dl className="flex items-center justify-center gap-5 font-data text-[0.62rem] tracking-[0.12em] text-[#a9b0b8] uppercase">
          <div>
            <dt className="sr-only">Experience earned</dt>
            <dd className="text-gold">+{xp} XP</dd>
          </div>
          {score && (
            <div>
              <dt className="sr-only">Score</dt>
              <dd>{score}</dd>
            </div>
          )}
          <div>
            <dt className="sr-only">Date</dt>
            <dd>{date}</dd>
          </div>
        </dl>
      </div>
    </figure>
  );
}
