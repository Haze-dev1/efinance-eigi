import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import {
  EASE,
  Reveal,
  motion,
  useRise,
  useStagger,
} from "../components/motion";
import { api, ApiError, type Profile } from "../lib/api";
import { Button, Eyebrow, Header } from "../components/Chrome";
import { Tombstone } from "../components/Tombstone";

/**
 * The hero is the product, not a description of it: the question that separates
 * people who have read about markets from people who understand them. Getting
 * it wrong is the point, so the wrong answers are the plausible ones.
 */
const OPTIONS = [
  { label: "The full ₹50,000", correct: false },
  { label: "₹50,000 less brokerage", correct: false },
  { label: "Nothing at all", correct: true },
];

function HeroQuestion() {
  const [picked, setPicked] = useState<number | null>(null);
  const revealed = picked !== null;
  const stagger = useStagger(0.08);
  const rise = useRise(12);

  return (
    <motion.div
      className="card p-6 sm:p-7"
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: EASE, delay: 0.18 }}
    >
      <Eyebrow>Try one</Eyebrow>
      <p className="mt-4 font-body text-[1.3rem] leading-snug text-text sm:text-[1.4rem]">
        You buy{" "}
        <span className="font-data text-[0.9em] text-violet">₹50,000</span> of
        Infosys shares on the NSE. How much of that reaches Infosys?
      </p>

      <motion.div
        className="mt-6 grid gap-2.5"
        variants={stagger}
        initial="hidden"
        animate="show"
      >
        {OPTIONS.map((o, i) => {
          const chosen = picked === i;
          const tone = !revealed
            ? "border-rule bg-surface-2/40 hover:border-violet hover:bg-surface-2"
            : o.correct
              ? "border-mint bg-mint-dim text-text"
              : chosen
                ? "border-rose bg-rose-dim text-text"
                : "border-rule-soft text-muted opacity-50";
          return (
            <motion.button
              key={o.label}
              variants={rise}
              whileHover={revealed ? undefined : { x: 5 }}
              whileTap={revealed ? undefined : { scale: 0.99 }}
              onClick={() => !revealed && setPicked(i)}
              disabled={revealed}
              aria-pressed={chosen}
              className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left font-body text-[0.98rem] transition-colors ${tone}`}
            >
              <span>{o.label}</span>
              {revealed && o.correct && (
                <motion.span
                  initial={{ scale: 0, rotate: -25 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 520, damping: 17 }}
                  className="font-data text-sm text-mint"
                >
                  ✓
                </motion.span>
              )}
              {revealed && chosen && !o.correct && (
                <span className="font-data text-sm text-rose">✕</span>
              )}
            </motion.button>
          );
        })}
      </motion.div>

      <AnimatePresence>
        {revealed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            transition={{ duration: 0.45, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="mt-6 rounded-lg border border-mint/30 bg-mint-dim/50 px-5 py-4">
              <p className="font-display text-base font-extrabold text-mint">
                Nothing. Not a rupee.
              </p>
              <p className="mt-2 font-body text-[0.97rem] leading-relaxed text-text">
                That trade happened in the secondary market. Your money went to
                whoever sold you the shares. Infosys was not a party to it and
                received none of it — the company was funded once, at issue,
                years ago.
              </p>
              <p className="mt-3 font-body text-[0.95rem] leading-relaxed text-muted">
                {picked === 2
                  ? "You knew that one. The placement quiz will find where you actually need to start."
                  : "Most people get this wrong, which is exactly why it is the first thing we teach."}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Waitlist() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    try {
      await api("/waitlist", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setState("done");
    } catch (err) {
      setState("error");
      setMessage(
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Try again.",
      );
    }
  }

  if (state === "done") {
    return (
      <p className="font-body text-[0.95rem] text-mint">
        You are on the list. We will write when Pro opens.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap gap-2.5">
      <label className="sr-only" htmlFor="waitlist-email">
        Email address
      </label>
      <input
        id="waitlist-email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="min-w-0 flex-1 rounded-lg border border-rule bg-ground px-4 py-2.5 font-body text-[0.95rem] placeholder:text-muted/60"
      />
      <Button type="submit" disabled={state === "sending"}>
        {state === "sending" ? "Adding…" : "Notify me"}
      </Button>
      {state === "error" && (
        <p role="alert" className="w-full font-body text-[0.9rem] text-rose">
          {message}
        </p>
      )}
    </form>
  );
}

const STEPS = [
  {
    n: "01",
    h: "Get placed",
    p: "Six questions, two minutes. They decide whether you start at the foundations or skip them. Nobody sits through material they already know.",
  },
  {
    n: "02",
    h: "Read a module",
    p: "Eight to twelve minutes each. Written from primary sources — SEBI, the SEC, exchange filings — and every module lists what it was researched from.",
  },
  {
    n: "03",
    h: "Get marked",
    p: "Three multiple choice, one true or false, and one written answer that is actually read and marked against a rubric, not pattern-matched.",
  },
];

export default function Home({ profile }: { profile?: Profile | null }) {
  const heroStagger = useStagger(0.09);
  const heroRise = useRise(20);

  return (
    <>
      <Header profile={profile} />
      <main>
        {/* The numbering below is real: this is a sequence you move through. */}
        <section className="aurora">
          <div className="mx-auto grid max-w-5xl gap-10 px-5 py-16 sm:py-24 lg:grid-cols-[1fr_1.02fr] lg:items-start lg:gap-14">
            <motion.div variants={heroStagger} initial="hidden" animate="show">
              <motion.div variants={heroRise}>
                <Eyebrow>Investment banking, from zero</Eyebrow>
              </motion.div>
              <motion.h1
                variants={heroRise}
                className="mt-5 max-w-[13ch] font-display text-[2.4rem] leading-[1.02] font-extrabold text-text sm:text-[3rem]"
              >
                Most explanations of finance are written to sound{" "}
                <span className="text-violet italic">impressive</span>.
              </motion.h1>
              <motion.p
                variants={heroRise}
                className="mt-6 max-w-lg font-body text-[1.1rem] leading-relaxed text-muted"
              >
                These are written to be understood. Short modules, a placement
                quiz that starts you at the right level, and a marked question
                at the end of every one — because reading something is not the
                same as knowing it.
              </motion.p>
              <motion.div
                variants={heroRise}
                className="mt-8 flex flex-wrap items-center gap-4"
              >
                <Link to="/join">
                  <Button>Start free</Button>
                </Link>
                <Link
                  to="/signin"
                  className="font-data text-[0.7rem] tracking-[0.14em] text-muted uppercase transition hover:text-text"
                >
                  I have an account
                </Link>
              </motion.div>
            </motion.div>
            <HeroQuestion />
          </div>
        </section>

        <section className="mx-auto max-w-5xl border-t border-rule-soft px-5 py-16">
          <Reveal>
            <Eyebrow>How it works</Eyebrow>
          </Reveal>
          <ol className="mt-8 grid gap-6 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <Reveal
                key={s.h}
                delay={i * 0.09}
                className="card card-hover p-5"
              >
                <span className="font-data text-[0.7rem] tracking-[0.2em] text-violet">
                  {s.n}
                </span>
                <h2 className="mt-3 font-display text-lg font-bold text-text">
                  {s.h}
                </h2>
                <p className="mt-2.5 font-body text-[0.96rem] leading-relaxed text-muted">
                  {s.p}
                </p>
              </Reveal>
            ))}
          </ol>
        </section>

        <section className="mx-auto max-w-5xl border-t border-rule-soft px-5 py-16">
          <div className="grid gap-10 lg:grid-cols-[1fr_20rem] lg:items-center lg:gap-16">
            <Reveal>
              <Eyebrow>What you collect</Eyebrow>
              <h2 className="mt-4 font-display text-[1.9rem] leading-tight font-extrabold text-text">
                When a deal closes, banks print a tombstone.
              </h2>
              <p className="mt-4 max-w-lg font-body text-[1.02rem] leading-relaxed text-muted">
                It is the plainest document in finance: who did what, and when.
                No adjectives. It is also, quietly, the industry's trophy
                cabinet — bankers keep them on their desks in lucite for
                decades.
              </p>
              <p className="mt-3 max-w-lg font-body text-[1.02rem] leading-relaxed text-muted">
                Finish a module here and you mint one. It is the only place gold
                appears in this app, so when you see it, you earned it.
              </p>
            </Reveal>
            <Reveal delay={0.12}>
              <Tombstone
                title="Primary and secondary markets"
                xp={100}
                date="14 MAR 2026"
                score="9/9"
              />
            </Reveal>
          </div>
        </section>

        <section className="mx-auto max-w-5xl border-t border-rule-soft px-5 py-16">
          <div className="grid gap-6 sm:grid-cols-2">
            <Reveal className="card p-6">
              <Eyebrow>Free</Eyebrow>
              <p className="mt-3 font-display text-[2.1rem] font-extrabold text-text">
                ₹0
              </p>
              <p className="mt-3 font-body text-[0.96rem] leading-relaxed text-muted">
                Every module published today, the placement quiz, marking on
                every written answer, and your tombstones. This is the whole
                product right now, and it is not a trial.
              </p>
              <div className="mt-6">
                <Link to="/join">
                  <Button>Start free</Button>
                </Link>
              </div>
            </Reveal>
            <Reveal
              delay={0.1}
              className="card border-violet/30 bg-gradient-to-b from-violet-dim/60 to-surface p-6"
            >
              <p className="font-data text-[0.62rem] tracking-[0.26em] text-violet uppercase">
                Pro — not yet open
              </p>
              <p className="mt-3 font-display text-[2.1rem] font-extrabold text-text">
                $10
                <span className="font-data text-sm font-normal text-muted">
                  {" "}
                  /month
                </span>
              </p>
              <p className="mt-3 font-body text-[0.96rem] leading-relaxed text-muted">
                Planned: the full curriculum through valuation, LBO and deal
                structuring, longer marked case studies, and downloadable
                models. We will not take payment until there is enough behind it
                to be worth ten dollars.
              </p>
              <div className="mt-6">
                <Waitlist />
              </div>
            </Reveal>
          </div>
        </section>

        <footer className="mx-auto max-w-5xl border-t border-rule-soft px-5 py-10">
          <p className="max-w-2xl font-body text-[0.9rem] text-muted">
            efinance is educational material, not investment advice. Every
            module is written from scratch and lists the primary sources it was
            researched from — regulators, exchanges, and published filings.
          </p>
        </footer>
      </main>
    </>
  );
}
