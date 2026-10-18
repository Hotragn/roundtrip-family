import Link from "next/link";
import { Mark } from "@/components/brand/logo";
import { SiteFooter } from "@/components/landing/site-footer";
import { ThemeShell } from "@/components/shell/theme-shell";

/** Sign-in, a family's own setup, and the privacy policy and terms: plain pages on paper. */
export default function FamilyLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeShell theme="home">
      <header className="mx-auto flex max-w-[960px] items-center px-4 py-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2 rounded-md text-base font-semibold">
          <Mark size={28} title={null} />
          Roundtrip
        </Link>
      </header>
      <main id="main" className="mx-auto max-w-[960px] px-4 pb-16 sm:px-8">
        {children}
      </main>
      <SiteFooter />
    </ThemeShell>
  );
}
