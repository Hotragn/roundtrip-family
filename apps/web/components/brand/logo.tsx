/**
 * The refined family loop, drawn from the same geometry as scripts/brand/build-logo.ts:
 * one circle (center 32,35, radius 18.5), the parent head at -25° and the child head at +22°,
 * masked gaps around the heads and the home dot.
 */
const C = { x: 32, y: 35, r: 18.5 };
const point = (deg: number) => {
  const a = (deg * Math.PI) / 180;
  return { x: +(C.x + C.r * Math.sin(a)).toFixed(2), y: +(C.y - C.r * Math.cos(a)).toFixed(2) };
};
const HOME = point(180);
const PARENT = point(-25);
const CHILD = point(22);

export function Mark({
  size = 32,
  tone = "auto",
  title = "Roundtrip",
  className,
}: {
  size?: number;
  /** "auto" follows the color scheme through --logo-parent. */
  tone?: "auto" | "light" | "dark";
  title?: string | null;
  className?: string;
}) {
  const parent = tone === "dark" ? "#FBFCFE" : tone === "light" ? "#1F2A44" : "var(--logo-parent)";
  const id = `rt-mask-${tone}`;
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      role={title ? "img" : undefined}
      aria-label={title ?? undefined}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
          <rect width="64" height="64" fill="#fff" />
          <circle cx={PARENT.x} cy={PARENT.y} r={9} fill="#000" />
          <circle cx={CHILD.x} cy={CHILD.y} r={7.2} fill="#000" />
          <circle cx={HOME.x} cy={HOME.y} r={8} fill="#000" />
        </mask>
      </defs>
      <g mask={`url(#${id})`} fill="none" strokeLinecap="round">
        <path d={`M${HOME.x} ${HOME.y}A18.5 18.5 0 0 1 ${PARENT.x} ${PARENT.y}`} stroke={parent} strokeWidth={6} />
        <path d={`M${HOME.x} ${HOME.y}A18.5 18.5 0 0 0 ${CHILD.x} ${CHILD.y}`} stroke="#3E9BE0" strokeWidth={6.2} />
      </g>
      <circle cx={PARENT.x} cy={PARENT.y} r={7.2} fill={parent} />
      <circle cx={CHILD.x} cy={CHILD.y} r={5.4} fill="#3E9BE0" />
      <circle cx={HOME.x} cy={HOME.y} r={6.2} fill="#F2A900" />
    </svg>
  );
}

/** The lockup, as the generated SVG files. Swaps to the dark file in the dark color scheme. */
export function Logo({ height = 32, className }: { height?: number; className?: string }) {
  // The lockup viewBox is 269.85 x 64 units.
  const width = Math.round((height * 269.85) / 64);
  return (
    <picture className={className}>
      <source srcSet="/brand/roundtrip-logo-dark.svg" media="(prefers-color-scheme: dark)" />
      <img src="/brand/roundtrip-logo.svg" alt="Roundtrip" width={width} height={height} />
    </picture>
  );
}
