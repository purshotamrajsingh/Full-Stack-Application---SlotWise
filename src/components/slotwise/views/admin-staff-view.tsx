"use client";

import { useMemo, useState } from "react";
import { Loader2, Mail, Pencil, Plane, Plus, Star, Trash2, UserRoundCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/slotwise/empty-state";
import { StarRating } from "@/components/slotwise/star-rating";
import { useApiQuery } from "@/hooks/use-api-query";
import { apiFetch } from "@/lib/client-api";
import { fmtDateShortUTC, fmtDateUTC, fmtTimeUTC, initials } from "@/lib/format";
import type { AdminTimeOffDTO } from "@/lib/types";

interface ProviderRow {
  id: string;
  userId: string;
  name: string;
  email: string;
  bio: string;
  specialty: string;
  isActive: boolean;
  rating: number;
  reviewCount: number;
  services: { id: string; name: string; category: string; price: number; durationMin: number }[];
}

export function AdminStaffView() {
  const { data, loading, error, reload } = useApiQuery<{ items: ProviderRow[] }>(
    "/api/providers?all=1",
  );
  const { data: servicesData } = useApiQuery<{
    items: { id: string; name: string; category: string }[];
  }>("/api/services?includeInactive=1&sort=name");

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ProviderRow | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // create form
  const [cForm, setCForm] = useState({
    name: "",
    email: "",
    password: "",
    specialty: "",
    bio: "",
    serviceIds: [] as string[],
  });

  // edit form
  const [eForm, setEForm] = useState({
    specialty: "",
    bio: "",
    isActive: true,
    serviceIds: [] as string[],
  });

  const providers = data?.items ?? [];

  async function createStaff(e: React.FormEvent) {
    e.preventDefault();
    if (
      !cForm.name.trim() ||
      !cForm.email.trim() ||
      cForm.password.length < 8 ||
      cForm.serviceIds.length === 0
    ) {
      toast.error("Name, email, an 8+ char password and at least one service are required.");
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch("/api/providers", {
        method: "POST",
        body: {
          name: cForm.name.trim(),
          email: cForm.email.trim(),
          password: cForm.password,
          specialty: cForm.specialty.trim() || undefined,
          bio: cForm.bio.trim() || undefined,
          serviceIds: cForm.serviceIds,
        },
      });
      toast.success("Staff account created — share the credentials with them.");
      setCreating(false);
      setCForm({ name: "", email: "", password: "", specialty: "", bio: "", serviceIds: [] });
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create staff.");
    } finally {
      setSubmitting(false);
    }
  }

  function openEdit(p: ProviderRow) {
    setEditing(p);
    setEForm({
      specialty: p.specialty,
      bio: p.bio,
      isActive: p.isActive,
      serviceIds: p.services.map((s) => s.id),
    });
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSubmitting(true);
    try {
      await apiFetch(`/api/providers/${editing.id}`, {
        method: "PATCH",
        body: {
          specialty: eForm.specialty.trim(),
          bio: eForm.bio.trim(),
          isActive: eForm.isActive,
          serviceIds: eForm.serviceIds,
        },
      });
      toast.success("Staff profile updated.");
      setEditing(null);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSubmitting(false);
    }
  }

  const serviceOptions = useMemo(() => servicesData?.items ?? [], [servicesData]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {providers.length} staff member{providers.length === 1 ? "" : "s"}
        </p>
        <Button onClick={() => setCreating(true)}>
          <Plus className="size-4" /> Add staff
        </Button>
      </div>

      {error ? (
        <EmptyState icon={UserRoundCheck} title="Could not load staff" description={error} />
      ) : loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : providers.length === 0 ? (
        <EmptyState
          icon={UserRoundCheck}
          title="No staff yet"
          description="Add your first provider so services become bookable."
          actionLabel="Add staff"
          onAction={() => setCreating(true)}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {providers.map((p) => (
            <Card key={p.id} className="py-0">
              <CardContent className="flex flex-col gap-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                      {initials(p.name)}
                    </span>
                    <div>
                      <p className="font-semibold leading-tight">{p.name}</p>
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Mail className="size-3" />
                        {p.email}
                      </p>
                    </div>
                  </div>
                  <Badge variant={p.isActive ? "default" : "outline"}>
                    {p.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>

                {p.specialty && (
                  <p className="text-sm text-muted-foreground">{p.specialty}</p>
                )}
                {p.reviewCount > 0 ? (
                  <StarRating value={p.rating} count={p.reviewCount} />
                ) : (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Star className="size-3" /> No reviews yet
                  </p>
                )}

                <div className="flex flex-wrap gap-1.5">
                  {p.services.map((s) => (
                    <Badge key={s.id} variant="secondary" className="font-normal">
                      {s.name}
                    </Badge>
                  ))}
                  {p.services.length === 0 && (
                    <Badge variant="outline" className="text-muted-foreground">
                      No services assigned
                    </Badge>
                  )}
                </div>

                <div className="mt-1 flex justify-end">
                  <Button size="sm" variant="outline" onClick={() => openEdit(p)}>
                    <Pencil className="size-3.5" /> Edit profile
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Upcoming closures across the whole team */}
      <TimeOffOverview onChanged={reload} />

      {/* Create dialog */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-h-[90vh] overflow-y-auto scrollbar-slim sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New staff account</DialogTitle>
            <DialogDescription>
              They sign in with these credentials and set their own availability.
            </DialogDescription>
          </DialogHeader>
          <form className="flex flex-col gap-4" onSubmit={createStaff}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="st-name">Full name</Label>
                <Input
                  id="st-name"
                  required
                  value={cForm.name}
                  onChange={(e) => setCForm({ ...cForm, name: e.target.value })}
                  placeholder="Dr. Jane Smith"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="st-email">Email</Label>
                <Input
                  id="st-email"
                  type="email"
                  required
                  value={cForm.email}
                  onChange={(e) => setCForm({ ...cForm, email: e.target.value })}
                  placeholder="jane@slotwise.test"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="st-password">Temp password</Label>
                <Input
                  id="st-password"
                  type="text"
                  required
                  minLength={8}
                  value={cForm.password}
                  onChange={(e) => setCForm({ ...cForm, password: e.target.value })}
                  placeholder="min 8 characters"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="st-specialty">Specialty</Label>
                <Input
                  id="st-specialty"
                  value={cForm.specialty}
                  onChange={(e) => setCForm({ ...cForm, specialty: e.target.value })}
                  placeholder="e.g. Sports physiotherapy"
                />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="st-bio">Bio</Label>
                <Textarea
                  id="st-bio"
                  maxLength={500}
                  value={cForm.bio}
                  onChange={(e) => setCForm({ ...cForm, bio: e.target.value })}
                  placeholder="Shown to customers next to their name."
                />
              </div>
            </div>
            <ServicePicker
              options={serviceOptions}
              selected={cForm.serviceIds}
              onToggle={(id, checked) =>
                setCForm({
                  ...cForm,
                  serviceIds: checked
                    ? [...cForm.serviceIds, id]
                    : cForm.serviceIds.filter((s) => s !== id),
                })
              }
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="size-4 animate-spin" />}
                Create account
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto scrollbar-slim sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit {editing?.name}</DialogTitle>
            <DialogDescription>
              {editing?.email} — role &amp; login stay unchanged.
            </DialogDescription>
          </DialogHeader>
          <form className="flex flex-col gap-4" onSubmit={saveEdit}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ed-specialty">Specialty</Label>
              <Input
                id="ed-specialty"
                value={eForm.specialty}
                onChange={(e) => setEForm({ ...eForm, specialty: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ed-bio">Bio</Label>
              <Textarea
                id="ed-bio"
                maxLength={500}
                value={eForm.bio}
                onChange={(e) => setEForm({ ...eForm, bio: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="ed-active"
                checked={eForm.isActive}
                onCheckedChange={(v) => setEForm({ ...eForm, isActive: v })}
              />
              <Label htmlFor="ed-active">
                Active {eForm.isActive ? "— bookable" : "— hidden from customers"}
              </Label>
            </div>
            <ServicePicker
              options={serviceOptions}
              selected={eForm.serviceIds}
              onToggle={(id, checked) =>
                setEForm({
                  ...eForm,
                  serviceIds: checked
                    ? [...eForm.serviceIds, id]
                    : eForm.serviceIds.filter((s) => s !== id),
                })
              }
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="size-4 animate-spin" />}
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ServicePicker({
  options,
  selected,
  onToggle,
}: {
  options: { id: string; name: string; category: string }[];
  selected: string[];
  onToggle: (id: string, checked: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label>Services they deliver</Label>
      <div className="flex max-h-44 flex-col gap-2 overflow-y-auto rounded-lg border p-3 scrollbar-slim">
        {options.map((s) => (
          <label key={s.id} className="flex cursor-pointer items-center gap-2.5 text-sm">
            <Checkbox
              checked={selected.includes(s.id)}
              onCheckedChange={(checked) => onToggle(s.id, checked === true)}
            />
            <span className="font-medium">{s.name}</span>
            <span className="text-xs text-muted-foreground">{s.category}</span>
          </label>
        ))}
        {options.length === 0 && (
          <p className="text-sm text-muted-foreground">Create services first.</p>
        )}
      </div>
    </div>
  );
}

/** Renders "Sat, 10 Oct 2026" / "10 Oct – 18 Oct" / "Tue, 6 Oct · 12:00–14:00". */
function fmtTimeOffWindow(startISO: string, endISO: string): string {
  const s = new Date(startISO);
  const e = new Date(endISO);
  const lastInclusive = new Date(e.getTime() - 1);
  const sameDay = s.toISOString().slice(0, 10) === lastInclusive.toISOString().slice(0, 10);
  const fullDay =
    s.getUTCHours() === 0 && s.getUTCMinutes() === 0 &&
    e.getUTCHours() === 0 && e.getUTCMinutes() === 0;
  if (fullDay && sameDay) return fmtDateUTC(startISO);
  if (fullDay)
    return `${fmtDateShortUTC(startISO)} – ${fmtDateShortUTC(lastInclusive.toISOString())}`;
  if (sameDay)
    return `${fmtDateUTC(startISO)} · ${fmtTimeUTC(startISO)}–${fmtTimeUTC(endISO)}`;
  return `${fmtDateShortUTC(startISO)} ${fmtTimeUTC(startISO)} – ${fmtDateShortUTC(endISO)} ${fmtTimeUTC(endISO)}`;
}

/** Admin-wide overview of upcoming time off, with delete (closure lift). */
function TimeOffOverview({ onChanged }: { onChanged: () => void }) {
  const { data, loading, reload } = useApiQuery<{ items: AdminTimeOffDTO[] }>(
    "/api/admin/time-off",
  );
  const [deleteTarget, setDeleteTarget] = useState<AdminTimeOffDTO | null>(null);
  const [deleting, setDeleting] = useState(false);
  const items = data?.items ?? [];

  async function removeWindow() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(
        `/api/providers/me/time-off/${deleteTarget.id}?providerId=${deleteTarget.providerId}`,
        { method: "DELETE" },
      );
      toast.success("Closure removed — those slots are bookable again.");
      setDeleteTarget(null);
      reload();
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove the closure.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card className="py-0 transition-shadow duration-200 hover:shadow-md">
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Plane className="size-4 text-amber-600 dark:text-amber-400" />
            Upcoming closures & time off
          </CardTitle>
          {items.length > 0 && (
            <Badge variant="secondary" className="font-normal">
              {items.length} window{items.length === 1 ? "" : "s"}
            </Badge>
          )}
        </div>
        <CardDescription>
          Every provider's blocked days in one view — remove a window to reopen
          those slots instantly.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-4">
        {loading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="flex items-center gap-2 py-6 text-center text-sm text-muted-foreground">
            <Plane className="size-4 shrink-0 opacity-60" />
            No upcoming time off — the whole team is at work.
          </p>
        ) : (
          <ul className="list-row-hover max-h-96 divide-y overflow-y-auto scrollbar-slim">
            {items.map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
                  <Plane className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold leading-tight">
                    {t.providerName}
                    {t.specialty && (
                      <span className="font-normal text-muted-foreground"> · {t.specialty}</span>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {fmtTimeOffWindow(t.startAt, t.endAt)}
                    {t.reason && <> — {t.reason}</>}
                  </p>
                </div>
                {t.conflicts > 0 ? (
                  <Badge
                    variant="outline"
                    className="shrink-0 border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                  >
                    {t.conflicts} booking{t.conflicts === 1 ? "" : "s"} to move
                  </Badge>
                ) : (
                  <Badge variant="outline" className="shrink-0 font-normal text-muted-foreground">
                    No clashes
                  </Badge>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="shrink-0 hover:text-destructive"
                  onClick={() => setDeleteTarget(t)}
                  aria-label={`Remove ${t.providerName}'s time off`}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this closure?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.providerName}'s blocked window
              {deleteTarget ? ` (${fmtTimeOffWindow(deleteTarget.startAt, deleteTarget.endAt)})` : ""}{" "}
              will be deleted and those hours become bookable again. Affected
              customers keep their bookings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep closure</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={removeWindow} disabled={deleting}>
              Remove closure
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
