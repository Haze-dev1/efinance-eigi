import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type ModulesResponse, type Profile } from "../lib/api";
import { Eyebrow, Header, XpBar } from "../components/Chrome";
import { Reveal } from "../components/motion";
import { Tombstone } from "../components/Tombstone";
import { TRACK_LABEL } from "../lib/tracks";

export default function Dashboard({ profile }: { profile: Profile }) {
  const [data, setData] = useState<ModulesResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    api<ModulesResponse>("/modules")
      .then((d) => live && setData(d))
      .catch(
        () =>
          live &&
          setError("Could not load your modules. Refresh to try again."),
      );
    return () => {
      live = false;
    };
  }, []);

  const modules = data?.modules ?? [];
  const done = modules.filter((m) => m.completed);
  // The first unfinished chapter, in curriculum order — the one place to resume.
  const next = modules.find((m) => !m.completed);

  return (
    <>
      <Header profile={profile} />
      <main className="mx-auto max-w-4xl px-5 py-12">
        <div className="grid gap-6 sm:grid-cols-[1fr_16rem] sm:items-end">
          <div>
            <Eyebrow>
              {profile.track ? TRACK_LABEL[profile.track] : "Unplaced"}
            </Eyebrow>
            <h1 className="mt-3 font-display text-[2.3rem] leading-tight font-extrabold text-text">
              {next ? "Where you left off" : "You are current."}
            </h1>
            <p className="mt-2 font-body text-[0.97rem] text-muted">
              {done.length} of {modules.length} chapters complete
            </p>
          </div>
          <div className="sm:pb-2">
            <XpBar xp={profile.xp} />
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="mt-8 rounded-lg border border-rose/35 bg-rose-dim px-4 py-3 font-body"
          >
            {error}
          </p>
        )}

        {next && (
          <Reveal className="mt-10">
            <Link
              to={`/learn/${next.slug}`}
              className="card card-hover group block p-6"
            >
              <Eyebrow>Continue</Eyebrow>
              <h2 className="mt-3 font-display text-[1.4rem] font-bold text-text transition-colors group-hover:text-mint">
                {next.title}
              </h2>
              <p className="mt-2 font-body text-[0.98rem] leading-relaxed text-muted">
                {next.summary}
              </p>
              <p className="mt-3 font-data text-[0.6rem] tracking-[0.16em] text-muted uppercase">
                {next.minutes} min · {next.xp} XP
              </p>
            </Link>
          </Reveal>
        )}

        <section className="mt-14">
          <Eyebrow>The curriculum</Eyebrow>
          <div className="mt-6 grid gap-10">
            {(data?.topics ?? []).map((topic) => {
              const chapters = modules
                .filter((m) => m.topic === topic.id)
                .sort((a, b) => a.chapter - b.chapter);
              // A topic entirely above the user's track has nothing to show yet.
              if (chapters.length === 0) return null;
              const finished = chapters.filter((c) => c.completed).length;

              return (
                <div key={topic.id}>
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-rule-soft pb-3">
                    <span className="font-data text-[0.68rem] text-violet tabular-nums">
                      {String(topic.order).padStart(2, "0")}
                    </span>
                    <h2 className="font-display text-[1.25rem] font-bold text-text">
                      {topic.title}
                    </h2>
                    <span className="ml-auto font-data text-[0.6rem] tracking-[0.14em] text-muted uppercase tabular-nums">
                      {finished}/{chapters.length}
                    </span>
                  </div>
                  <p className="mt-2.5 max-w-2xl font-body text-[0.95rem] text-muted">
                    {topic.blurb}
                  </p>

                  <ul className="mt-4 grid gap-2">
                    {chapters.map((m) => (
                      <li key={m.slug}>
                        <Link
                          to={`/learn/${m.slug}`}
                          className="group flex items-baseline gap-3 rounded-lg border border-rule-soft bg-surface/50 px-4 py-3 transition hover:border-violet hover:bg-surface-2"
                        >
                          <span
                            className={`font-data text-[0.68rem] tabular-nums ${
                              m.completed ? "text-mint" : "text-muted"
                            }`}
                          >
                            {m.completed
                              ? "✓"
                              : String(m.chapter).padStart(2, "0")}
                          </span>
                          <span className="flex-1 font-body text-[0.99rem] text-text transition-colors group-hover:text-mint">
                            {m.title}
                          </span>
                          <span className="font-data text-[0.58rem] tracking-[0.14em] text-muted uppercase">
                            {m.minutes} min
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-16">
          <Eyebrow>Your tombstones</Eyebrow>
          {done.length === 0 ? (
            <p className="mt-4 max-w-md font-body text-[1rem] leading-relaxed text-muted">
              Empty for now. Finish a chapter and the first one is printed here
              — title, score, and the date you earned it.
            </p>
          ) : (
            <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {done.map((m) => (
                <Tombstone
                  key={m.slug}
                  title={m.title}
                  xp={m.xp}
                  date={TODAY}
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}

const TODAY = new Date()
  .toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
  .toUpperCase();
