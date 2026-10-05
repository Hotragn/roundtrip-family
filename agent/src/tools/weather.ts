import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { LatLng } from "@roundtrip/core";
import { outboundFetch } from "@roundtrip/core/privacy";
import { repoRoot } from "@roundtrip/core/server-env";
import { hashKey } from "../gemma/store";

/**
 * Daily forecast from Open-Meteo (free, no key): https://open-meteo.com/en/docs
 * Sends only the household's rounded area center. Responses are saved as fixtures.
 * Heat advisory, ice and heavy snow are approximated from the forecast: a daily maximum at or
 * above 38°C, freezing rain or a minimum below -2°C with precipitation, and 10 cm of snow.
 */

export interface DayForecast {
  date: string;
  label: "very_hot" | "hot" | "pleasant" | "cool" | "cold" | "rainy";
  tempC: number;
  maxC: number;
  minC: number;
  rainChance: number;
  heatAdvisory: boolean;
  ice: boolean;
  heavySnow: boolean;
}

export function labelFor(maxC: number, rainChance: number): DayForecast["label"] {
  if (rainChance >= 0.6) return "rainy";
  if (maxC >= 35) return "very_hot";
  if (maxC >= 29) return "hot";
  if (maxC >= 17) return "pleasant";
  if (maxC >= 9) return "cool";
  return "cold";
}

export async function forecast(
  center: LatLng,
  startDate: string,
  endDate: string,
  timezone: string,
  mode: "live" | "replay" = process.env.CI ? "replay" : "live",
): Promise<DayForecast[]> {
  const lat = Math.round(center.lat * 1000) / 1000;
  const lng = Math.round(center.lng * 1000) / 1000;
  const key = hashKey({ openMeteo: 1, lat, lng, startDate, endDate, timezone });
  const file = join(repoRoot(), "agent/fixtures/weather", `${key}.json`);
  let data: {
    daily: {
      time: string[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      precipitation_probability_max: number[];
      snowfall_sum: number[];
      weather_code: number[];
    };
  };
  try {
    data = JSON.parse(await readFile(file, "utf8")).response;
  } catch {
    if (mode === "replay") throw new Error(`No recorded forecast ${key.slice(0, 12)}.`);
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,snowfall_sum,weather_code" +
      `&timezone=${encodeURIComponent(timezone)}&start_date=${startDate}&end_date=${endDate}`;
    const res = await outboundFetch("open-meteo", "public", url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
    data = (await res.json()) as typeof data;
    await mkdir(join(repoRoot(), "agent/fixtures/weather"), { recursive: true });
    await writeFile(
      file,
      `${JSON.stringify({ provenance: "live_search", lat, lng, fetchedAt: new Date().toISOString(), response: data }, null, 1)}\n`,
    );
  }
  const d = data.daily;
  return d.time.map((date, i) => {
    const maxC = d.temperature_2m_max[i] ?? 20;
    const minC = d.temperature_2m_min[i] ?? 12;
    const rainChance = (d.precipitation_probability_max[i] ?? 0) / 100;
    const code = d.weather_code[i] ?? 0;
    return {
      date,
      label: labelFor(maxC, rainChance),
      tempC: Math.round((maxC * 2 + minC) / 3),
      maxC,
      minC,
      rainChance,
      heatAdvisory: maxC >= 38,
      ice: [56, 57, 66, 67].includes(code) || (minC < -2 && rainChance > 0.4),
      heavySnow: (d.snowfall_sum[i] ?? 0) >= 10,
    };
  });
}
