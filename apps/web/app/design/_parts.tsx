import type { ReactNode } from "react";
import { contrast } from "@/lib/contrast";

export function Section({
  id,
  title,
  intro,
  children,
}: {
  id: string;
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-24">
      <h2 id={`${id}-h`} className="text-2xl font-semibold">
        {title}
      </h2>
      {intro ? <p className="mt-2 max-w-[64ch] text-base text-text-muted">{intro}</p> : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}

export function Swatch({
  name,
  hex,
  role,
  against = "#FFFFFF",
}: {
  name: string;
  hex: string;
  role: string;
  against?: string;
}) {
  const ratio = contrast(hex, against);
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface">
      <div className="h-20" style={{ background: hex }} />
      <div className="space-y-0.5 px-3 py-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <code className="text-sm font-semibold text-text">{name}</code>
          <span className="text-xs tabular-nums text-text-muted">{ratio.toFixed(1)}:1</span>
        </div>
        <div className="font-mono text-xs uppercase text-text-muted">{hex}</div>
        <div className="text-xs text-text-muted">{role}</div>
      </div>
    </div>
  );
}

export function Spec({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-baseline gap-4 border-t border-line py-3 first:border-t-0">
      <div className="text-sm font-medium text-text-muted">{label}</div>
      <div>{children}</div>
    </div>
  );
}
