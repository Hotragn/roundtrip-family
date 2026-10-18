import { phoneLink } from "@/lib/server/accounts";
import { PHONE_COOKIE } from "@/lib/server/session";

/**
 * A parent's phone link: an unguessable address the adult child sends them, so parents never
 * sign in. Opening it remembers the link on this phone (an httpOnly cookie for /parents only)
 * and opens their app. An unknown or replaced link is a 404.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await phoneLink(token);
  if (!link) return new Response("This link doesn't open a phone. Ask your family for a new one.", { status: 404 });
  const to = new URL(`/parents/${link.household}/${link.parentId}`, req.url);
  const res = new Response(null, { status: 303, headers: { Location: to.pathname } });
  res.headers.append(
    "Set-Cookie",
    `${PHONE_COOKIE}=${token}; Path=/parents; Max-Age=${400 * 86_400}; HttpOnly; Secure; SameSite=Lax`,
  );
  return res;
}
