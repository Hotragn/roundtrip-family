"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { LanguageRecord, Readiness } from "@roundtrip/core";
import { useMutation } from "@tanstack/react-query";
import { Check, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { type FieldPath, useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Panel } from "@/components/shell/panel";
import { Button } from "@/components/ui/button";
import { DAY_NAMES } from "@/lib/plan-format";
import { DAYS, READING, SetupForm, TRANSIT } from "@/lib/setup-schema";
import { cn } from "@/lib/utils";

/**
 * The household setup wizard (docs/plan.md, Setup): where they're staying, each parent and their
 * language with what's ready for it, the days they're on their own, and who to call. Prefilled
 * with the demo household; saving keeps the changes in this browser session for a day.
 * Docs: https://react-hook-form.com/docs/usefieldarray, https://react-hook-form.com/docs/useform/trigger
 */

export interface CountryOption {
  code: string;
  name: string;
  localLanguage: string;
  emergency: { number: string; covers: string; source: string };
  secondaryEmergency?: { number: string; covers: string };
}

const STEPS: Array<{ title: string; fields: FieldPath<SetupForm>[] }> = [
  { title: "Where they're staying", fields: ["hostCountry", "localLanguage", "searchLocation", "homeStop"] },
  { title: "Your parents", fields: ["parents"] },
  { title: "When they're on their own", fields: ["alone", "trialRunDays"] },
  { title: "If they need help", fields: ["contactLabel", "contactPhone", "phonePlan"] },
  { title: "Check and save", fields: [] },
];

const READY: Record<Readiness, string> = {
  ready: "Ready",
  fallback: "General model",
  needs_tuning: "Needs tuning",
  unavailable: "Not available",
};

const field =
  "h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-ink aria-invalid:ring-2 aria-invalid:ring-ink/30";

function Field({
  id,
  label,
  hint,
  error,
  children,
  className,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-[15px] font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-[13px] font-medium">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[13px] text-text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

function LanguageReady({ rec }: { rec: LanguageRecord | undefined }) {
  if (!rec) {
    return (
      <p className="text-[13px] text-text-muted">
        Gemma 4 reads most languages; cards use the general model until a writer is tuned for this one.
      </p>
    );
  }
  const parts = [
    ["Reading and planning", rec.reading.status],
    ["Cards", rec.cardWriter.status],
    ["Reading aloud", rec.speaking.status],
    ["Listening", rec.listening.status],
  ] as const;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={`What's ready in ${rec.name}`}>
      {parts.map(([what, s]) => (
        <li
          key={what}
          className={cn(
            "inline-flex h-6 items-center gap-1 rounded-chip border px-2 text-[13px] font-medium",
            s === "ready" ? "border-line-strong bg-surface" : "border-line bg-surface-sunken text-text-muted",
          )}
        >
          {s === "ready" ? <Check aria-hidden="true" className="size-3.5" /> : null}
          {what}: {READY[s]}
        </li>
      ))}
    </ul>
  );
}

export function SetupWizard({
  household,
  initial,
  countries,
  languages,
}: {
  household: string;
  initial: SetupForm;
  countries: CountryOption[];
  languages: LanguageRecord[];
}) {
  const [step, setStep] = useState(0);
  const form = useForm<SetupForm>({ resolver: zodResolver(SetupForm), defaultValues: initial, mode: "onTouched" });
  const { register, control, handleSubmit, trigger, setValue, formState } = form;
  const errors = formState.errors;
  const parents = useFieldArray({ control, name: "parents" });
  const values = useWatch({ control });
  const country = countries.find((c) => c.code === values.hostCountry);

  const save = useMutation({
    mutationFn: async (v: SetupForm) => {
      const res = await fetch(`/plan/api/setup/${household}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(v),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Check the highlighted answers and save again.");
      return body;
    },
    onSuccess: () =>
      toast("Setup saved", {
        description:
          "The next plan uses it. This demo keeps your changes for a day; the fictional family stays as it was.",
      }),
    onError: (e) => toast("Not saved yet", { description: e instanceof Error ? e.message : undefined }),
  });

  async function next() {
    const ok = await trigger(STEPS[step]!.fields, { shouldFocus: true });
    if (ok) setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[15rem_1fr]">
      <nav aria-label="Setup steps">
        <ol className="flex gap-2 overflow-x-auto lg:flex-col lg:gap-1">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <button
                type="button"
                onClick={async () => {
                  if (i <= step || (await trigger(STEPS[step]!.fields))) setStep(i);
                }}
                aria-current={i === step ? "step" : undefined}
                className={cn(
                  "flex w-full items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-left text-[14px] text-text-muted transition-colors hover:text-text",
                  i === step && "bg-surface font-semibold text-text shadow-raised ring-1 ring-line",
                )}
              >
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full border text-[13px] tabular-nums",
                    i < step ? "border-ink bg-ink text-surface" : "border-line-strong",
                  )}
                >
                  {i < step ? <Check aria-hidden="true" className="size-3.5" /> : i + 1}
                </span>
                {s.title}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
        <Panel className="p-5 sm:p-6">
          <p className="text-[13px] text-text-muted">
            Step {step + 1} of {STEPS.length}
          </p>
          <h2 className="mb-5 text-[25px] font-semibold leading-tight">{STEPS[step]!.title}</h2>

          {step === 0 ? (
            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="hostCountry" label="Country" error={errors.hostCountry?.message}>
                <select
                  id="hostCountry"
                  className={field}
                  {...register("hostCountry", {
                    onChange: (e) => {
                      const c = countries.find((x) => x.code === e.target.value);
                      if (c) setValue("localLanguage", c.localLanguage);
                    },
                  })}
                >
                  {countries.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                id="localLanguage"
                label="The language around them"
                hint="Phrases, the driver card and the help card use it."
              >
                <select id="localLanguage" className={field} {...register("localLanguage")}>
                  {languages.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </Field>
              {country ? (
                <div className="rounded-card bg-surface-sunken p-4 sm:col-span-2">
                  <p className="text-[15px]">In an emergency in {country.name}:</p>
                  <ul className="mt-1 space-y-0.5 text-[15px]">
                    {[country.emergency, ...(country.secondaryEmergency ? [country.secondaryEmergency] : [])].map(
                      (n) => (
                        <li key={n.number}>
                          <span className="font-semibold tabular-nums">{n.number}</span> {n.covers}
                        </li>
                      ),
                    )}
                  </ul>
                  <p className="mt-1 text-[13px] text-text-muted">
                    From {new URL(country.emergency.source).hostname.replace(/^www\./, "")}. Only countries whose number
                    has been checked against an official page are listed.
                  </p>
                </div>
              ) : null}
              <Field
                id="searchLocation"
                label="Town or district"
                hint="Searches for events use it, with language and interest only."
                error={errors.searchLocation?.message}
              >
                <input
                  id="searchLocation"
                  className={field}
                  aria-invalid={Boolean(errors.searchLocation) || undefined}
                  {...register("searchLocation")}
                />
              </Field>
              <Field
                id="homeStop"
                label="The bus stop or corner nearest home"
                hint="Directions start here, so the home address is never needed."
                error={errors.homeStop?.message}
              >
                <input
                  id="homeStop"
                  className={field}
                  aria-invalid={Boolean(errors.homeStop) || undefined}
                  {...register("homeStop")}
                />
              </Field>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-6">
              {parents.fields.map((f, i) => {
                const lang = values.parents?.[i]?.language;
                const e = errors.parents?.[i];
                return (
                  <fieldset key={f.id} className="space-y-4 rounded-card p-4 ring-1 ring-line">
                    <legend className="px-1 text-[15px] font-semibold">
                      {values.parents?.[i]?.firstName || `Parent ${i + 1}`}
                    </legend>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field id={`p${i}-name`} label="First name" error={e?.firstName?.message}>
                        <input
                          id={`p${i}-name`}
                          className={field}
                          aria-invalid={Boolean(e?.firstName) || undefined}
                          {...register(`parents.${i}.firstName`)}
                        />
                      </Field>
                      <Field
                        id={`p${i}-address`}
                        label="What their cards call them"
                        hint="As you'd say it at home, e.g. అమ్మా"
                        error={e?.addressAs?.message}
                      >
                        <input
                          id={`p${i}-address`}
                          lang={lang}
                          className={field}
                          aria-invalid={Boolean(e?.addressAs) || undefined}
                          {...register(`parents.${i}.addressAs`)}
                        />
                      </Field>
                      <Field id={`p${i}-lang`} label="Their language" className="sm:col-span-2">
                        <select id={`p${i}-lang`} className={field} {...register(`parents.${i}.language`)}>
                          {languages.map((l) => (
                            <option key={l.code} value={l.code}>
                              {l.name} ({l.nativeName})
                            </option>
                          ))}
                        </select>
                        <LanguageReady rec={languages.find((l) => l.code === lang)} />
                      </Field>
                      <Field
                        id={`p${i}-reading`}
                        label="Reading"
                        hint={READING[values.parents?.[i]?.readingSupport ?? "text"]?.hint}
                      >
                        <select id={`p${i}-reading`} className={field} {...register(`parents.${i}.readingSupport`)}>
                          {Object.entries(READING).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field id={`p${i}-transit`} label="Buses and trains">
                        <select id={`p${i}-transit`} className={field} {...register(`parents.${i}.transitComfort`)}>
                          {Object.entries(TRANSIT).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field
                        id={`p${i}-walk`}
                        label="Walking, at most"
                        hint="Minutes of walking on one trip"
                        error={e?.maxWalkMinutes?.message}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            id={`p${i}-walk`}
                            type="number"
                            inputMode="numeric"
                            className={cn(field, "w-24 text-right tabular-nums")}
                            aria-invalid={Boolean(e?.maxWalkMinutes) || undefined}
                            {...register(`parents.${i}.maxWalkMinutes`, { valueAsNumber: true })}
                          />
                          <span className="text-[15px] text-text-muted">min</span>
                        </div>
                      </Field>
                      <Field id={`p${i}-best`} label="Best time to go out" error={e?.bestEnd?.message}>
                        <div className="flex items-center gap-2">
                          <input
                            id={`p${i}-best`}
                            type="time"
                            className={cn(field, "w-32")}
                            {...register(`parents.${i}.bestStart`)}
                          />
                          <span className="text-text-muted">to</span>
                          <input
                            type="time"
                            aria-label="Best time ends"
                            className={cn(field, "w-32")}
                            aria-invalid={Boolean(e?.bestEnd) || undefined}
                            {...register(`parents.${i}.bestEnd`)}
                          />
                        </div>
                      </Field>
                      <Field
                        id={`p${i}-nap`}
                        label="Rest time"
                        hint="Outings end before it. Leave empty if none."
                        error={e?.napEnd?.message}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            id={`p${i}-nap`}
                            type="time"
                            className={cn(field, "w-32")}
                            {...register(`parents.${i}.napStart`)}
                          />
                          <span className="text-text-muted">to</span>
                          <input
                            type="time"
                            aria-label="Rest time ends"
                            className={cn(field, "w-32")}
                            aria-invalid={Boolean(e?.napEnd) || undefined}
                            {...register(`parents.${i}.napEnd`)}
                          />
                        </div>
                      </Field>
                    </div>
                    {parents.fields.length > 1 ? (
                      <Button type="button" variant="quiet" size="sm" onClick={() => parents.remove(i)}>
                        <Trash2 aria-hidden="true" className="size-4" />
                        Remove {values.parents?.[i]?.firstName || "this parent"}
                      </Button>
                    ) : null}
                  </fieldset>
                );
              })}
              {parents.fields.length < 2 ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    parents.append({
                      ...initial.parents[0]!,
                      firstName: "",
                      addressAs: "",
                    })
                  }
                >
                  <Plus aria-hidden="true" className="size-4" />
                  Add a parent
                </Button>
              ) : null}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-5">
              <p className="text-[15px] text-text-muted">
                Outings on their own go on these days. On other days they&rsquo;re with family.
              </p>
              <ul className="divide-y divide-line">
                {DAYS.map((d, i) => {
                  const on = values.alone?.[i]?.on;
                  return (
                    <li key={d} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                      <label className="flex w-40 items-center gap-2.5 text-[15px] font-medium">
                        <input
                          type="checkbox"
                          className="size-5 accent-[var(--color-ink)]"
                          {...register(`alone.${i}.on`)}
                        />
                        {DAY_NAMES[d]}
                      </label>
                      {on ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="time"
                            aria-label={`${DAY_NAMES[d]}, on their own from`}
                            className={cn(field, "w-32")}
                            {...register(`alone.${i}.start`)}
                          />
                          <span className="text-text-muted">to</span>
                          <input
                            type="time"
                            aria-label={`${DAY_NAMES[d]}, on their own until`}
                            className={cn(field, "w-32")}
                            aria-invalid={Boolean(errors.alone?.[i]?.end) || undefined}
                            {...register(`alone.${i}.end`)}
                          />
                        </div>
                      ) : (
                        <span className="text-[14px] text-text-muted">With family</span>
                      )}
                      {errors.alone?.[i]?.end ? (
                        <p role="alert" className="w-full text-[13px] font-medium">
                          {errors.alone[i]?.end?.message}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              <fieldset className="space-y-2">
                <legend className="text-[15px] font-medium">First rides together</legend>
                <p className="text-[13px] text-text-muted">
                  A new route is ridden with you once at the weekend before they take it alone.
                </p>
                <div className="flex gap-5">
                  {(["sat", "sun"] as const).map((d) => (
                    <label key={d} className="flex items-center gap-2 text-[15px]">
                      <input
                        type="checkbox"
                        value={d}
                        className="size-5 accent-[var(--color-ink)]"
                        {...register("trialRunDays")}
                      />
                      {DAY_NAMES[d]}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                id="contactLabel"
                label="What their app calls you"
                hint="Shown on the help card next to your number. Not your full name."
                error={errors.contactLabel?.message}
              >
                <input
                  id="contactLabel"
                  className={field}
                  aria-invalid={Boolean(errors.contactLabel) || undefined}
                  {...register("contactLabel")}
                />
              </Field>
              <Field
                id="contactPhone"
                label="Your phone number"
                error={errors.contactPhone?.message}
                hint="On their phone only, for the help card."
              >
                <input
                  id="contactPhone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  className={field}
                  aria-invalid={Boolean(errors.contactPhone) || undefined}
                  {...register("contactPhone")}
                />
              </Field>
              <fieldset className="space-y-2 sm:col-span-2">
                <legend className="text-[15px] font-medium">Their phones</legend>
                {(
                  [
                    [
                      "wifi_only",
                      "Home Wi-Fi only",
                      "The app works offline on outings; calling for help needs a plan.",
                    ],
                    ["local_plan", "A local SIM or eSIM", "The help card can call you with one tap."],
                  ] as const
                ).map(([v, label, hint]) => (
                  <label
                    key={v}
                    className="flex items-start gap-3 rounded-card p-3 ring-1 ring-line has-[:checked]:ring-ink/60"
                  >
                    <input
                      type="radio"
                      value={v}
                      className="mt-1 size-4 accent-[var(--color-ink)]"
                      {...register("phonePlan")}
                    />
                    <span>
                      <span className="block text-[15px] font-medium">{label}</span>
                      <span className="block text-[13px] text-text-muted">{hint}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            </div>
          ) : null}

          {step === 4 ? (
            <dl className="divide-y divide-line">
              {[
                ["Staying in", `${values.searchLocation}, ${country?.name ?? values.hostCountry}`],
                ["Directions start at", values.homeStop],
                [
                  "Parents",
                  (values.parents ?? [])
                    .map((p) => `${p.firstName} (${languages.find((l) => l.code === p.language)?.name ?? p.language})`)
                    .join(", "),
                ],
                [
                  "On their own",
                  (values.alone ?? [])
                    .filter((w) => w.on)
                    .map((w) => `${DAY_NAMES[w.day ?? "mon"]?.slice(0, 3)} ${w.start} to ${w.end}`)
                    .join(", ") || "No days yet",
                ],
                ["First rides together", (values.trialRunDays ?? []).map((d) => DAY_NAMES[d]).join(" and ") || "None"],
                ["Help card", `${values.contactLabel}, ${values.contactPhone}`],
                ["Their phones", values.phonePlan === "local_plan" ? "A local plan" : "Home Wi-Fi only"],
              ].map(([k, v]) => (
                <div key={k} className="grid gap-1 py-3 sm:grid-cols-[13rem_1fr]">
                  <dt className="text-[14px] text-text-muted">{k}</dt>
                  <dd className="text-[15px]">{v}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-5">
            {step > 0 ? (
              <Button type="button" variant="secondary" onClick={() => setStep((s) => s - 1)}>
                Back
              </Button>
            ) : null}
            {step < STEPS.length - 1 ? (
              <Button type="button" variant="primary" onClick={() => void next()}>
                Next
              </Button>
            ) : (
              <Button type="submit" variant="primary" disabled={save.isPending}>
                {save.isPending ? "Saving" : "Save setup"}
              </Button>
            )}
            {step === STEPS.length - 1 && save.isSuccess ? (
              <Link href={`/plan/${household}`} className="text-sm font-semibold underline underline-offset-4">
                See this week
              </Link>
            ) : null}
          </div>
        </Panel>
      </form>
    </div>
  );
}
