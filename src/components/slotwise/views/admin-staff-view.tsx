"use client";

import { useMemo, useState } from "react";
import { Loader2, Mail, Pencil, Plus, Star, UserRoundCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
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
import { initials } from "@/lib/format";

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
