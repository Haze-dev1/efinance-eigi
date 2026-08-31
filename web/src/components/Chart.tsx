import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ReactNode } from "react";

/**
 * Chart palette.
 *
 * Deliberately NOT the app's --color-mint / --color-violet: those are both blues
 * and fail categorical separation (ΔE 7.7 against a floor of 15 — verified with
 * the dataviz validator, not eyeballed). Gold is reserved for tombstones and rose
 * means "wrong answer", so neither can carry a data series without changing what
 * a reader thinks the colour means.
 *
 * These two pass every check on a white surface (ΔE 22.4 normal vision, 21.5
 * protan) and sit clear of both reserved hues.
 */
const SERIES = ["#1a5fb4", "#1a7a3c"] as const;

const AXIS = {
  stroke: "var(--color-muted)",
  fontSize: 11,
  fontFamily: "var(--font-data)",
};
const GRID = "var(--color-rule-soft)";

function Frame({
  title,
  note,
  children,
  table,
}: {
  title: string;
  note: string;
  children: ReactNode;
  table: ReactNode;
}) {
  return (
    <figure className="my-8">
      <figcaption className="mb-3">
        <p className="font-display text-[1.02rem] font-bold text-text">
          {title}
        </p>
        <p className="mt-1 font-body text-[0.88rem] text-muted">{note}</p>
      </figcaption>
      {children}
      {/* Identity is never colour-alone, and the numbers stay readable without it. */}
      <details className="mt-3">
        <summary className="cursor-pointer font-data text-[0.6rem] tracking-[0.16em] text-muted uppercase">
          Show the numbers
        </summary>
        <div className="mt-2 overflow-x-auto">{table}</div>
      </details>
    </figure>
  );
}

const td =
  "border-b border-rule-soft px-3 py-1.5 text-left font-body text-[0.88rem]";
const th = `${td} font-data text-[0.62rem] uppercase tracking-[0.12em] text-muted`;

// ── Leverage concentrates returns in both directions ────────────────────────
const LEVERAGE = [400, 500, 600, 700, 800, 1000, 1200, 1500, 1800].map(
  (exit) => ({
    exit,
    unlevered: +(exit / 1000).toFixed(2),
    levered: +(Math.max(exit - 400, 0) / 300).toFixed(2),
  }),
);

