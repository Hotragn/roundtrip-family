"use client";

import { type IDBPDatabase, openDB } from "idb";
import type { WeekView } from "./week";

/**
 * The phone's own store (IndexedDB): the cached week, whose phone this is, check-ins, and an
 * outbox that holds replies and diary entries until the phone is back on home Wi-Fi. Every
 * read and write tolerates a blocked or missing store: the app still renders from the network.
 */

interface Schema {
  kv: { key: string; value: unknown };
  outbox: { key: string; value: OutboxItem };
}

export interface OutboxItem {
  id: string;
  kind: "checkin" | "reply" | "diary";
  createdAt: string;
  payload: Record<string, unknown>;
}

let dbPromise: Promise<IDBPDatabase<Schema>> | null = null;

function db(): Promise<IDBPDatabase<Schema>> | null {
  if (typeof indexedDB === "undefined") return null;
  dbPromise ??= openDB<Schema>("roundtrip-parents", 1, {
    upgrade(d) {
      d.createObjectStore("kv");
      d.createObjectStore("outbox", { keyPath: "id" });
    },
  }).catch((e) => {
    dbPromise = null;
    throw e;
  });
  return dbPromise;
}

export async function getKv<T>(key: string): Promise<T | undefined> {
  try {
    return (await (await db())?.get("kv", key)) as T | undefined;
  } catch {
    return undefined;
  }
}

export async function setKv(key: string, value: unknown): Promise<void> {
  try {
    await (await db())?.put("kv", value, key);
  } catch {}
}

export async function queue(item: OutboxItem): Promise<void> {
  try {
    await (await db())?.put("outbox", item);
  } catch {}
}

export async function outbox(): Promise<OutboxItem[]> {
  try {
    return ((await (await db())?.getAll("outbox")) ?? []) as OutboxItem[];
  } catch {
    return [];
  }
}

export async function removeFromOutbox(id: string): Promise<void> {
  try {
    await (await db())?.delete("outbox", id);
  } catch {}
}

export interface PhoneSettings {
  household: string;
  parentId: string;
}

export const settingsKey = "phone";

/** Loads the week: network first (refreshes the copy on the phone), then the phone's copy. */
export async function loadWeek(slug: string): Promise<{ week: WeekView | null; fromPhone: boolean }> {
  try {
    const week = await fetch(`/parents/api/week/${slug}`).then((r) => (r.ok ? (r.json() as Promise<WeekView>) : null));
    if (week) {
      await setKv(`week:${slug}`, week);
      return { week, fromPhone: false };
    }
  } catch {}
  return { week: (await getKv<WeekView>(`week:${slug}`)) ?? null, fromPhone: true };
}

/** Whose phone this is, kept on the phone. */
export async function saveSettings(s: PhoneSettings): Promise<void> {
  await setKv(settingsKey, s);
}

let flushing: Promise<number> | null = null;

/** Sends queued items when online, one run at a time. Returns how many were sent. */
export function flushOutbox(): Promise<number> {
  flushing ??= sendQueued().finally(() => {
    flushing = null;
  });
  return flushing;
}

async function sendQueued(): Promise<number> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return 0;
  let sent = 0;
  for (const item of await outbox()) {
    try {
      const res = await fetch(`/parents/api/${item.kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, createdAt: item.createdAt, ...item.payload }),
      });
      if (res.ok) {
        await removeFromOutbox(item.id);
        sent++;
      }
    } catch {
      break;
    }
  }
  return sent;
}
