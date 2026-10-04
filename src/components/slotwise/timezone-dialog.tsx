"use client";

import { useMemo, useState } from "react";
import { Globe, Loader2, MapPin, MonitorSmartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuthStore } from "@/store/auth-store";
import { tzShortLabel } from "@/lib/tz";
import { activeTimezone } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Curated common zones (the full IANA list is ~400 — overkill for a Select). */
const ZONE_GROUPS: { region: string; zones: string[] }[] = [
  {
    region: "Europe",
    zones: ["Europe/London", "Europe/Dublin", "Europe/Paris", "Europe/Berlin", "Europe/Madrid", "Europe/Rome", "Europe/Amsterdam", "Europe/Stockholm", "Europe/Athens", "Europe/Istanbul", "Europe/Lisbon", "Europe/Moscow"],
  },
  {
    region: "Americas",
    zones: ["America/New_York", "America/Toronto", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Mexico_City", "America/Sao_Paulo", "America/Argentina/Buenos_Aires", "America/Vancouver"],
  },
  {
    region: "Asia",
    zones: ["Asia/Karachi", "Asia/Kolkata", "Asia/Dhaka", "Asia/Dubai", "Asia/Riyadh", "Asia/Tehran", "Asia/Bangkok", "Asia/Singapore", "Asia/Hong_Kong", "Asia/Shanghai", "Asia/Seoul", "Asia/Tokyo"],
  },
  {
    region: "Africa & Oceania",
    zones: ["Africa/Cairo", "Africa/Lagos", "Africa/Nairobi", "Africa/Johannesburg", "Australia/Sydney", "Australia/Melbourne", "Australia/Perth", "Pacific/Auckland"],
  },
];

const browserTimezone = (): string | null => {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && tz !== "Etc/Unknown" ? tz : null;
  } catch {
    return null;
  }
};

/**
 * Customer display-timezone picker — every date and time in the customer
 * view renders in the chosen zone (availability and booking MATH stay
 * business-UTC on the server). Staff calendars always show UTC.
 */
export function TimezoneDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const user = useAuthStore((s) => s.user);
  const updateTimezone = useAuthStore((s) => s.updateTimezone);
  const browserTz = useMemo(browserTimezone, []);
  const [selected, setSelected] = useState<string>(user?.timezone ?? "UTC");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const inCurated = (tz: string) =>
    ZONE_GROUPS.some((g) => g.zones.includes(tz)) || tz === "UTC";

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ZONE_GROUPS;
    return ZONE_GROUPS.map((g) => ({
      ...g,
      zones: g.zones.filter((z) => z.toLowerCase().includes(q)),
    })).filter((g) => g.zones.length > 0);
  }, [search]);

  async function save(tz: string) {
    setSaving(true);
    try {
      await updateTimezone(tz);
      toast.success(`Times now shown in ${tzShortLabel(tz)} — ${tz.split("/").pop()?.replace(/_/g, " ")}`, {
        description: "Refreshing so every view picks up your time zone…",
      });
      setTimeout(() => window.location.reload(), 900);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the timezone.");
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="size-5 text-primary" />
            Your time zone
          </DialogTitle>
          <DialogDescription>
            Every time you see — search results, booking slots, your
            appointments — renders in this zone. Availability and
            double-booking checks stay exact behind the scenes.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium">Current</p>
              <p className="truncate text-xs text-muted-foreground">
                {activeTimezone()} · {tzShortLabel(selected)}
              </p>
            </div>
            {browserTz && browserTz !== selected && (
              <Button
                size="sm"
                variant="outline"
                className="press shrink-0"
                disabled={saving}
                onClick={() => save(browserTz)}
              >
                <MonitorSmartphone className="size-3.5" />
                Use {browserTz.split("/").pop()?.replace(/_/g, " ")}
              </Button>
            )}
          </div>

          {browserTz && !inCurated(browserTz) && (
            <p className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" />
              Your browser zone {browserTz} isn&apos;t in the quick list — the
              button above still uses it.
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tz-search">Search</Label>
            <Input
              id="tz-search"
              placeholder="city or region, e.g. “karachi”"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Time zone</Label>
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger aria-label="Display time zone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectGroup>
                  <SelectLabel>Universal</SelectLabel>
                  <SelectItem value="UTC" className="tabular-nums">
                    UTC — business time
                  </SelectItem>
                </SelectGroup>
                {filteredGroups.map((g) => (
                  <SelectGroup key={g.region}>
                    <SelectLabel>{g.region}</SelectLabel>
                    {g.zones.map((z) => (
                      <SelectItem key={z} value={z} className="tabular-nums">
                        {z.split("/").pop()?.replace(/_/g, " ")} ·{" "}
                        {tzShortLabel(z)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
                {filteredGroups.length === 0 && (
                  <p className="px-3 py-2 text-sm text-muted-foreground">
                    No zones match “{search}”.
                  </p>
                )}
                {!inCurated(selected) && selected !== "UTC" && (
                  <SelectGroup>
                    <SelectLabel>Current (outside the quick list)</SelectLabel>
                    <SelectItem value={selected} className="tabular-nums">
                      {selected} · {tzShortLabel(selected)}
                    </SelectItem>
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="press"
            disabled={saving || selected === (user?.timezone ?? "UTC")}
            onClick={() => save(selected)}
          >
            {saving && <Loader2 className="size-4 animate-spin" />}
            <Globe className="size-4" />
            Save time zone
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
