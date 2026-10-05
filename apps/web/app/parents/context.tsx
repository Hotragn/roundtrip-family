"use client";

import { createContext, useContext } from "react";
import type { CardView, OutingView, WeekView } from "@/lib/week";

export type View =
  | "today"
  | "directions"
  | "driver"
  | "practice"
  | "how"
  | "lost"
  | "diary"
  | "book"
  | "friend"
  | "join"
  | "start";

export interface ParentsState {
  week: WeekView;
  parentId: string;
  parent: WeekView["parents"][number];
  outings: OutingView[];
  outing: OutingView | null;
  card: CardView | null;
  home: Record<string, boolean>;
  setHome: (outingId: string) => void;
  go: (view: View, outingId?: string) => void;
  online: boolean;
  fromPhone: boolean;
  t: (key: string, values?: Record<string, string | number>) => string;
}

export const ParentsContext = createContext<ParentsState | null>(null);

export function useParents(): ParentsState {
  const ctx = useContext(ParentsContext);
  if (!ctx) throw new Error("useParents must be used inside the parents' app.");
  return ctx;
}
