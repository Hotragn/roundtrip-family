"""Plain-language reason chips from a feature and its value. Words a family would use."""

from __future__ import annotations

from typing import Any


def reason_label(feature: str, value: Any, helps: bool) -> str | None:
    if feature == "timing":
        return "A time that has worked before" if helps else "Weekday outings rated lower so far"
    if value is None:
        return None
    if feature == "languageMatch":
        if value == 2:
            return "Speaks their language" if helps else "Their language, but not their kind of outing"
        if value == 1:
            return "Shared culture" if helps else "Other Indian languages, not theirs"
        return "No language needed" if helps else "Not in their language"
    if feature == "travelMinutes":
        if value <= 15:
            return "Close to home" if helps else "Short errands rated lower so far"
        if value <= 30:
            return "Under 30 minutes" if helps else "A longer ride"
        return "Worth the ride" if helps else "Long trip"
    if feature == "transfers":
        return "One bus, no transfers" if value == 0 and helps else ("No transfers" if helps else "Needs a transfer")
    if feature == "walkingMinutes":
        return "Little walking" if helps else "A lot of walking"
    if feature == "startHour":
        if value < 12:
            return "Morning, before the nap" if helps else "Too early"
        if value < 15:
            return "Midday" if helps else "Runs into nap time"
        return "Evening" if helps else "Late in the day"
    if feature == "dayOfWeek":
        return "A day that has worked before" if helps else "Weekday outings rated lower so far"
    if feature in ("temperatureC", "weather"):
        return "Good weather for it" if helps else "Weather counts against it"
    if feature == "rainChance":
        return "Dry forecast" if helps else "Rain likely"
    if feature == "indoor":
        return ("Indoors" if value else "Outdoors, open air") if helps else ("Indoors all day" if value else "Exposed to weather")
    if feature == "groupSize":
        if value in ("large",):
            return "Lively, lots of people" if helps else "Big and busy"
        return "Small and calm" if helps else "Quiet, few people"
    if feature == "costUsd":
        return "Free" if value == 0 and helps else ("Low cost" if helps else "Costs money")
    if feature == "knowsSomeone":
        return "Knows someone there" if value and helps else (None if helps else "No familiar faces yet")
    if feature == "foodAvailable":
        return "Food there" if value and helps else None
    if feature == "withAdultChild":
        return "With you" if value and helps else (None if helps else "Without you, outings rated lower so far")
    if feature == "languageNeeded":
        return "No English needed" if not value and helps else ("English needed" if value and not helps else None)
    if feature == "category":
        return f"Like the {str(value).replace('_', ' ')} outings they enjoyed" if helps else f"They rated {str(value).replace('_', ' ')} outings low"
    if feature == "daysSinceLastOuting":
        return "A while since the last outing" if helps else None
    return None