function LeverageChart() {
  return (
    <Frame
      title="The same business, two capital structures"
      note="Illustrative. Entry enterprise value ₹1,000cr. Unlevered: ₹1,000cr equity. Levered: ₹300cr equity and ₹700cr debt, of which ₹300cr is repaid from cash flow before exit. Equity return is the multiple on money invested."
      table={
        <table className="w-full min-w-[24rem] border-collapse">
          <thead>
            <tr>
              <th className={th}>Exit EV (₹cr)</th>
              <th className={th}>Unlevered</th>
              <th className={th}>Levered</th>
            </tr>
          </thead>
          <tbody>
            {LEVERAGE.map((r) => (
              <tr key={r.exit}>
                <td className={td}>{r.exit}</td>
                <td className={td}>{r.unlevered.toFixed(2)}x</td>
                <td className={td}>{r.levered.toFixed(2)}x</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <div className="h-[300px] w-full">
        <ResponsiveContainer>
          <LineChart
            data={LEVERAGE}
            margin={{ top: 8, right: 16, bottom: 24, left: 4 }}
          >
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              dataKey="exit"
              {...AXIS}
              tickLine={false}
              label={{
                value: "Exit enterprise value (₹ crore)",
                position: "insideBottom",
                offset: -14,
                fill: "var(--color-muted)",
                fontSize: 11,
              }}
            />
            <YAxis
              {...AXIS}
              tickLine={false}
              axisLine={false}
              // Pinned, so the plot is not mostly empty above the data.
              domain={[0, 5]}
              ticks={[0, 1, 2, 3, 4, 5]}
              tickFormatter={(v: number) => `${v}x`}
              width={44}
            />
            {/* 1.0x is the line between making and losing money. */}
            <ReferenceLine
              y={1}
              stroke="var(--color-rule)"
              strokeDasharray="4 4"
            />
            {/* Below this exit value, leverage makes the outcome worse, not better. */}
            <ReferenceLine
              x={600}
              stroke="var(--color-rule)"
              strokeDasharray="4 4"
              // Left-anchored so it cannot collide with the right-aligned legend.
              label={{
                value: "below here, leverage hurts",
                position: "insideTopLeft",
                fill: "var(--color-muted)",
                fontSize: 10,
                offset: 8,
              }}
            />
            <Tooltip
              contentStyle={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-rule)",
                borderRadius: 8,
                fontFamily: "var(--font-data)",
                fontSize: 12,
              }}
              formatter={(v) => `${Number(v).toFixed(2)}x`}
              labelFormatter={(l) => `Exit at ₹${String(l)}cr`}
            />
            <Legend
              verticalAlign="top"
              align="right"
              height={28}
              wrapperStyle={{ fontFamily: "var(--font-data)", fontSize: 11 }}
            />
            <Line
              type="monotone"
              dataKey="unlevered"
              name="No debt"
              stroke={SERIES[0]}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="levered"
              name="70% debt"
              stroke={SERIES[1]}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Frame>
  );
}

// ── Where a DCF's value actually sits ───────────────────────────────────────
const DCF = [
  { g: "0%", forecast: 415, terminal: 755 },
  { g: "1%", forecast: 415, terminal: 847 },
  { g: "2%", forecast: 415, terminal: 962 },
  { g: "3%", forecast: 415, terminal: 1111 },
];

function TerminalValueChart() {
  return (
    <Frame
      title="Where a DCF's value actually sits"
      note="Illustrative. Free cash flow of 100 growing 5% a year for five forecast years, discounted at a 10% WACC, with a perpetuity-growth terminal value. Only the terminal growth rate changes across the bars."
      table={
        <table className="w-full min-w-[26rem] border-collapse">
          <thead>
            <tr>
              <th className={th}>Terminal growth</th>
              <th className={th}>Forecast years</th>
              <th className={th}>Terminal value</th>
              <th className={th}>Terminal share</th>
            </tr>
          </thead>
          <tbody>
            {DCF.map((r) => (
              <tr key={r.g}>
                <td className={td}>{r.g}</td>
                <td className={td}>{r.forecast}</td>
                <td className={td}>{r.terminal}</td>
                <td className={td}>
                  {Math.round((r.terminal / (r.forecast + r.terminal)) * 100)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <div className="h-[300px] w-full">
        <ResponsiveContainer>
          <BarChart
            data={DCF}
            margin={{ top: 8, right: 16, bottom: 24, left: 4 }}
          >
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              dataKey="g"
              {...AXIS}
              tickLine={false}
              label={{
                value: "Terminal growth rate",
                position: "insideBottom",
                offset: -14,
                fill: "var(--color-muted)",
                fontSize: 11,
              }}
            />
            <YAxis {...AXIS} tickLine={false} axisLine={false} width={44} />
            <Tooltip
              cursor={{ fill: "var(--color-surface-2)" }}
              contentStyle={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-rule)",
                borderRadius: 8,
                fontFamily: "var(--font-data)",
                fontSize: 12,
              }}
              labelFormatter={(l) => `Terminal growth ${String(l)}`}
            />
            <Legend
              verticalAlign="top"
              align="right"
              height={28}
              wrapperStyle={{ fontFamily: "var(--font-data)", fontSize: 11 }}
            />
            <Bar
              dataKey="forecast"
              name="Five forecast years"
              stackId="v"
              fill={SERIES[0]}
              // Recharts grows bars from zero height on mount. That animation does
              // not always complete — a reduced-motion preference is enough — which
              // leaves the bars invisible. The chart is static, so skip it.
              isAnimationActive={false}
            />
            {/* 2px surface gap between stacked segments, via a stroke in the surface colour. */}
            <Bar
              dataKey="terminal"
              name="Terminal value"
              stackId="v"
              fill={SERIES[1]}
              stroke="var(--color-surface)"
              strokeWidth={2}
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Frame>
  );
}

export function Chart({ id }: { id: string }) {
  if (id === "leverage-concentrates") return <LeverageChart />;
  if (id === "terminal-value-share") return <TerminalValueChart />;
  return null;
}
