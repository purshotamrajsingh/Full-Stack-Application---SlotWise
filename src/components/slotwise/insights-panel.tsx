"use client";

import {
  Banknote,
  CalendarCheck2,
  Clock,
  Star,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { useApiQuery } from "@/hooks/use-api-query";
import type { ProviderAnalyticsDTO } from "@/lib/types";
import { fmtMoney, statusMeta } from "@/lib/format";

const STATUS_COLORS: Record<string, string> = {
  PENDING: "var(--chart-2)",
  CONFIRMED: "var(--chart-1)",
  COMPLETED: "var(--chart-4)",
  CANCELLED: "var(--chart-3)",
  NO_SHOW: "var(--chart-5)",
};

/**
 * The provider portal's Insights tab — personal analytics (last 30 days +
 * 8-week history), mirroring the admin dashboard's visual language.
 */
export function InsightsPanel() {
  const { data, loading, error } = useApiQuery<ProviderAnalyticsDTO>(
    "/api/providers/me/analytics",
  );

  if (error) {
    return (
      <Card className="py-0">
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          Could not load insights — {error}
        </CardContent>
      </Card>
    );
  }

  if (loading || !data) {
    return (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-xl" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-60 rounded-xl" />
          <Skeleton className="h-60 rounded-xl" />
        </div>
      </div>
    );
  }

  const { kpis } = data;

  return (
    <div className="flex flex-col gap-4">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <KpiCard
          icon={Banknote}
          label="Revenue (30d)"
          value={fmtMoney(kpis.revenue30)}
          sub="completed visits"
        />
        <KpiCard
          icon={CalendarCheck2}
          label="Bookings (30d)"
          value={String(kpis.bookings30)}
          sub="excluding cancellations"
        />
        <KpiCard
          icon={Star}
          label="Rating"
          value={kpis.reviewCount > 0 ? kpis.rating.toFixed(1) : "—"}
          sub={`${kpis.reviewCount} reviews`}
        />
        <KpiCard
          icon={TrendingUp}
          label="Utilisation"
          value={`${kpis.utilizationPct}%`}
          sub="of open hours booked"
        />
        <KpiCard
          icon={Users}
          label="Repeat clients"
          value={kpis.repeatCustomerPct !== null ? `${kpis.repeatCustomerPct}%` : "—"}
          sub="2+ bookings in 30d"
        />
        <KpiCard
          icon={Clock}
          label="Upcoming"
          value={String(kpis.upcoming)}
          sub="pending & confirmed"
        />
      </div>

      {/* Weekly performance */}
      <Card className="min-w-0 py-0 transition-shadow duration-200 hover:shadow-md">
        <CardHeader className="border-b">
          <CardTitle className="text-base">Your last 8 weeks</CardTitle>
          <CardDescription>
            Bookings per week (bars) and completed revenue (area) — Mondays as
            week starts, UTC.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0 p-4 pt-4">
          <WeeklyChart data={data.weekly} />
        </CardContent>
      </Card>

      {/* Service mix + status donut */}
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Card className="min-w-0 py-0 transition-shadow duration-200 hover:shadow-md">
          <CardHeader className="border-b">
            <CardTitle className="text-base">Where the money comes from</CardTitle>
            <CardDescription>Completed revenue by service, last 30 days.</CardDescription>
          </CardHeader>
          <CardContent className="min-w-0 p-4 pt-4">
            {data.serviceMix.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No bookings in the last 30 days.
              </p>
            ) : (
              <ServiceMixChart data={data.serviceMix} />
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0 py-0 transition-shadow duration-200 hover:shadow-md">
          <CardHeader className="border-b">
            <CardTitle className="text-base">Outcome mix</CardTitle>
            <CardDescription>Where your last 30 days of bookings ended up.</CardDescription>
          </CardHeader>
          <CardContent className="min-w-0 p-4 pt-4">
            <StatusDonut data={data.statusMix} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <Card className="py-0 transition-shadow duration-200 hover:shadow-md">
      <CardContent className="flex items-center gap-3 p-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
          <Icon className="size-4.5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="truncate text-lg font-bold leading-tight tabular-nums">{value}</p>
          <p className="truncate text-xs text-muted-foreground">{sub}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function WeeklyChart({ data }: { data: ProviderAnalyticsDTO["weekly"] }) {
  const config = {
    bookings: { label: "Bookings", color: "var(--chart-1)" },
    revenue: { label: "Revenue", color: "var(--chart-2)" },
  } satisfies ChartConfig;

  return (
    <ChartContainer config={config} className="h-72 w-full">
      <BarChart data={data} margin={{ left: -8, right: 8, top: 8 }}>
        <defs>
          <linearGradient id="provRevenueFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-revenue)" stopOpacity={0.45} />
            <stop offset="95%" stopColor="var(--color-revenue)" stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
        <YAxis
          yAxisId="left"
          tickLine={false}
          axisLine={false}
          width={36}
          allowDecimals={false}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tickLine={false}
          axisLine={false}
          width={52}
          tickFormatter={(v: number) =>
            v >= 1000 ? `£${Math.round(v / 100) / 10}k` : `£${v}`
          }
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name) =>
                name === "Revenue" ? fmtMoney(Number(value)) : value
              }
            />
          }
        />
        <Bar
          yAxisId="left"
          dataKey="bookings"
          fill="var(--color-bookings)"
          radius={[4, 4, 0, 0]}
          barSize={26}
        />
        <Area
          yAxisId="right"
          dataKey="revenue"
          type="monotone"
          stroke="var(--color-revenue)"
          strokeWidth={2}
          fill="url(#provRevenueFill)"
        />
      </BarChart>
    </ChartContainer>
  );
}

function ServiceMixChart({ data }: { data: ProviderAnalyticsDTO["serviceMix"] }) {
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
          content={
            <ChartTooltipContent indicator="line" formatter={(v) => fmtMoney(Number(v))} />
          }
        />
        <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[0, 4, 4, 0]} barSize={16} />
      </BarChart>
    </ChartContainer>
  );
}

function StatusDonut({ data }: { data: ProviderAnalyticsDTO["statusMix"] }) {
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
