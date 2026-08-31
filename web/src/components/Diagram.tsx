/**
 * Schematic diagrams referenced from module prose by id. These are drawn rather
 * than plotted: the point is the direction money moves, and there is no data to
 * be honest or dishonest about.
 */
export function Diagram({ id }: { id: string }) {
  if (id === "primary-vs-secondary") return <PrimaryVsSecondary />;
  return null;
}

function PrimaryVsSecondary() {
  return (
    <figure className="my-8 overflow-x-auto">
      <svg
        viewBox="0 0 560 260"
        className="w-full min-w-[460px]"
        role="img"
        aria-label="In the primary market, money flows from investors to the company. In the secondary market, money flows between investors and the company receives nothing."
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-mint)" />
          </marker>
          <marker
            id="arrow-dim"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-muted)" />
          </marker>
        </defs>

        <text
          x="0"
          y="14"
          fill="var(--color-mint)"
          fontFamily="var(--font-data)"
          fontSize="10"
          letterSpacing="2.4"
        >
          PRIMARY
        </text>
        <rect
          x="0"
          y="26"
          width="150"
          height="52"
          fill="none"
          stroke="var(--color-rule)"
        />
        <text
          x="75"
          y="57"
          textAnchor="middle"
          fontFamily="var(--font-body)"
          fontSize="14"
          fill="var(--color-text)"
        >
          Investors
        </text>
        <line
          x1="158"
          y1="52"
          x2="392"
          y2="52"
          stroke="var(--color-mint)"
          strokeWidth="2"
          markerEnd="url(#arrow)"
        />
        <text
          x="275"
          y="42"
          textAnchor="middle"
          fontFamily="var(--font-data)"
          fontSize="10"
          fill="var(--color-mint)"
        >
          MONEY
        </text>
        <rect
          x="400"
          y="26"
          width="160"
          height="52"
          fill="var(--color-mint-dim)"
          stroke="var(--color-mint)"
        />
        <text
          x="480"
          y="57"
          textAnchor="middle"
          fontFamily="var(--font-body)"
          fontSize="14"
          fill="var(--color-text)"
        >
          The company
        </text>
        <text
          x="0"
          y="98"
          fontFamily="var(--font-body)"
          fontSize="12.5"
          fill="var(--color-muted)"
          fontStyle="italic"
        >
          New shares are created. The company is funded.
        </text>

        <line x1="0" y1="126" x2="560" y2="126" stroke="var(--color-rule)" />

        <text
          x="0"
          y="158"
          fill="var(--color-muted)"
          fontFamily="var(--font-data)"
          fontSize="10"
          letterSpacing="2.4"
        >
          SECONDARY
        </text>
        <rect
          x="0"
          y="170"
          width="150"
          height="52"
          fill="none"
          stroke="var(--color-rule)"
        />
        <text
          x="75"
          y="201"
          textAnchor="middle"
          fontFamily="var(--font-body)"
          fontSize="14"
          fill="var(--color-text)"
        >
          Investor A
        </text>
        <line
          x1="158"
          y1="196"
          x2="242"
          y2="196"
          stroke="var(--color-muted)"
          strokeWidth="2"
          markerEnd="url(#arrow-dim)"
        />
        <rect
          x="250"
          y="170"
          width="150"
          height="52"
          fill="none"
          stroke="var(--color-rule)"
        />
        <text
          x="325"
          y="201"
          textAnchor="middle"
          fontFamily="var(--font-body)"
          fontSize="14"
          fill="var(--color-text)"
        >
          Investor B
        </text>
        <rect
          x="410"
          y="170"
          width="150"
          height="52"
          fill="none"
          stroke="var(--color-rule)"
          strokeDasharray="4 4"
        />
        <text
          x="485"
          y="195"
          textAnchor="middle"
          fontFamily="var(--font-body)"
          fontSize="13"
          fill="var(--color-muted)"
        >
          The company
        </text>
        <text
          x="485"
          y="212"
          textAnchor="middle"
          fontFamily="var(--font-data)"
          fontSize="9.5"
          fill="var(--color-rose)"
          letterSpacing="1.4"
        >
          RECEIVES NOTHING
        </text>
        <text
          x="0"
          y="244"
          fontFamily="var(--font-body)"
          fontSize="12.5"
          fill="var(--color-muted)"
          fontStyle="italic"
        >
          Existing shares change hands. The company is not a party.
        </text>
      </svg>
      <figcaption className="mt-2 font-data text-[0.6rem] uppercase tracking-[0.18em] text-muted">
        Schematic — direction of funds, not to scale
      </figcaption>
    </figure>
  );
}
