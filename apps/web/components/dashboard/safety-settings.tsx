"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { SafetySettings as Settings } from "@roundtrip/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { hhmm } from "@/lib/plan-format";
import { cn } from "@/lib/utils";

/**
 * Safety settings for one household (docs/plan.md, Safety): when the phone checks on them,
 * when you're told, and the weather and daylight rules. React Hook Form with the household
 * schema's limits, in words a family would use. Saved to this visitor's session.
 * Docs: https://react-hook-form.com/docs/useform, https://github.com/react-hook-form/resolvers#zod
 */

const Form = z.object({
  bufferMinutes: z
    .number({ error: "Enter a number of minutes" })
    .int("Whole minutes only")
    .min(10, "At least 10 minutes")
    .max(180, "At most 3 hours"),
  nudgeWaitMinutes: z
    .number({ error: "Enter a number of minutes" })
    .int("Whole minutes only")
    .min(5, "At least 5 minutes")
    .max(120, "At most 2 hours"),
  daylightOnly: z.boolean(),
  weather: z.object({
    blockIce: z.boolean(),
    blockHeavySnow: z.boolean(),
    blockHeatAdvisory: z.boolean(),
    shadeWarningAboveC: z.number({ error: "Enter a temperature" }).min(20, "20 °C or more").max(45, "45 °C or less"),
  }),
});
type FormValues = z.infer<typeof Form>;

export interface TimerExample {
  who: string;
  place: string;
  day: string;
  depart: number;
  back: number;
}

/** The four moments of an outing's safety timer, spaced evenly with the time between them. */
export function SafetyTimeline({ example, buffer, wait }: { example: TimerExample; buffer: number; wait: number }) {
  const nudge = example.back + (Number.isFinite(buffer) ? buffer : 0);
  const alert = nudge + (Number.isFinite(wait) ? wait : 0);
  const out = example.back - example.depart;
  const gaps = [
    `${Math.floor(out / 60) ? `${Math.floor(out / 60)} h ` : ""}${out % 60 ? `${out % 60} min` : ""}`.trim(),
    `${Number.isFinite(buffer) ? buffer : "?"} min`,
    `${Number.isFinite(wait) ? wait : "?"} min`,
  ];
  const steps = [
    { t: example.depart, label: "Leaves", text: `${example.who} sets off` },
    { t: example.back, label: "Home by", text: "The ticket's return time" },
    { t: nudge, label: "Phone checks", text: "“Are you home?” with one tap to answer" },
    { t: alert, label: "Email to you", text: "With the outing details and where they were going" },
  ];
  return (
    <div className="space-y-4">
      <p className="text-[15px]">
        For example, {example.who}&rsquo;s {example.day} outing to {example.place}:
      </p>
      {/* Wide screens: the four moments in a row, with the time between them on each stretch. */}
      <div
        aria-hidden="true"
        className="hidden grid-cols-[auto_1fr_auto_1fr_auto_1fr_auto] items-center gap-x-2 pb-11 pt-5 sm:grid"
      >
        {steps.map((s, i) => (
          <Fragment key={s.label}>
            <span
              className={cn(
                "relative block size-[22px] rounded-full border-[3px] bg-surface",
                i === 3 ? "border-sea-line" : "border-ink",
              )}
            >
              <span
                className={cn(
                  "absolute top-full mt-2 whitespace-nowrap text-[13px] font-semibold leading-tight tabular-nums",
                  i === 0 ? "left-0" : i === 3 ? "right-0 text-right" : "left-1/2 -translate-x-1/2 text-center",
                )}
              >
                {s.label}
                <br />
                {hhmm(s.t)}
              </span>
            </span>
            {i < 3 ? (
              <span className="relative block h-[3px]">
                <span
                  className={cn(
                    "absolute inset-x-0 top-1/2 -translate-y-1/2",
                    i === 0 ? "h-[3px] rounded-full bg-ink/80" : "h-0 border-t-2 border-dashed border-ink/45",
                  )}
                />
                <span className="absolute inset-x-0 -top-6 text-center text-[13px] tabular-nums text-text-muted">
                  {gaps[i]}
                </span>
              </span>
            ) : null}
          </Fragment>
        ))}
      </div>
      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={s.label} className="flex gap-3 text-[15px] leading-snug">
            <span className="w-[4.5rem] shrink-0 font-semibold tabular-nums">{hhmm(s.t)}</span>
            <span>
              <span className="font-semibold">{s.label}.</span> {s.text}
              {i === 2
                ? `, ${buffer} minutes after the return time.`
                : i === 3
                  ? `, ${wait} minutes later if there's no answer.`
                  : "."}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-[13px] text-text-muted">
        Each outing&rsquo;s timer runs as a durable workflow, so it keeps counting through a server restart. Tapping
        &ldquo;I&rsquo;m home&rdquo; stops it.
      </p>
    </div>
  );
}

