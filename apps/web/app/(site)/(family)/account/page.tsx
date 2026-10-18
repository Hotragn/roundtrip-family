import type { Metadata } from "next";
import Link from "next/link";
import { PasskeyButtons, SignOutButton } from "@/components/account/passkey";
import { Panel } from "@/components/shell/panel";
import { currentAccount, householdOf } from "@/lib/server/accounts";

export const metadata: Metadata = { title: "Your family's sign-in" };
export const dynamic = "force-dynamic";

/** Sign-up and sign-in for the adult child, with a passkey. Parents never sign in. */
export default async function Account() {
  const account = await currentAccount();
  const household = account ? await householdOf(account) : null;
  return (
    <div className="max-w-[720px] space-y-6">
      <h1 className="text-[31px] font-semibold leading-tight">Your family's sign-in</h1>
      {account ? (
        <Panel className="space-y-4 p-6">
          <p className="text-base">You're signed in.</p>
          {household ? (
            <Link href={`/plan/${household._id}`} className="font-semibold text-sky-text underline underline-offset-4">
              Open your household
            </Link>
          ) : (
            <Link href="/account/setup" className="font-semibold text-sky-text underline underline-offset-4">
              Set up your household
            </Link>
          )}
          <div>
            <SignOutButton />
          </div>
        </Panel>
      ) : (
        <Panel className="space-y-4 p-6">
          <p className="text-base">
            Roundtrip signs you in with a passkey: your phone or computer's fingerprint, face or screen lock. There's no
            password to remember and we never ask for your email. Your parents don't sign in at all; each gets their own
            private link.
          </p>
          <p className="text-base text-text-muted">
            This is a personal project. Read the{" "}
            <Link href="/privacy-policy" className="underline underline-offset-4">
              privacy policy
            </Link>{" "}
            before you add your family.
          </p>
          <PasskeyButtons />
        </Panel>
      )}
    </div>
  );
}
