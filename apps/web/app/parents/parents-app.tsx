"use client";

import { ArrowLeft, WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BottomBar } from "@/components/parents/bottom-bar";
import type { DiarySeed } from "@/lib/diary-types";
import {
  flushOutbox,
  getKv,
  loadWeek,
  type PhoneSettings,
  queue,
  saveSettings,
  setKv,
  settingsKey,
} from "@/lib/parents-store";
import {
  applyChanges,
  DEMO_HOUSEHOLDS,
  DEMO_NOW,
  outingsFor,
  placePhoto,
  type WeekChanges,
  type WeekView,
} from "@/lib/week";
import { ParentsContext, type ParentsState, type View } from "./context";
import { BookView } from "./views/book";
import { HowView, LostView } from "./views/care";
import { DiaryView } from "./views/diary";
import { StartView } from "./views/start";
import { TodayView } from "./views/today";
import { DirectionsView, DriverView, FriendView, JoinView, PracticeView } from "./views/trip";

const VIEWS: View[] = ["today", "directions", "driver", "practice", "how", "lost", "diary", "book", "friend", "join"];

const pageFor = (s: PhoneSettings) => `/parents/${s.household}/${s.parentId}`;
const validSettings = (household?: string, parentId?: string) =>
  Boolean(household && parentId && /^[a-z0-9-]{1,60}$/.test(household) && /^p_[a-z0-9_]{1,60}$/.test(parentId));

function readLocation(): { view: View; outingId: string | null } {
  const q = new URLSearchParams(window.location.search);
  const v = q.get("v") as View | null;
  return { view: v && VIEWS.includes(v) ? v : "today", outingId: q.get("o") };
}

