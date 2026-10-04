"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  CalendarCheck,
  CalendarCheck2,
  CalendarClock,
  CalendarX2,
  CheckCircle2,
  Clock,
  MousePointerClick,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ServiceCard } from "@/components/slotwise/service-card";
import { StarRating } from "@/components/slotwise/star-rating";
import { useUIStore } from "@/store/ui-store";
import { useApiQuery } from "@/hooks/use-api-query";
import type { ServiceDTO, TestimonialEntry } from "@/lib/types";
import { fmtMoney, initials } from "@/lib/format";
import { cn } from "@/lib/utils";

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.45 },
};

export function LandingView() {
  const nav = useUIStore((s) => s.nav);
  const openBooking = useUIStore((s) => s.openBooking);
  const { data } = useApiQuery<{ items: ServiceDTO[] }>("/api/services?sort=rating");
  const { data: reviewsData } = useApiQuery<{ items: TestimonialEntry[] }>(
    "/api/reviews/recent?limit=6",
  );

  const featured = (data?.items ?? []).slice(0, 6);
  const categories = [...new Set((data?.items ?? []).map((s) => s.category))];
  const testimonials = (reviewsData?.items ?? []).slice(0, 6);

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative overflow-hidden border-b bg-dots">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 right-[-10%] size-96 rounded-full bg-primary/10 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 left-[-8%] size-80 rounded-full bg-amber-400/15 blur-3xl"
        />
        <div className="mx-auto grid w-full max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col items-start gap-6"
          >
            <Badge variant="secondary" className="gap-1.5 px-3 py-1 text-sm">
              <Sparkles className="size-3.5 text-primary" />
              For clinics, salons, tutors &amp; therapists
            </Badge>
            <h1 className="text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
              Appointments that{" "}
              <span className="relative whitespace-nowrap text-gradient">
                run themselves
                <svg
                  aria-hidden
                  className="absolute -bottom-2 left-0 w-full text-primary/40"
                  viewBox="0 0 200 8"
                  fill="none"
                  preserveAspectRatio="none"
                >
                  <path
                    d="M2 6C40 2 120 2 198 5"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            </h1>
            <p className="max-w-xl text-lg text-muted-foreground">
              SlotWise replaces the WhatsApp roulette and paper diary with online
              booking, staff schedules and a live performance dashboard — and
              makes double-bookings structurally impossible.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" className="h-12 px-6 text-base" onClick={() => nav("browse")}>
                Browse &amp; book
                <ArrowRight className="size-4.5" />
              </Button>
              <Button size="lg" variant="outline" className="h-12 px-6 text-base" onClick={() => nav("auth")}>
                I&apos;m a business owner
              </Button>
            </div>
            <dl className="mt-2 grid w-full max-w-md grid-cols-3 gap-4">
              {[
                { icon: MousePointerClick, label: "3 clicks", sub: "to a confirmed slot" },
                { icon: ShieldCheck, label: "0", sub: "double-bookings" },
                { icon: BarChart3, label: "Live", sub: "revenue analytics" },
              ].map((s) => (
                <div key={s.label} className="flex flex-col gap-1 rounded-lg border bg-card/70 p-3 backdrop-blur">
                  <s.icon className="size-4 text-primary" />
                  <dt className="text-lg font-bold leading-none">{s.label}</dt>
                  <dd className="text-xs text-muted-foreground">{s.sub}</dd>
                </div>
              ))}
            </dl>
          </motion.div>

          {/* Decorative booking mock */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.55, delay: 0.15 }}
            className="relative mx-auto w-full max-w-md"
            aria-hidden
          >
            <div className="absolute inset-0 rotate-3 rounded-2xl border bg-card/60" />
            <Card className="relative gap-0 overflow-hidden py-0 shadow-xl">
              <div className="flex items-center justify-between border-b bg-primary/5 px-5 py-4">
                <div>
                  <p className="text-sm font-semibold">Deep Tissue Massage</p>
                  <p className="text-xs text-muted-foreground">Physiotherapy · 60 min</p>
                </div>
                <span className="text-lg font-bold tabular-nums">{fmtMoney(65)}</span>
              </div>
              <CardContent className="flex flex-col gap-4 p-5">
                <div className="flex items-center gap-2">
                  <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    PN
                  </span>
                  <div>
                    <p className="text-sm font-medium">Dr. Priya Nair</p>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Star className="size-3 fill-amber-400 text-amber-400" /> 4.8 · Sports physiotherapy
                    </p>
                  </div>
                  <Badge variant="secondary" className="ml-auto">Tue</Badge>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {["09:00", "09:45", "10:30", "11:15", "13:00", "13:45", "14:30", "15:15"].map((t, i) => (
                    <span
                      key={t}
                      className={
                        i === 6
                          ? "rounded-md bg-primary px-2 py-1.5 text-center text-sm font-semibold tabular-nums text-primary-foreground"
                          : i === 2 || i === 5
                            ? "rounded-md border bg-muted px-2 py-1.5 text-center text-sm tabular-nums text-muted-foreground/50 line-through"
                            : "rounded-md border px-2 py-1.5 text-center text-sm tabular-nums"
                      }
                    >
                      {t}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <CheckCircle2 className="size-4" />
                  Booked — paid at the clinic. No overlap possible.
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <CalendarX2 className="size-3.5" /> Conflicts auto-rejected
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="size-3.5" /> 60-min lead time
                  </span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* Live activity ticker — social proof from the last 24 hours */}
      <LiveTicker />

      {/* Categories strip */}
      {categories.length > 0 && (
        <section className="border-b bg-muted/30">
          <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-2 px-4 py-4 sm:px-6">
            <span className="mr-2 text-sm font-medium text-muted-foreground">Categories:</span>
            {categories.map((c) => (
              <Badge key={c} variant="outline" className="cursor-pointer hover:bg-secondary">
                {c}
              </Badge>
            ))}
          </div>
        </section>
      )}

      {/* Featured services */}
      <section className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6">
        <motion.div {...fadeUp} className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Top-rated services</h2>
            <p className="mt-1 text-muted-foreground">Ranked by verified customer reviews.</p>
          </div>
          <Button variant="ghost" onClick={() => nav("browse")}>
            View all <ArrowRight className="size-4" />
          </Button>
        </motion.div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {featured.length === 0
            ? Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-64 animate-pulse rounded-xl border bg-muted/40" />
              ))
            : featured.map((s, i) => (
                <motion.div
                  key={s.id}
                  {...fadeUp}
                  transition={{ ...fadeUp.transition, delay: i * 0.06 }}
                >
                  <ServiceCard service={s} onBook={openBooking} className="h-full" />
                </motion.div>
              ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-y bg-muted/30">
        <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6">
          <motion.h2
            {...fadeUp}
            className="text-center text-2xl font-bold tracking-tight sm:text-3xl"
          >
            Three steps. Under a minute.
          </motion.h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              {
                icon: Search,
                step: "01",
                title: "Search & filter",
                text: "Find the right service by name, category, price or provider — results update as you type.",
              },
              {
                icon: CalendarClock,
                step: "02",
                title: "Pick a real slot",
                text: "Only genuinely free times are shown. Availability windows and lead times are enforced server-side.",
              },
              {
                icon: CheckCircle2,
                step: "03",
                title: "Done — & reschedule-free",
                text: "Get a pending booking instantly; cancel or reschedule in one tap if plans change.",
              },
            ].map((s, i) => (
              <motion.div key={s.step} {...fadeUp} transition={{ ...fadeUp.transition, delay: i * 0.08 }}>
                <Card className="h-full">
                  <CardContent className="flex flex-col gap-3 p-6">
                    <div className="flex items-center justify-between">
                      <span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                        <s.icon className="size-5" />
                      </span>
                      <span className="font-mono text-sm font-bold text-muted-foreground/60">{s.step}</span>
                    </div>
                    <p className="font-semibold">{s.title}</p>
                    <p className="text-sm text-muted-foreground">{s.text}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials — pulled live from verified booking reviews */}
      {testimonials.length > 0 && (
        <section className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6">
          <motion.div {...fadeUp} className="mb-6 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                What customers say
              </h2>
              <p className="mt-1 text-muted-foreground">
                Every quote below is tied to a completed, paid appointment.
              </p>
            </div>
          </motion.div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {testimonials.map((t, i) => (
              <motion.div
                key={t.id}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: i * 0.06 }}
              >
                <Card className="h-full">
                  <CardContent className="flex h-full flex-col gap-3 p-5">
                    <StarRating value={t.rating} />
                    <p className="flex-1 text-sm leading-relaxed text-muted-foreground">
                      “{t.comment}”
                    </p>
                    <div className="flex items-center gap-2.5 border-t pt-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {initials(t.authorName)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{t.authorName}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {t.serviceName} · {t.providerName}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* Role cards */}
      <section className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6">
        <motion.h2 {...fadeUp} className="text-2xl font-bold tracking-tight sm:text-3xl">
          One platform, three views
        </motion.h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            {
              icon: Users,
              title: "Customers",
              points: ["3-click booking & rescheduling", "Cancel up to the lead time", "Reviews after completed visits"],
            },
            {
              icon: CalendarCheck,
              title: "Providers (staff)",
              points: ["Set weekly availability", "Confirm, complete, no-show", "See only their own diary"],
            },
            {
              icon: BarChart3,
              title: "Business owner",
              points: ["Revenue, no-shows, peak hours", "Services & staff management", "CSV export for the accountant"],
            },
          ].map((r, i) => (
            <motion.div key={r.title} {...fadeUp} transition={{ ...fadeUp.transition, delay: i * 0.08 }}>
              <Card className="h-full">
                <CardContent className="flex flex-col gap-4 p-6">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <r.icon className="size-5" />
                  </span>
                  <p className="text-lg font-semibold">{r.title}</p>
                  <ul className="flex flex-col gap-2">
                    {r.points.map((p) => (
                      <li key={p} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                        {p}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA banner */}
      <section className="mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6">
        <motion.div
          {...fadeUp}
          className="relative overflow-hidden rounded-2xl bg-primary px-6 py-12 text-primary-foreground sm:px-12"
        >
          <div aria-hidden className="absolute -right-16 -top-16 size-56 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Ready to stop losing slots?
              </h2>
              <p className="mt-2 max-w-lg text-primary-foreground/80">
                Book as a guest account in seconds, or sign in with a demo role to
                explore the staff and owner tools.
              </p>
            </div>
            <div className="flex gap-3">
              <Button size="lg" variant="secondary" onClick={() => nav("auth")}>
                Sign in
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10"
                onClick={() => nav("browse")}
              >
                Browse services
              </Button>
            </div>
          </div>
        </motion.div>
      </section>
    </div>
  );
}

/* ─── Live activity ticker ──────────────────────────────────────────────── */

interface ActivityItem {
  id: string;
  service: string;
  category: string;
  providerName: string;
  price: number;
  createdAt: string;
}

function relativeTime(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Slim social-proof band under the hero: a pulsing LIVE badge, the number of
 * bookings made in the last 24 hours, and an auto-rotating one-line feed of
 * what was just booked (service + provider only — never the customer).
 */
function LiveTicker() {
  const { data } = useApiQuery<{ items: ActivityItem[]; count24h: number }>(
    "/api/activity?limit=8",
  );
  const [index, setIndex] = useState(0);
  const items = data?.items ?? [];

  useEffect(() => {
    if (items.length <= 1) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % items.length), 3500);
    return () => clearInterval(id);
  }, [items.length]);

  if (items.length === 0) return null;
  const current = items[index % items.length]!;

  return (
    <section
      className="border-b bg-primary/[0.04] dark:bg-primary/[0.07]"
      aria-label="Recent booking activity"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-2 animate-ping rounded-full bg-emerald-500 opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
          </span>
          Live
        </span>
        <span className="shrink-0 text-sm text-muted-foreground">
          <strong className="font-semibold text-foreground">{data?.count24h ?? 0}</strong>{" "}
          bookings in the last 24h
        </span>
        <span className="hidden h-4 w-px shrink-0 bg-border sm:block" aria-hidden />
        <div className="relative min-w-0 flex-1 overflow-hidden text-sm" aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={current.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.35 }}
              className="flex min-w-0 items-center gap-2 truncate"
            >
              <CalendarCheck2 className="size-4 shrink-0 text-primary" />
              <span className="truncate">
                <strong className="font-medium">{current.service}</strong>
                <span className="text-muted-foreground"> with {current.providerName}</span>
                <span className="text-muted-foreground/70"> · {relativeTime(current.createdAt)}</span>
              </span>
            </motion.p>
          </AnimatePresence>
        </div>
        <div className="hidden shrink-0 items-center gap-1 sm:flex" aria-hidden>
          {items.slice(0, 5).map((it, i) => (
            <button
              key={it.id}
              type="button"
              onClick={() => setIndex(items.indexOf(it))}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === index % items.length ? "w-5 bg-primary" : "w-1.5 bg-border hover:bg-muted-foreground/40",
              )}
              aria-label={`Show activity ${i + 1}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
