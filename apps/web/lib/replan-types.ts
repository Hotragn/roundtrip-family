/** What "Plan the coming week" sends back to the dashboard (app/plan/api/replan). */
export interface ReplanResult {
  week: { label: string; monday: string };
  forecast: Array<{ day: string; date: string; label: string; maxC: number; rainChance: number }>;
  note: string;
  suggestions: Array<{
    id: string;
    title: string;
    day: string;
    depart: number;
    back: number;
    withAdultChild: boolean;
    who: string;
    ladderLevel: number;
    ladderLabel: string;
    reasonText: string;
    chips: Array<{ label: string; feature?: string; direction: string }>;
    score: number;
  }>;
  stats: {
    seconds: number;
    modelCalls: number;
    cachedModelCalls: number;
    rankerCalls: number;
    candidates: number;
    feasible: number;
    /** What the planner called, in order: tool, milliseconds, a short detail. */
    steps: Array<{ tool: string; ms: number; detail: string }>;
  };
}
