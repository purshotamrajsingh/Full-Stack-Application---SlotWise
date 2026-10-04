"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CalendarCheck2,
  Download,
  Star,
  TrendingUp,
  UserRound,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { StatusBadge } from "@/components/slotwise/status-badge";
import { AdminServicesView } from "@/components/slotwise/views/admin-services-view";
import { AdminStaffView } from "@/components/slotwise/views/admin-staff-view";
import { AdminBookingsView } from "@/components/slotwise/views/admin-bookings-view";
import { useUIStore } from "@/store/ui-store";
import { useApiQuery } from "@/hooks/use-api-query";
import { downloadCsv } from "@/lib/client-api";
import type { DashboardDTO } from "@/lib/types";
import { fmtDateShortUTC, fmtMoney, fmtTimeUTC, initials, statusMeta } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  PENDING: "var(--chart-2)",
  CONFIRMED: "var(--chart-1)",
  COMPLETED: "var(--chart-4)",
  CANCELLED: "var(--chart-3)",
  NO_SHOW: "var(--chart-5)",
};

export function AdminView() {
  const tab = useUIStore((s) => s.adminTab);
  const setTab = useUIStore((s) => s.setAdminTab);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Business dashboard</h1>
          <p className="mt-1 text-muted-foreground">
            Revenue, no-shows, peak hours and staff performance — live from the booking database.
          </p>
        </div>
      </div>

      <TabsNav tab={tab} setTab={setTab} />

      {tab === "overview" && <OverviewSection />}
      {tab === "services" && <AdminServicesView />}
      {tab === "staff" && <AdminStaffView />}
      {tab === "bookings" && <AdminBookingsView />}
    </div>
  );
}

