import { z } from "zod";
import { LanguageCode, Provenance } from "./common";

/** The people memory. Stays on the family's side; never sent to external services. */
export const Person = z.object({
  _id: z.string(),
  householdId: z.string(),
  provenance: Provenance,
  /** First name or the way the parents refer to them, e.g. "Mrs. Chen". */
  label: z.string(),
  relation: z.string(),
  whereMet: z.string(),
  language: LanguageCode,
  /** Words the parents and this person already share. */
  sharedWords: z.array(z.string()).default([]),
  /** Only notes the parents chose to share. */
  notes: z.string().optional(),
  metAtOutingIds: z.array(z.string()).default([]),
  knownParentIds: z.array(z.string()),
});
export type Person = z.infer<typeof Person>;
