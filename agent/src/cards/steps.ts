import type { CardStep, Route } from "@roundtrip/core";

/**
 * Directions in the parent's language from a route. Written from fixed Telugu templates, so
 * the steps are always correct; bus, stop and venue names stay exactly in English. The father's
 * view also lists the English words he'll see on signs.
 */

const STOP_CORD: Record<string, string> = {
  en: "పసుపు రంగు స్టాప్ పట్టీ లేదా బటన్ నొక్కండి",
  de: "Halt అని రాసి ఉన్న బటన్ నొక్కండి",
};

export function stepsFor(route: Route, venue: string, localLanguage: string): CardStep[] {
  const steps: CardStep[] = [];
  route.legs.forEach((leg, i) => {
    const last = i === route.legs.length - 1;
    if (leg.mode === "walk") {
      const target = last ? venue : leg.to.name;
      steps.push({
        mode: "walk",
        text: last
          ? `దిగిన తర్వాత ${venue} దాకా సుమారు ${leg.durationMinutes} నిమిషాలు నడవండి.`
          : `${target} స్టాప్ దాకా సుమారు ${leg.durationMinutes} నిమిషాలు నడవండి.`,
        signWords: [target],
      });
      return;
    }
    const line = leg.line?.name ?? "";
    const kind = leg.mode === "rail" ? "రైలు" : "బస్సు";
    steps.push({
      mode: leg.mode === "rail" ? "rail" : "bus",
      text: `${leg.from.name} దగ్గర ${line} ${kind} ఎక్కండి${leg.line?.headsign ? ` (${leg.line.headsign} వైపు వెళ్ళేది)` : ""}.`,
      signWords: [line, leg.line?.headsign ?? "", leg.from.name].filter(Boolean),
    });
    steps.push({
      mode: "wait",
      stops: leg.numStops,
      text: `${leg.numStops ?? ""} స్టాపులు కూర్చోండి.${leg.stopBefore ? ` ${leg.stopBefore.name} దాటగానే ${STOP_CORD[localLanguage] ?? STOP_CORD.en}.` : ""}`,
      signWords: [leg.stopBefore?.name ?? "", localLanguage === "de" ? "Halt" : "STOP REQUESTED"].filter(Boolean),
    });
    steps.push({
      mode: "arrive",
      text: `${leg.to.name} దగ్గర దిగండి.`,
      signWords: [leg.to.name],
    });
  });
  steps.push({ mode: "arrive", text: `${venue} చేరుకున్నారు.`, signWords: [venue] });
  return steps;
}
