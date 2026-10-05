import type { TravelMode } from "@roundtrip/core";

/**
 * Travel lines: thin, precise map glyphs, one style per way of traveling (docs/brand.md).
 * Sky is a fine dotted arc, rail a line with subtle ties, sea a gentle wave, bus a solid line
 * with stop markers on a thin ink casing, walking a fine dotted line. Lines are 2 to 3 px.
 */

const H = 18;
const MID = H / 2;

function wave(x0: number, x1: number, y: number, amp = 2.6, length = 14): string {
  let d = `M${x0} ${y}`;
  for (let x = x0; x < x1; x += length) {
    const half = Math.min(length / 2, (x1 - x) / 2);
    d += `q${half / 2} ${-amp} ${half} 0q${half / 2} ${amp} ${half} 0`;
  }
  return d;
}

export function LegGlyph({ mode, x0, x1, stops = 0 }: { mode: TravelMode; x0: number; x1: number; stops?: number }) {
  const len = Math.max(0, x1 - x0);
  switch (mode) {
    case "walk":
      return (
        <line
          x1={x0 + 1.5}
          x2={x1 - 1.5}
          y1={MID}
          y2={MID}
          stroke="var(--text-muted)"
          strokeWidth={2.25}
          strokeLinecap="round"
          strokeDasharray="0 5.5"
        />
      );
    case "bus": {
      const n = Math.max(2, stops + 1);
      const dots = Array.from({ length: n }, (_, i) => x0 + 3.5 + ((len - 7) * i) / (n - 1));
      return (
        <g>
          <line x1={x0 + 2} x2={x1 - 2} y1={MID} y2={MID} stroke="var(--ink)" strokeWidth={5} strokeLinecap="round" />
          <line x1={x0 + 2} x2={x1 - 2} y1={MID} y2={MID} stroke="var(--bus)" strokeWidth={3} strokeLinecap="round" />
          {dots.map((x, i) => (
            <circle key={i} cx={x} cy={MID} r={3.1} fill="var(--surface)" stroke="var(--ink)" strokeWidth={1.6} />
          ))}
        </g>
      );
    }
    case "rail": {
      const ties = Array.from({ length: Math.max(0, Math.floor((len - 8) / 8)) }, (_, i) => x0 + 6 + i * 8);
      return (
        <g stroke="var(--rail-line)">
          {ties.map((x) => (
            <line key={x} x1={x} x2={x} y1={MID - 3.6} y2={MID + 3.6} strokeWidth={1.4} opacity={0.65} />
          ))}
          <line x1={x0 + 1.5} x2={x1 - 1.5} y1={MID} y2={MID} strokeWidth={2.5} strokeLinecap="round" />
        </g>
      );
    }
    case "sea":
      return (
        <path
          d={wave(x0 + 1.5, x1 - 1.5, MID)}
          fill="none"
          stroke="var(--sea-line)"
          strokeWidth={2.4}
          strokeLinecap="round"
        />
      );
    case "sky":
      return (
        <path
          d={`M${x0 + 2} ${H - 3}Q${(x0 + x1) / 2} ${-H * 0.55} ${x1 - 2} ${H - 3}`}
          fill="none"
          stroke="var(--sky-line)"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeDasharray="0 6"
        />
      );
    case "car":
      return (
        <line
          x1={x0 + 1.5}
          x2={x1 - 1.5}
          y1={MID}
          y2={MID}
          stroke="var(--n-400)"
          strokeWidth={2.5}
          strokeLinecap="round"
        />
      );
  }
}

const LABEL: Record<TravelMode, string> = {
  sky: "flight",
  rail: "train",
  sea: "ferry",
  bus: "bus",
  walk: "walk",
  car: "car",
};

/** A single mode's line, e.g. for the legend on /design. */
export function TravelLine({ mode, width = 160, stops = 3 }: { mode: TravelMode; width?: number; stops?: number }) {
  return (
    <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="img" aria-label={`${LABEL[mode]} line`}>
      <LegGlyph mode={mode} x0={0} x1={width} stops={stops} />
    </svg>
  );
}

export interface LegSummary {
  mode: TravelMode;
  minutes: number;
  stops?: number;
}

/**
 * A trip's legs across the top of a ticket, each in proportion to its minutes, with a small
 * node where one leg hands over to the next.
 */
export function TravelLines({ legs, width = 320, label }: { legs: LegSummary[]; width?: number; label: string }) {
  const total = legs.reduce((s, l) => s + Math.max(l.minutes, 3), 0) || 1;
  const gap = 6;
  const usable = width - gap * (legs.length - 1);
  let x = 0;
  const parts = legs.map((leg) => {
    const w = (usable * Math.max(leg.minutes, 3)) / total;
    const seg = { leg, x0: x, x1: x + w };
    x += w + gap;
    return seg;
  });
  return (
    <svg
      width={width}
      height={H}
      viewBox={`0 0 ${width} ${H}`}
      style={{ maxWidth: "100%", height: "auto" }}
      role="img"
      aria-label={label}
    >
      {parts.map((p, i) => (
        <LegGlyph key={i} mode={p.leg.mode} x0={p.x0} x1={p.x1} stops={p.leg.stops ?? 0} />
      ))}
      {parts.slice(1).map((p, i) => (
        <circle key={`n${i}`} cx={p.x0 - gap / 2} cy={MID} r={2.2} fill="var(--text)" />
      ))}
    </svg>
  );
}