function Row({
  label,
  hint,
  error,
  children,
}: {
  label: React.ReactNode;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 border-t border-line py-4 first:border-t-0 first:pt-0">
      <div className="min-w-[14rem] flex-1 space-y-0.5">
        <div className="text-[15px] font-medium">{label}</div>
        {hint ? <p className="text-[13px] text-text-muted">{hint}</p> : null}
        {error ? (
          <p role="alert" className="text-[13px] font-medium text-text">
            {error}
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

function MinutesInput({ id, invalid, ...props }: React.ComponentProps<"input"> & { invalid?: boolean }) {
  return (
    <input
      id={id}
      type="number"
      inputMode="numeric"
      aria-invalid={invalid || undefined}
      className={cn(
        "h-10 w-20 rounded-lg border border-line-strong bg-surface px-3 text-right text-base tabular-nums outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        invalid && "border-ink ring-2 ring-ink/30",
      )}
      {...props}
    />
  );
}

export function SafetySettingsForm({
  household,
  defaults,
  example,
  usesFahrenheit,
}: {
  household: string;
  defaults: Settings;
  example: TimerExample | null;
  usesFahrenheit: boolean;
}) {
  const qc = useQueryClient();
  const saved = useQuery({
    queryKey: ["safety", household],
    queryFn: async () => {
      const res = await fetch(`/plan/api/safety/${household}`);
      return res.ok ? ((await res.json()) as Settings | null) : null;
    },
  });
  const form = useForm<FormValues>({ resolver: zodResolver(Form), defaultValues: defaults, mode: "onBlur" });
  const { register, control, handleSubmit, reset, formState } = form;
  const { errors, isDirty } = formState;

  useEffect(() => {
    if (saved.data) reset(saved.data);
  }, [saved.data, reset]);

  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      const res = await fetch(`/plan/api/safety/${household}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Check the settings and save again.");
      return body as Settings;
    },
    onSuccess: (values) => {
      qc.setQueryData(["safety", household], values);
      reset(values);
      toast("Safety settings saved", {
        description: "They apply to the next plan and to each outing's timer. This demo keeps them for a day.",
      });
    },
    onError: (e) => toast("Not saved yet", { description: e instanceof Error ? e.message : undefined }),
  });

  const buffer = useWatch({ control, name: "bufferMinutes" });
  const wait = useWatch({ control, name: "nudgeWaitMinutes" });
  const shade = useWatch({ control, name: "weather.shadeWarningAboveC" });

  return (
    <div className="grid gap-6 lg:grid-cols-[1.05fr_1fr]">
      {example ? (
        <section aria-labelledby="timer" className="space-y-4">
          <h2 id="timer" className="text-[20px] font-semibold">
            The timer on each outing
          </h2>
          <SafetyTimeline example={example} buffer={buffer} wait={wait} />
        </section>
      ) : null}

      <form onSubmit={handleSubmit((v) => save.mutate(v))} aria-labelledby="settings" className="space-y-1" noValidate>
        <h2 id="settings" className="mb-4 text-[20px] font-semibold">
          Settings
        </h2>
        <Row
          label={<label htmlFor="bufferMinutes">Check on them after</label>}
          hint="Minutes past the return time before their phone asks if they're home."
          error={errors.bufferMinutes?.message}
        >
          <MinutesInput
            id="bufferMinutes"
            invalid={Boolean(errors.bufferMinutes)}
            {...register("bufferMinutes", { valueAsNumber: true })}
          />
          <span className="text-[15px] text-text-muted">min</span>
        </Row>
        <Row
          label={<label htmlFor="nudgeWaitMinutes">Then tell you after</label>}
          hint="Minutes after that check, if there's no answer."
          error={errors.nudgeWaitMinutes?.message}
        >
          <MinutesInput
            id="nudgeWaitMinutes"
            invalid={Boolean(errors.nudgeWaitMinutes)}
            {...register("nudgeWaitMinutes", { valueAsNumber: true })}
          />
          <span className="text-[15px] text-text-muted">min</span>
        </Row>
        <Row label={<span id="daylight-label">Home before dark</span>} hint="Outings on their own end before sunset.">
          <Controller
            control={control}
            name="daylightOnly"
            render={({ field }) => (
              <Switch aria-labelledby="daylight-label" checked={field.value} onCheckedChange={field.onChange} />
            )}
          />
        </Row>
        {(
          [
            ["blockIce", "No outings when there's ice"],
            ["blockHeavySnow", "No outings in heavy snow"],
            ["blockHeatAdvisory", "No outings on heat advisory days"],
          ] as const
        ).map(([name, text]) => (
          <Row key={name} label={<span id={`${name}-label`}>{text}</span>}>
            <Controller
              control={control}
              name={`weather.${name}`}
              render={({ field }) => (
                <Switch aria-labelledby={`${name}-label`} checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
          </Row>
        ))}
        <Row
          label={<label htmlFor="shade">Warn about walking in the sun above</label>}
          hint={
            usesFahrenheit && Number.isFinite(shade)
              ? `${shade} °C is ${Math.round((shade * 9) / 5 + 32)} °F. The ticket suggests a shaded way or a hat.`
              : "The ticket suggests a shaded way or a hat."
          }
          error={errors.weather?.shadeWarningAboveC?.message}
        >
          <MinutesInput
            id="shade"
            invalid={Boolean(errors.weather?.shadeWarningAboveC)}
            {...register("weather.shadeWarningAboveC", { valueAsNumber: true })}
          />
          <span className="text-[15px] text-text-muted">°C</span>
        </Row>
        <div className="flex items-center gap-3 border-t border-line pt-4">
          <Button type="submit" variant="primary" disabled={save.isPending || !isDirty}>
            {save.isPending ? "Saving" : "Save settings"}
          </Button>
          {isDirty ? (
            <Button type="button" variant="quiet" onClick={() => reset()}>
              Undo changes
            </Button>
          ) : (
            <p className="text-[13px] text-text-muted">
              {saved.data ? "Saved for this visit." : "The household's settings."}
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
