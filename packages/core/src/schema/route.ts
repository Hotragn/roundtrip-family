import { z } from "zod";
import { LatLng, TravelMode } from "./common";
import { Photo } from "./place";

export const Stop = z.object({ name: z.string(), location: LatLng.optional() });
export type Stop = z.infer<typeof Stop>;

export const Leg = z.object({
  mode: TravelMode,
  from: Stop,
  to: Stop,
  durationMinutes: z.number().min(0),
  /** For transit legs, e.g. { name: "210", agency: "AC Transit", headsign: "Union Landing" }. */
  line: z
    .object({
      name: z.string(),
      agency: z.string().optional(),
      headsign: z.string().optional(),
      color: z.string().optional(),
    })
    .optional(),
  /** Stops ridden on this leg, counting the stop where they get off. */
  numStops: z.number().int().min(0).optional(),
  departureTime: z.string().optional(),
  arrivalTime: z.string().optional(),
  /** Every stop passed on the way, in order, not counting where they get on or off. */
  stopsBetween: z.array(Stop).optional(),
  /** The stop just before theirs, so the ticket can say when to press stop. */
  stopBefore: Stop.optional(),
  /** Something big and visible near the stop before theirs, e.g. "the big Safeway". */
  landmarkBeforeStop: z.object({ name: z.string(), description: z.string(), photo: Photo.optional() }).optional(),
  /** Plain step-by-step instructions in English, kept for the driver card and fallbacks. */
  instructions: z.array(z.string()),
  /** Coordinates for drawing the leg on a map. */
  path: z.array(LatLng).optional(),
});
export type Leg = z.infer<typeof Leg>;

export const Route = z.object({
  legs: z.array(Leg).min(1),
  totalMinutes: z.number().min(0),
  transfers: z.number().int().min(0),
  walkingMinutes: z.number().min(0),
  /** Where the route came from: live transit directions, walking directions, or plain steps. */
  source: z.enum(["transit_directions", "walking_directions", "plain_steps", "synthetic"]),
  /** The route starts at the household's nearest stop, never the home address. */
  startsAt: Stop,
});
export type Route = z.infer<typeof Route>;
