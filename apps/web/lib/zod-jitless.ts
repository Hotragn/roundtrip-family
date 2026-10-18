import { z } from "zod";

/**
 * Zod checks whether it may compile parsers with `new Function`. The script policy forbids
 * eval, so that check shows up as a policy violation even though Zod catches it. Imported
 * first by the client forms, so Zod never makes the check (their parsing is just as correct).
 */
z.config({ jitless: true });
