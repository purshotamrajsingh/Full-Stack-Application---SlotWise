"use client";

import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { AppShell } from "@/components/slotwise/app-shell";
import { BookingDialog } from "@/components/slotwise/booking-dialog";
import { ProviderProfileDialog } from "@/components/slotwise/provider-profile-dialog";
import { LandingView } from "@/components/slotwise/views/landing-view";
import { BrowseView } from "@/components/slotwise/views/browse-view";
import { AuthView } from "@/components/slotwise/views/auth-view";
import { MyBookingsView } from "@/components/slotwise/views/my-bookings-view";
import { ProviderView } from "@/components/slotwise/views/provider-view";
import { AdminView } from "@/components/slotwise/views/admin-view";
import { useAuthStore } from "@/store/auth-store";
import { useUIStore, type View } from "@/store/ui-store";

export default function Home() {
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const view = useUIStore((s) => s.view);
  const nav = useUIStore((s) => s.nav);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // Guard role-gated views once the session is resolved.
  useEffect(() => {
    if (status !== "ready") return;
    if (view === "bookings" && user?.role !== "CUSTOMER") nav("landing");
    if (view === "provider" && user?.role !== "PROVIDER") nav("landing");
    if (view === "admin" && user?.role !== "ADMIN") nav("landing");
  }, [view, user, status, nav]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
        <Loader2 className="size-7 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Starting SlotWise…</p>
      </div>
    );
  }

  let content: React.ReactNode;
  switch (view) {
    case "browse":
      content = <BrowseView />;
      break;
    case "auth":
      content = <AuthView />;
      break;
    case "bookings":
      content = user?.role === "CUSTOMER" ? <MyBookingsView /> : <LandingView />;
      break;
    case "provider":
      content = user?.role === "PROVIDER" ? <ProviderView /> : <LandingView />;
      break;
    case "admin":
      content = user?.role === "ADMIN" ? <AdminView /> : <LandingView />;
      break;
    default:
      content = <LandingView />;
  }

  return (
    <AppShell>
      <AnimatePresence mode="wait">
        <motion.div
          key={view}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="min-h-[60vh]"
        >
          {content}
        </motion.div>
      </AnimatePresence>

      {/* Global booking/reschedule dialog (hidden while on the auth view) */}
      {view !== "auth" && <BookingDialog />}
      {/* Public provider profile dialog */}
      {view !== "auth" && <ProviderProfileDialog />}
    </AppShell>
  );
}
