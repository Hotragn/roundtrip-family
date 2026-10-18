/** Long-form plain text: the privacy policy and terms. */
export function Prose({ children }: { children: React.ReactNode }) {
  return (
    <article className="max-w-[70ch] space-y-4 text-base leading-relaxed [&_h1]:text-[31px] [&_h1]:font-semibold [&_h1]:leading-tight [&_h2]:pt-4 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-2">
      {children}
    </article>
  );
}

export function NotLegalAdvice() {
  return (
    <p className="rounded-lg border border-line-strong bg-surface p-4 font-semibold">
      Roundtrip is a personal project, not a company. This page is written in plain language by the person who built it.
      It is not legal advice and no lawyer has reviewed it.
    </p>
  );
}
