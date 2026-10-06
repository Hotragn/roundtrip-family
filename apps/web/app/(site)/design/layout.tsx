import { notFound } from "next/navigation";

/**
 * The style guide is a tool for building Roundtrip, not part of the product: it opens in
 * `pnpm dev`, or in a production build with STYLE_GUIDE=1 (for screenshots), and is a 404 on the
 * hosted site.
 */
export default function StyleGuideLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production" && process.env.STYLE_GUIDE !== "1") notFound();
  return children;
}
