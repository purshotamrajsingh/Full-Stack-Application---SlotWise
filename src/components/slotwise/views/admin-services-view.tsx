"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
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
import { EmptyState } from "@/components/slotwise/empty-state";
import { useApiQuery, useDebounced } from "@/hooks/use-api-query";
import { apiFetch } from "@/lib/client-api";
import type { ServiceDTO } from "@/lib/types";
import { fmtDuration, fmtMoney } from "@/lib/format";

const DURATIONS = [15, 30, 45, 60, 75, 90, 105, 120, 150, 180];

interface ServiceForm {
  name: string;
  category: string;
  description: string;
  durationMin: number;
  price: string;
  isActive: boolean;
  providerIds: string[];
}

const EMPTY_FORM: ServiceForm = {
  name: "",
  category: "",
  description: "",
  durationMin: 45,
  price: "",
  isActive: true,
  providerIds: [],
};

export function AdminServicesView() {
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search, 300);

  const path = useMemo(() => {
    const params = new URLSearchParams({ includeInactive: "1" });
    if (debounced.trim()) params.set("q", debounced.trim());
    params.set("sort", "name");
    return `/api/services?${params.toString()}`;
  }, [debounced]);

  const { data, loading, error, reload } = useApiQuery<{
    items: ServiceDTO[];
    total: number;
  }>(path);

  const { data: providersData } = useApiQuery<{
    items: { id: string; name: string; specialty: string }[];
  }>("/api/providers?all=1");

  const [editing, setEditing] = useState<ServiceDTO | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<ServiceForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ServiceDTO | null>(null);

  const items = data?.items ?? [];

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setCreating(true);
  }

  function openEdit(svc: ServiceDTO) {
    setEditing(svc);
    setForm({
      name: svc.name,
      category: svc.category,
      description: svc.description,
      durationMin: svc.durationMin,
      price: String(svc.price),
      isActive: svc.isActive,
      providerIds: svc.providers.map((p) => p.id),
    });
    setCreating(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const price = Number(form.price);
    if (!form.name.trim() || !form.category.trim() || Number.isNaN(price) || price < 0) {
      toast.error("Please fill in name, category and a valid price.");
      return;
    }
    setSubmitting(true);
    const body = {
      name: form.name.trim(),
      category: form.category.trim(),
      description: form.description.trim(),
      durationMin: form.durationMin,
      price,
      isActive: form.isActive,
      providerIds: form.providerIds,
    };
    try {
      if (editing) {
        await apiFetch(`/api/services/${editing.id}`, { method: "PUT", body });
        toast.success("Service updated.");
      } else {
        await apiFetch("/api/services", { method: "POST", body });
        toast.success("Service created.");
      }
      setCreating(false);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function remove() {
    if (!deleteTarget) return;
    try {
      const res = await apiFetch<{ deleted: boolean; message: string }>(
        `/api/services/${deleteTarget.id}`,
        { method: "DELETE" },
      );
      toast.success(res.message);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDeleteTarget(null);
    }
  }

  const categories = [...new Set(items.map((s) => s.category))];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search services…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            aria-label="Search services"
          />
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" /> Add service
        </Button>
      </div>

      {error ? (
        <EmptyState icon={Trash2} title="Could not load services" description={error} />
      ) : loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Plus}
          title="No services yet"
          description="Create your first bookable service."
          actionLabel="Add service"
          onAction={openCreate}
        />
      ) : (
        <Card className="py-0">
          <CardContent className="p-0">
            <div className="overflow-x-auto scrollbar-slim">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Service</th>
                    <th className="hidden px-4 py-3 font-medium md:table-cell">Providers</th>
                    <th className="px-4 py-3 font-medium">Duration</th>
                    <th className="px-4 py-3 font-medium">Price</th>
                    <th className="px-4 py-3 font-medium">Bookings</th>
                    <th className="px-4 py-3 font-medium">Active</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((s) => (
                    <tr key={s.id} className="border-b transition-colors last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-3">
                        <p className="font-medium">{s.name}</p>
                        <Badge variant="secondary" className="mt-1 lg:hidden">
                          {s.category}
                        </Badge>
                        <p className="mt-0.5 hidden text-xs text-muted-foreground lg:block">
                          {s.category}
                        </p>
                      </td>
                      <td className="hidden px-4 py-3 md:table-cell">
                        {s.providers.length > 0 ? (
                          <span className="text-muted-foreground">
                            {s.providers.map((p) => p.name).join(", ")}
                          </span>
                        ) : (
                          <Badge variant="outline">Unassigned</Badge>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                        {fmtDuration(s.durationMin)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-medium tabular-nums">
                        {fmtMoney(s.price)}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">
                        {s.bookingCount}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={s.isActive ? "default" : "outline"}
                          className={s.isActive ? "" : "text-muted-foreground"}
                        >
                          {s.isActive ? "Active" : "Hidden"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-8"
                            aria-label={`Edit ${s.name}`}
                            onClick={() => openEdit(s)}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-8 text-muted-foreground hover:text-destructive"
                            aria-label={`Delete ${s.name}`}
                            onClick={() => setDeleteTarget(s)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create / edit dialog */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-h-[90vh] overflow-y-auto scrollbar-slim sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit service" : "New service"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Changes apply to future bookings immediately."
                : "Customers will see it in search as soon as it's active and has a provider."}
            </DialogDescription>
          </DialogHeader>

          <form className="flex flex-col gap-4" onSubmit={submit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="svc-name">Name</Label>
                <Input
                  id="svc-name"
                  required
                  minLength={2}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Hot Stone Massage"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="svc-category">Category</Label>
                <Input
                  id="svc-category"
                  required
                  list="svc-categories"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="e.g. Physiotherapy"
                />
                <datalist id="svc-categories">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="svc-price">Price (£)</Label>
                <Input
                  id="svc-price"
                  required
                  type="number"
                  min={0}
                  step="0.5"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  placeholder="55"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="svc-duration">Duration</Label>
                <select
                  id="svc-duration"
                  className="h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
                  value={form.durationMin}
                  onChange={(e) => setForm({ ...form, durationMin: Number(e.target.value) })}
                >
                  {DURATIONS.map((d) => (
                    <option key={d} value={d}>
                      {fmtDuration(d)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Switch
                  id="svc-active"
                  checked={form.isActive}
                  onCheckedChange={(v) => setForm({ ...form, isActive: v })}
                />
                <Label htmlFor="svc-active">Visible to customers</Label>
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="svc-desc">Description</Label>
                <Textarea
                  id="svc-desc"
                  maxLength={500}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="One or two lines customers see in search results."
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Providers who can deliver it</Label>
              <div className="flex flex-col gap-2 rounded-lg border p-3">
                {(providersData?.items ?? []).map((p) => (
                  <label key={p.id} className="flex cursor-pointer items-center gap-2.5 text-sm">
                    <Checkbox
                      checked={form.providerIds.includes(p.id)}
                      onCheckedChange={(checked) =>
                        setForm({
                          ...form,
                          providerIds: checked
                            ? [...form.providerIds, p.id]
                            : form.providerIds.filter((id) => id !== p.id),
                        })
                      }
                    />
                    <span className="font-medium">{p.name}</span>
                    {p.specialty && (
                      <span className="text-xs text-muted-foreground">{p.specialty}</span>
                    )}
                  </label>
                ))}
                {(providersData?.items ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground">No staff yet — add one in the Staff tab.</p>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="size-4 animate-spin" />}
                {editing ? "Save changes" : "Create service"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleteTarget?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Services with booking history are deactivated instead of deleted so
              your analytics stay intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove}>
              {deleteTarget && deleteTarget.bookingCount > 0 ? "Deactivate" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