/** Runs work once the phone is idle, so the first screen stays quick on slow phones. Returns a cancel. */
function whenIdle(fn: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(fn, { timeout: 4000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = globalThis.setTimeout(fn, 1500);
  return () => globalThis.clearTimeout(id);
}

/**
 * The parents' app. Each parent has their own page, /parents/<household>/<parent>, rendered
 * with their week, so today's ticket is in the HTML. Views change on the phone with the
 * history API (?v=directions), so moving around never needs the network. /parents itself is
 * the start screen: it asks whose phone this is, then remembers.
 */
export function ParentsApp({
  initial,
}: {
  initial?: { household: string; parentId: string; week: WeekView; diary?: DiarySeed[] };
}) {
  const t = useTranslations();
  // The server renders today's screen; the phone then applies the view in the address.
  const [view, setView] = useState<View>("today");
  const [outingId, setOutingId] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [home, setHomeState] = useState<Record<string, boolean>>({});
  const [featured, setFeatured] = useState<string | null>(null);

  useEffect(() => {
    const apply = () => {
      const l = readLocation();
      setView(l.view);
      setOutingId(l.outingId);
    };
    apply();
    window.addEventListener("popstate", apply);
    const on = () => {
      setOnline(true);
      void flushOutbox();
    };
    const off = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    getKv<Record<string, boolean>>("home").then((h) => setHomeState(h ?? {}));
    return () => {
      window.removeEventListener("popstate", apply);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const go = useCallback((v: View, o?: string) => {
    if (v === "start") {
      window.location.assign("/parents?v=start");
      return;
    }
    const q = new URLSearchParams();
    if (v !== "today") q.set("v", v);
    if (o) q.set("o", o);
    window.history.pushState(null, "", `${window.location.pathname}${q.size ? `?${q}` : ""}`);
    setView(v);
    setOutingId(o ?? null);
    window.scrollTo({ top: 0 });
    // The new view replaces the button that opened it, so move focus to the view's heading:
    // keyboard and screen-reader users start at the top of the new screen, not on the page body.
    requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>("main h1") ?? document.querySelector<HTMLElement>("main");
      if (!target) return;
      target.tabIndex = -1;
      target.focus({ preventScroll: true });
    });
  }, []);

  if (!initial) return <StartScreen />;
  return (
    <ParentScreens
      initial={initial}
      view={view}
      outingId={outingId}
      online={online}
      home={home}
      setHomeState={setHomeState}
      featured={featured}
      setFeatured={setFeatured}
      go={go}
      t={t}
    />
  );
}

function ParentScreens({
  initial,
  view,
  outingId,
  online,
  home,
  setHomeState,
  featured,
  setFeatured,
  go,
  t,
}: {
  initial: { household: string; parentId: string; week: WeekView; diary?: DiarySeed[] };
  view: View;
  outingId: string | null;
  online: boolean;
  home: Record<string, boolean>;
  setHomeState: (h: Record<string, boolean>) => void;
  featured: string | null;
  setFeatured: (id: string | null) => void;
  go: (v: View, o?: string) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const { household } = initial;

  // What the dashboard changed in this session (approvals, moves), kept on the phone for offline.
  const [changes, setChanges] = useState<WeekChanges | null>(null);
  useEffect(() => {
    const key = `changes:${household}:${initial.parentId}`;
    let fresh = false;
    getKv<WeekChanges>(key).then((saved) => {
      if (saved && !fresh) setChanges(saved);
    });
    if (!navigator.onLine) return;
    fetch(`/parents/api/changes/${household}/${initial.parentId}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<WeekChanges>) : null))
      .then((c) => {
        if (!c) return;
        fresh = true;
        setChanges(c);
        void setKv(key, c);
      })
      .catch(() => {});
  }, [household, initial.parentId]);
  const week = useMemo(() => applyChanges(initial.week, changes), [initial.week, changes]);

  // Remember whose phone this is, so /parents (the installed app's start) opens this page.
  useEffect(() => {
    void saveSettings({ household, parentId: initial.parentId });
  }, [household, initial.parentId]);

  // Warm the offline cache once the phone is idle on home Wi-Fi: this page, the start page,
  // everything this page loaded before the service worker took over, and every photo and
  // saved recording in the week.
  useEffect(() => {
    if (!online || !("serviceWorker" in navigator)) return;
    return whenIdle(() => {
      const urls = new Set<string>([window.location.pathname, "/parents", "/parents/manifest.webmanifest"]);
      if (week.household.helpCardAudio) urls.add(week.household.helpCardAudio);
      for (const e of performance.getEntriesByType("resource")) {
        const u = new URL(e.name);
        if (u.origin === location.origin && u.pathname.startsWith("/_next/static/")) urls.add(u.pathname);
      }
      for (const o of week.outings) {
        if (o.photo) urls.add(placePhoto(o.photo.url, 288, 288));
        for (const p of o.landmarkPhotos) urls.add(p);
        for (const c of o.cards) {
          if (c.audio?.body) urls.add(c.audio.body);
          for (const ph of c.phrases) if (ph.audio?.local) urls.add(ph.audio.local);
        }
      }
      navigator.serviceWorker.ready
        .then((reg) => reg.active?.postMessage({ type: "CACHE_URLS", payload: { urlsToCache: [...urls] } }))
        .catch(() => {});
    });
  }, [online, week]);

  const state: ParentsState | null = useMemo(() => {
    const parent = week.parents.find((p) => p.id === initial.parentId);
    if (!parent) return null;
    const outings = outingsFor(week, parent.id);
    const outing =
      outings.find((o) => o.id === outingId) ?? outings.find((o) => o.id === featured) ?? outings[0] ?? null;
    const card = outing ? (outing.cards.find((c) => c.parentId === parent.id) ?? outing.cards[0] ?? null) : null;
    return {
      week,
      parentId: parent.id,
      parent,
      outings,
      outing,
      card,
      home,
      setHome: (id: string) => {
        const next = { ...home, [id]: true };
        setHomeState(next);
        void setKv("home", next);
        navigator.vibrate?.(12);
        void queue({
          id: `${id}:${parent.id}:home`,
          kind: "checkin",
          createdAt: new Date().toISOString(),
          payload: { outingId: id, parentId: parent.id, state: "home" },
        }).then(() => flushOutbox());
      },
      go,
      online,
      fromPhone: false,
      diarySeeds: initial.diary ?? [],
      t: (k, v) => t(k as never, v as never),
    };
  }, [week, initial.parentId, initial.diary, outingId, featured, home, setHomeState, go, online, t]);

  if (!state) return null;
  const current = state.outing;
  const onHome = () => {
    if (!current) return go("today");
    if (!home[current.id]) state.setHome(current.id);
    go("today", current.id);
    setFeatured(current.id);
    window.setTimeout(() => go("how", current.id), 1100);
  };

  return (
    <ParentsContext.Provider value={state}>
      <div className="mx-auto max-w-[480px] px-5 pt-4 pb-[calc(var(--parents-bar,8rem)+2rem)]">
        <header className="mb-4 flex min-h-14 items-center justify-between gap-3">
          {view !== "today" ? (
            <button
              type="button"
              onClick={() => go("today")}
              className="-ml-2 inline-flex flex-wrap min-h-14 items-center gap-2 rounded-lg px-2 text-[18px] font-medium"
              lang="te"
            >
              <ArrowLeft aria-hidden="true" className="shrink-0 size-6 stroke-[1.75]" />
              {t("Parents.back_to_today")}
            </button>
          ) : (
            <span className="rounded-full bg-surface-sunken px-3 py-1 text-[14px] text-text-muted" lang="en">
              {t("Parents.demo")}
            </span>
          )}
          {/* Opens the start screen, where the phone's owner is chosen. */}
          <button
            type="button"
            onClick={() => go("start")}
            className="-mr-2 min-h-14 min-w-14 rounded-lg px-2 text-[15px] text-text-muted underline-offset-4 hover:underline"
          >
            <span lang="en">{state.parent.firstName}</span>
            <span className="sr-only" lang="te">
              {` · ${t("Parents.whose")}`}
            </span>
          </button>
        </header>
        {/* Always in the page, so screen readers announce the change when the Wi-Fi drops. */}
        <div role="status">
          {!online ? (
            <p className="mb-4 flex items-center gap-2 rounded-lg bg-surface-sunken px-4 py-3 text-[18px]" lang="te">
              <WifiOff aria-hidden="true" className="size-5 shrink-0" />
              {t("Parents.offline")}
            </p>
          ) : null}
        </div>
        <main data-view={view}>
          {view === "today" ? <TodayView featuredId={featured ?? outingId} onFeature={setFeatured} /> : null}
          {view === "directions" ? <DirectionsView /> : null}
          {view === "driver" ? <DriverView /> : null}
          {view === "practice" ? <PracticeView /> : null}
          {view === "how" ? <HowView /> : null}
          {view === "lost" ? <LostView /> : null}
          {view === "diary" ? <DiaryView /> : null}
          {view === "book" ? <BookView /> : null}
          {view === "friend" ? <FriendView /> : null}
          {view === "join" ? <JoinView /> : null}
        </main>
      </div>
      <BottomBar
        labels={{ home: t("Parents.imHome"), diary: t("Parents.diary"), lost: t("Parents.imLost") }}
        onHome={onHome}
        onDiary={() => go("diary")}
        onLost={() => go("lost")}
        homeActive={Boolean(current && !home[current.id] && current.date <= DEMO_NOW.date)}
        current={view === "diary" ? "diary" : view === "lost" ? "lost" : undefined}
      />
    </ParentsContext.Provider>
  );
}

/**
 * /parents: whose phone is this? A setup link (/parents?as=fremont-demo.p_sarala) answers it
 * once; after that the phone opens its parent's page straight away, offline too.
 */
function StartScreen() {
  const t = useTranslations();
  const [ready, setReady] = useState(false);
  const [household, setHousehold] = useState<string>(DEMO_HOUSEHOLDS[0].slug);
  // undefined: still loading; null: no copy on the network or the phone.
  const [weeks, setWeeks] = useState<Record<string, WeekView | null | undefined>>({});

  useEffect(() => {
    (async () => {
      const q = new URLSearchParams(window.location.search);
      const [h, p] = (q.get("as") ?? "").split(".");
      let s = validSettings(h, p)
        ? { household: h!, parentId: p! }
        : ((await getKv<PhoneSettings>(settingsKey)) ?? null);
      if (s && !validSettings(s.household, s.parentId)) s = null;
      if (s && q.get("v") !== "start") {
        await saveSettings(s);
        q.delete("as");
        window.location.replace(`${pageFor(s)}${q.size ? `?${q}` : ""}`);
        return;
      }
      if (s) setHousehold(s.household);
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!ready || weeks[household] !== undefined) return;
    loadWeek(household).then(({ week }) => setWeeks((w) => ({ ...w, [household]: week })));
  }, [ready, household, weeks]);

  if (!ready) return <div className="min-h-dvh" aria-busy="true" />;
  return (
    <main className="mx-auto max-w-[480px] px-5 pb-10">
      <StartView
        weeks={weeks}
        household={household}
        onHousehold={setHousehold}
        onParent={async (id) => {
          const s = { household, parentId: id };
          await saveSettings(s);
          window.location.assign(pageFor(s));
        }}
        t={(k) => t(k as never)}
      />
    </main>
  );
}
