"use client";

import {
  CalendarCheck,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Scissors,
  CalendarRange,
  Search,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/slotwise/theme-toggle";
import { NotificationBell } from "@/components/slotwise/notification-bell";
import { useAuthStore } from "@/store/auth-store";
import { useUIStore, type View } from "@/store/ui-store";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

const ROLE_BADGE: Record<string, string> = {
  ADMIN: "Owner",
  PROVIDER: "Staff",
  CUSTOMER: "Customer",
};

interface NavItem {
  view: View;
  label: string;
  icon: typeof Search;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const view = useUIStore((s) => s.view);
  const nav = useUIStore((s) => s.nav);

  const navItems: NavItem[] = [{ view: "browse", label: "Browse", icon: Search }];
  if (user?.role === "CUSTOMER") {
    navItems.push({ view: "bookings", label: "My bookings", icon: CalendarRange });
  }
  if (user?.role === "PROVIDER") {
    navItems.push({ view: "provider", label: "My schedule", icon: Scissors });
  }
  if (user?.role === "ADMIN") {
    navItems.push({ view: "admin", label: "Dashboard", icon: LayoutDashboard });
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-4 px-4 sm:px-6">
          <button
            type="button"
            className="flex items-center gap-2.5"
            onClick={() => nav(user ? "landing" : "landing")}
            aria-label="SlotWise home"
          >
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <CalendarCheck className="size-5" />
            </span>
            <span className="text-lg font-bold tracking-tight">
              Slot<span className="text-primary">Wise</span>
            </span>
          </button>

          {/* Desktop nav */}
          <nav className="ml-6 hidden items-center gap-1 md:flex" aria-label="Main">
            {navItems.map((item) => (
              <button
                key={item.view}
                type="button"
                onClick={() => nav(item.view)}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  view === item.view
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </button>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {user && <NotificationBell />}
            <ThemeToggle />

            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="gap-2 pl-1.5">
                    <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                      {initials(user.name)}
                    </span>
                    <span className="hidden text-sm font-medium sm:inline">
                      {user.name.split(" ")[0]}
                    </span>
                    <ChevronDown className="size-4 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <p className="font-semibold">{user.name}</p>
                    <p className="truncate text-xs font-normal text-muted-foreground">
                      {user.email}
                    </p>
                    <Badge variant="secondary" className="mt-1.5">
                      {ROLE_BADGE[user.role] ?? user.role}
                    </Badge>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {user.role === "CUSTOMER" && (
                    <DropdownMenuItem onClick={() => nav("bookings")}>
                      <CalendarRange className="size-4" /> My bookings
                    </DropdownMenuItem>
                  )}
                  {user.role === "ADMIN" && (
                    <DropdownMenuItem onClick={() => nav("admin")}>
                      <LayoutDashboard className="size-4" /> Dashboard
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => {
                      logout();
                      nav("landing");
                      toast("Signed out — see you soon!");
                    }}
                  >
                    <LogOut className="size-4" /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button size="sm" onClick={() => nav("auth")}>
                Sign in
              </Button>
            )}

            {/* Mobile nav */}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="md:hidden" aria-label="Menu">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.8}
                    stroke="currentColor"
                    className="size-5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                    />
                  </svg>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72">
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2">
                    <Sparkles className="size-4 text-primary" />
                    SlotWise
                  </SheetTitle>
                </SheetHeader>
                <nav className="flex flex-col gap-1 px-4" aria-label="Mobile">
                  {navItems.map((item) => (
                    <button
                      key={item.view}
                      type="button"
                      onClick={() => nav(item.view)}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                        view === item.view
                          ? "bg-secondary text-secondary-foreground"
                          : "text-muted-foreground hover:bg-muted",
                      )}
                    >
                      <item.icon className="size-4" />
                      {item.label}
                    </button>
                  ))}
                  {!user && (
                    <Button className="mt-3" onClick={() => nav("auth")}>
                      Sign in
                    </Button>
                  )}
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="mt-auto border-t bg-muted/30">
        <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <CalendarCheck className="size-4.5" />
                </span>
                <span className="font-bold tracking-tight">
                  Slot<span className="text-primary">Wise</span>
                </span>
              </div>
              <p className="mt-3 max-w-xs text-sm text-muted-foreground">
                Bookings, staff schedules and live analytics for clinics, salons,
                tutors and therapy practices.
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold">Product</p>
              <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                <li><button className="hover:text-foreground" onClick={() => nav("browse")}>Browse services</button></li>
                <li><button className="hover:text-foreground" onClick={() => nav("auth")}>Sign in / Register</button></li>
                <li>3-click booking · zero double-bookings</li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-semibold">Demo accounts</p>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                <li><code>admin@slotwise.test</code> — owner dashboard</li>
                <li><code>priya@slotwise.test</code> — staff schedule</li>
                <li><code>sam@slotwise.test</code> — customer booking</li>
                <li>Password for all: <code>Password#123</code></li>
              </ul>
            </div>
          </div>
          <div className="mt-8 flex flex-col items-start justify-between gap-2 border-t pt-6 text-xs text-muted-foreground sm:flex-row">
            <p>© 2026 SlotWise · Built for CMS22204 Full Stack Application Development</p>
            <p>All times shown in business timezone (UTC)</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
