"use client";

import { NextIntlClientProvider } from "next-intl";
import te from "@/messages/te.json";

/**
 * Telugu messages for the parents' app, provided on the client so the page stays static and
 * works offline. (next-intl runs without its build plugin here; see docs/decisions.md.)
 */
export function TeluguProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="te" messages={te} timeZone="UTC">
      {children}
    </NextIntlClientProvider>
  );
}