function TabsNav({
  tab,
  setTab,
}: {
  tab: string;
  setTab: (t: "overview" | "services" | "staff" | "bookings") => void;
}) {
  const tabs = [
    { value: "overview", label: "Overview" },
    { value: "services", label: "Services" },
    { value: "staff", label: "Staff" },
    { value: "bookings", label: "Bookings" },
  ];
  return (
    <div className="mb-6 -mx-4 flex gap-1 overflow-x-auto px-4 pb-1 no-scrollbar sm:mx-0 sm:px-0">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => setTab(t.value as "overview" | "services" | "staff" | "bookings")}
          className={cn(
            "shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
            tab === t.value
              ? "bg-secondary text-secondary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function OverviewSection() {
  const [range, setRange] = useState("30");
  const [exporting, setExporting] = useState(false);

  const { data, loading, error } = useApiQuery<DashboardDTO>(
    `/api/dashboard/summary?range=${range}`,
  );

  async function exportCsv() {
    setExporting(true);
    try {
      await downloadCsv(`/api/dashboard/export?range=${range}`);
      toast.success("CSV exported.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  if (error) {
    return (
      <Card className="py-0 border-destructive/40">
        <CardContent className="p-6 text-sm text-destructive">{error}</CardContent>
      </Card>
    );
  }

  const k = data?.kpis;

  return (
    <div className="flex flex-col gap-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="w-36" aria-label="Date range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" onClick={exportCsv} disabled={exporting || loading}>
          <Download className="size-4" />
          Export CSV
        </Button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          loading={loading}
          icon={Banknote}
          label="Revenue (completed)"
          value={k ? fmtMoney(k.revenue) : undefined}
          sub={k ? `${fmtMoney(k.expectedRevenue)} expected` : undefined}
          tone="good"
          delta={k ? { pct: k.revenueDeltaPct, prev: fmtMoney(k.prevRevenue), label: "vs prev period" } : undefined}
        />
        <Kpi
          loading={loading}
          icon={CalendarCheck2}
          label="Bookings"
          value={k ? String(k.totalBookings) : undefined}
          sub={k ? `${k.upcomingBookings} upcoming` : undefined}
          delta={k ? { pct: k.bookingsDeltaPct, prev: String(k.prevTotalBookings), label: "vs prev period" } : undefined}
        />
        <Kpi
          loading={loading}
          icon={TrendingUp}
          label="No-show rate"
          value={k ? `${k.noShowRate}%` : undefined}
          sub={k ? `${k.cancelRate}% cancelled` : undefined}
          tone={k && k.noShowRate > 15 ? "bad" : "neutral"}
          delta={k ? { pct: k.noShowDeltaPct, prev: `${k.prevNoShowRate}%`, label: "vs prev period", goodWhenDown: true } : undefined}
        />
        <Kpi
          loading={loading}
          icon={Star}
          label="Avg rating"
          value={k ? k.avgRating.toFixed(1) : undefined}
          sub={k ? `${k.activeCustomers} active customers` : undefined}
          tone="good"
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Bookings per day"
          description={`Non-cancelled bookings, last ${range} days`}
          loading={loading}
        >
          <BookingsPerDayChart data={data?.bookingsPerDay ?? []} />
        </ChartCard>

        <ChartCard
          title="Revenue by service"
          description="Completed bookings only"
          loading={loading}
        >
          <RevenueByServiceChart data={data?.revenueByService ?? []} />
        </ChartCard>

        <ChartCard
          title="Peak hours"
          description="When customers actually book"
          loading={loading}
        >
          <PeakHoursChart data={data?.peakHours ?? []} />
        </ChartCard>

        <ChartCard
          title="Status mix"
          description="Booking outcomes in range"
          loading={loading}
        >
          <StatusDonut data={data?.statusMix ?? []} />
        </ChartCard>
      </div>

      {/* Top providers + categories */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="py-0">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="size-4.5 text-primary" /> Top providers
            </CardTitle>
            <CardDescription>By completed revenue in range</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 p-5">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12" />)
            ) : (data?.topProviders ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No bookings yet.</p>
            ) : (
              (data?.topProviders ?? []).map((p) => {
                const max = data!.topProviders[0]!.revenue || 1;
                return (
                  <div key={p.providerId} className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {initials(p.name)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {p.bookings} bookings · ★ {p.rating.toFixed(1)}
                      </span>
                      <span className="text-sm font-bold tabular-nums">{fmtMoney(p.revenue)}</span>
                    </div>
                    <Progress value={(p.revenue / max) * 100} className="h-1.5" />
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card className="py-0">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="size-4.5 text-primary" /> Revenue by category
            </CardTitle>
            <CardDescription>Which line of business pays the bills</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 p-5">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12" />)
            ) : (data?.categoryMix ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No data yet.</p>
            ) : (
              (data?.categoryMix ?? []).map((c) => {
                const max = data!.categoryMix[0]!.revenue || 1;
                return (
                  <div key={c.category} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{c.category}</span>
                      <span className="text-muted-foreground">
                        {c.bookings} bookings ·{" "}
                        <span className="font-bold tabular-nums text-foreground">
                          {fmtMoney(c.revenue)}
                        </span>
                      </span>
                    </div>
                    <Progress value={(c.revenue / max) * 100} className="h-1.5" />
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent bookings */}
      <Card className="py-0">
        <CardHeader className="border-b">
          <CardTitle className="text-base">Latest bookings</CardTitle>
          <CardDescription>Most recently created</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto scrollbar-slim">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3 font-medium">When</th>
                  <th className="px-5 py-3 font-medium">Service</th>
                  <th className="hidden px-5 py-3 font-medium sm:table-cell">Provider</th>
                  <th className="hidden px-5 py-3 font-medium md:table-cell">Customer</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b">
                        <td colSpan={5} className="px-5 py-3">
                          <Skeleton className="h-5" />
                        </td>
                      </tr>
                    ))
                  : (data?.recentBookings ?? []).map((b) => (
                      <tr key={b.id} className="border-b last:border-0">
                        <td className="whitespace-nowrap px-5 py-3 tabular-nums">
                          {fmtDateShortUTC(b.startAt)} {fmtTimeUTC(b.startAt)}
                        </td>
                        <td className="px-5 py-3">{b.serviceName}</td>
                        <td className="hidden px-5 py-3 text-muted-foreground sm:table-cell">
                          {b.providerName}
                        </td>
                        <td className="hidden px-5 py-3 text-muted-foreground md:table-cell">
                          {b.customerName}
                        </td>
                        <td className="px-5 py-3">
                          <StatusBadge status={b.status} />
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  tone,
  delta,
  loading,
}: {
  icon: typeof Banknote;
  label: string;
  value?: string;
  sub?: string;
  tone?: "good" | "bad" | "neutral";
  /** Previous-period comparison pill. */
  delta?: {
    pct: number | null;
    prev: string;
    label: string;
    /** For metrics where a decrease is good (e.g. no-show rate). */
    goodWhenDown?: boolean;
  };
  loading?: boolean;
}) {
  const deltaTone =
    delta?.pct == null
      ? null
      : delta.pct === 0
        ? "flat"
        : (delta.pct > 0) !== (delta.goodWhenDown ?? false)
          ? "up"
          : "down";

  return (
    <Card className="py-0">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className="size-3.5" />
          {label}
        </div>
        {loading || value === undefined ? (
          <Skeleton className="mt-2 h-8 w-24" />
        ) : (
          <p
            className={cn(
              "mt-1 text-2xl font-bold leading-tight tabular-nums",
              tone === "good" && "text-emerald-700 dark:text-emerald-400",
              tone === "bad" && "text-rose-700 dark:text-rose-400",
            )}
          >
            {value}
          </p>
        )}
        {sub && !loading && (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            {tone === "good" && <ArrowUpRight className="size-3" />}
            {tone === "bad" && <ArrowDownRight className="size-3" />}
            {sub}
          </p>
        )}
        {delta && !loading && (
          <div className="mt-2 flex items-center gap-1.5">
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                deltaTone === "up" &&
                  "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
                deltaTone === "down" &&
                  "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300",
                (deltaTone === "flat" || deltaTone === null) &&
                  "bg-muted text-muted-foreground",
              )}
              title={`${delta.label}: was ${delta.prev}`}
            >
              {deltaTone === "up" && <ArrowUpRight className="size-3" />}
              {deltaTone === "down" && <ArrowDownRight className="size-3" />}
              {delta.pct == null ? "n/a" : `${delta.pct > 0 ? "+" : ""}${delta.pct}%`}
            </span>
            <span className="text-[10px] text-muted-foreground">{delta.label}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ChartCard({
  title,
  description,
  children,
  loading,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  loading: boolean;
}) {
  return (
    <Card className="py-0">
      <CardHeader className="border-b">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-4">
        {loading ? <Skeleton className="h-56 w-full" /> : children}
      </CardContent>
    </Card>
  );
}

function BookingsPerDayChart({ data }: { data: DashboardDTO["bookingsPerDay"] }) {
  const config = {
    bookings: { label: "Bookings", color: "var(--chart-1)" },
  } satisfies ChartConfig;

  return (
    <ChartContainer config={config} className="h-56 w-full">
      <AreaChart data={data} margin={{ left: -8, right: 8, top: 8 }}>
        <defs>
          <linearGradient id="fillBookings" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-bookings)" stopOpacity={0.7} />
            <stop offset="95%" stopColor="var(--color-bookings)" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
        />
        <YAxis tickLine={false} axisLine={false} tickMargin={4} width={36} allowDecimals={false} />
        <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
        <Area
          dataKey="bookings"
          type="monotone"
          stroke="var(--color-bookings)"
          strokeWidth={2}
          fill="url(#fillBookings)"
        />
      </AreaChart>
    </ChartContainer>
  );
}

function RevenueByServiceChart({ data }: { data: DashboardDTO["revenueByService"] }) {
  const config = {
    revenue: { label: "Revenue", color: "var(--chart-2)" },
  } satisfies ChartConfig;

  return (
    <ChartContainer config={config} className="h-56 w-full">
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        <XAxis type="number" hide />
        <YAxis
          dataKey="service"
          type="category"
          tickLine={false}
          axisLine={false}
          width={150}
          tick={{ fontSize: 11 }}
        />
        <ChartTooltip
          content={<ChartTooltipContent indicator="line" formatter={(v) => fmtMoney(Number(v))} />}
        />
        <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[0, 4, 4, 0]} barSize={16} />
      </BarChart>
    </ChartContainer>
  );
}

function PeakHoursChart({ data }: { data: DashboardDTO["peakHours"] }) {
  const config = {
    bookings: { label: "Bookings", color: "var(--chart-4)" },
  } satisfies ChartConfig;

  return (
    <ChartContainer config={config} className="h-56 w-full">
      <BarChart data={data} margin={{ left: -8, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} interval={1} />
        <YAxis tickLine={false} axisLine={false} width={36} allowDecimals={false} />
        <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
        <Bar dataKey="bookings" fill="var(--color-bookings)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}

function StatusDonut({ data }: { data: DashboardDTO["statusMix"] }) {
  const config = Object.fromEntries(
    data.map((d) => [
      d.status,
      { label: statusMeta(d.status).label, color: STATUS_COLORS[d.status] },
    ]),
  ) satisfies ChartConfig;

  const total = data.reduce((s, d) => s + d.count, 0);

  return (
    <div className="flex h-56 items-center justify-center">
      <ChartContainer config={config} className="aspect-square h-full justify-center">
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent nameKey="status" hideLabel />} />
          <Pie
            data={data}
            dataKey="count"
            nameKey="status"
            innerRadius={54}
            outerRadius={82}
            paddingAngle={3}
            strokeWidth={2}
          >
            {data.map((d) => (
              <Cell key={d.status} fill={STATUS_COLORS[d.status]} />
            ))}
          </Pie>
          <ChartLegend content={<ChartLegendContent nameKey="status" />} className="flex-wrap" />
        </PieChart>
      </ChartContainer>
      <div className="flex flex-col items-center">
        <span className="text-2xl font-bold tabular-nums">{total}</span>
        <span className="text-xs text-muted-foreground">total</span>
      </div>
    </div>
  );
}
