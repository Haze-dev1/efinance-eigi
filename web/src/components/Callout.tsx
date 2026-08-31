import type { ReactNode } from "react";

/** Used inside module prose via MDX. Two registers only: an aside, and a trap. */
export function Callout({
  type = "note",
  title,
  children,
}: {
  type?: "note" | "warning";
  title?: string;
  children: ReactNode;
}) {
  const warning = type === "warning";
  return (
    <aside
      className={`my-7 rounded-xl border px-5 py-4 ${
        warning
          ? "border-rose/35 bg-rose-dim/60"
          : "border-mint/30 bg-mint-dim/50"
      }`}
    >
      {title && (
        <p
          className={`font-data text-[0.6rem] tracking-[0.18em] uppercase ${
            warning ? "text-rose" : "text-mint"
          }`}
        >
          {title}
        </p>
      )}
      <div className="mt-2 font-body text-[0.97rem] leading-relaxed text-text">
        {children}
      </div>
    </aside>
  );
}
