import { Link, useNavigate } from "react-router-dom";
import { setSession, type Profile } from "../lib/api";
import { TRACK_LABEL } from "../lib/tracks";

/** XP thresholds are cosmetic ranks. The track decides what you actually see. */
const RANKS = [0, 200, 500, 1000, 2000];

export function XpBar({ xp }: { xp: number }) {
  const next = RANKS.find((r) => r > xp) ?? RANKS[RANKS.length - 1];
  const prev = [...RANKS].reverse().find((r) => r <= xp) ?? 0;
  const pct =
    next === prev ? 100 : Math.round(((xp - prev) / (next - prev)) * 100);

  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between font-data text-[0.62rem] tracking-[0.16em] text-muted uppercase">
        <span className="text-mint">{xp} XP</span>
        <span>{next > xp ? `${next - xp} to next` : "Top rank"}</span>
      </div>
      <div
        className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-valuenow={xp}
        aria-valuemin={prev}
        aria-valuemax={next}
        aria-label="Experience"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-mint to-violet transition-[width] duration-700 ease-out"
          style={{ width: `${Math.min(Math.max(pct, 3), 100)}%` }}
        />
      </div>
    </div>
  );
}

export function Header({ profile }: { profile?: Profile | null }) {
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-20 border-b border-rule-soft bg-ground/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center gap-5 px-5 py-3.5">
        <Link to="/" className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-gradient-to-br from-mint to-violet font-data text-[0.7rem] font-semibold text-white">
            e
          </span>
          <span className="font-display text-lg font-extrabold tracking-tight text-text">
            efinance
          </span>
        </Link>
        {profile && (
          <>
            <span className="hidden rounded-full border border-rule px-2.5 py-0.5 font-data text-[0.58rem] tracking-[0.16em] text-muted uppercase sm:inline">
              {profile.track ? TRACK_LABEL[profile.track] : "Unplaced"}
            </span>
            <div className="ml-auto hidden w-48 sm:block">
              <XpBar xp={profile.xp} />
            </div>
            <button
              onClick={() => {
                setSession(null);
                navigate("/");
              }}
              className="font-data text-[0.62rem] tracking-[0.16em] text-muted uppercase transition hover:text-text"
            >
              Sign out
            </button>
          </>
        )}
      </div>
    </header>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-data text-[0.62rem] tracking-[0.26em] text-mint uppercase">
      {children}
    </p>
  );
}

export function Button({
  children,
  variant = "solid",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "solid" | "quiet";
}) {
  const base =
    "inline-flex items-center justify-center rounded-lg px-5 py-2.5 font-data text-[0.7rem] uppercase tracking-[0.14em] transition disabled:cursor-not-allowed disabled:opacity-40";
  const style =
    variant === "solid"
      ? "bg-mint text-white font-semibold hover:bg-[#15509d] active:translate-y-px shadow-[0_6px_18px_-8px_var(--color-mint)]"
      : "border border-rule bg-surface text-text hover:border-mint hover:text-mint";
  return (
    <button className={`${base} ${style}`} {...rest}>
      {children}
    </button>
  );
}
