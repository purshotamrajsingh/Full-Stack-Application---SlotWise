"use client";

import { useState } from "react";
import {
  CalendarCheck,
  Eye,
  EyeOff,
  Loader2,
  LogIn,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuthStore } from "@/store/auth-store";
import { useUIStore } from "@/store/ui-store";

const DEMO_ACCOUNTS = [
  { email: "admin@slotwise.test", label: "Owner · full dashboard" },
  { email: "priya@slotwise.test", label: "Provider · staff schedule" },
  { email: "sam@slotwise.test", label: "Customer · booking flow" },
];
const DEMO_PASSWORD = "Password#123";

export function AuthView() {
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const authIntent = useUIStore((s) => s.authIntent);
  const nav = useUIStore((s) => s.nav);

  const [mode, setMode] = useState<"login" | "register">("login");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [regForm, setRegForm] = useState({ name: "", email: "", password: "" });

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const user = await login(loginForm.email, loginForm.password);
      toast.success(`Welcome back, ${user.name.split(" ")[0]}!`);
      navAfterLogin(user.role);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const user = await register(regForm.name, regForm.email, regForm.password);
      toast.success(`Welcome to SlotWise, ${user.name.split(" ")[0]}!`);
      navAfterLogin(user.role);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setSubmitting(false);
    }
  }

  function navAfterLogin(role: string) {
    if (role === "ADMIN") nav("admin");
    else if (role === "PROVIDER") nav("provider");
    else nav("browse");
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-12 sm:px-6">
      <div className="text-center">
        <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md">
          <CalendarCheck className="size-6" />
        </span>
        <h1 className="text-2xl font-bold tracking-tight">Welcome to SlotWise</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One account for booking, schedule and analytics.
        </p>
      </div>

      {authIntent && (
        <Alert>
          <Sparkles className="size-4" />
          <AlertDescription>{authIntent}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="pb-2">
          <Tabs value={mode} onValueChange={(v) => setMode(v as "login" | "register")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login" className="gap-1.5">
                <LogIn className="size-4" /> Sign in
              </TabsTrigger>
              <TabsTrigger value="register" className="gap-1.5">
                <UserPlus className="size-4" /> Register
              </TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="mt-4">
              <CardTitle className="text-base">Sign in</CardTitle>
              <CardDescription>Use your email and password.</CardDescription>
            </TabsContent>
            <TabsContent value="register" className="mt-4">
              <CardTitle className="text-base">Create a customer account</CardTitle>
              <CardDescription>
                Staff accounts are provisioned by the business owner.
              </CardDescription>
            </TabsContent>
          </Tabs>
        </CardHeader>
        <CardContent>
          {mode === "login" ? (
            <form className="flex flex-col gap-4" onSubmit={handleLogin}>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="login-email">Email</Label>
                <Input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={loginForm.email}
                  onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="login-password">Password</Label>
                <div className="relative">
                  <Input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={loginForm.password}
                    onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword((s) => !s)}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" disabled={submitting} className="h-11">
                {submitting && <Loader2 className="size-4 animate-spin" />}
                Sign in
              </Button>
            </form>
          ) : (
            <form className="flex flex-col gap-4" onSubmit={handleRegister}>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reg-name">Full name</Label>
                <Input
                  id="reg-name"
                  autoComplete="name"
                  required
                  minLength={2}
                  value={regForm.name}
                  onChange={(e) => setRegForm({ ...regForm, name: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reg-email">Email</Label>
                <Input
                  id="reg-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={regForm.email}
                  onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reg-password">Password</Label>
                <div className="relative">
                  <Input
                    id="reg-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={regForm.password}
                    onChange={(e) => setRegForm({ ...regForm, password: e.target.value })}
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword((s) => !s)}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">At least 8 characters.</p>
              </div>
              <Button type="submit" disabled={submitting} className="h-11">
                {submitting && <Loader2 className="size-4 animate-spin" />}
                Create account
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Demo quick-fill */}
      <Card className="border-dashed bg-muted/40">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Sparkles className="size-4 text-primary" />
            Demo accounts
          </CardTitle>
          <CardDescription>
            Click to fill the form — password is <code>Password#123</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {DEMO_ACCOUNTS.map((acc) => (
            <button
              key={acc.email}
              type="button"
              className="flex items-center justify-between rounded-lg border bg-card px-3 py-2.5 text-left text-sm transition-colors hover:border-primary/50 hover:bg-secondary/60"
              onClick={() => {
                setMode("login");
                setLoginForm({ email: acc.email, password: DEMO_PASSWORD });
                toast(`Filled ${acc.email}`);
              }}
            >
              <span className="font-medium">{acc.email}</span>
              <span className="text-xs text-muted-foreground">{acc.label}</span>
            </button>
          ))}
        </CardContent>
      </Card>

      <p className="text-center text-sm text-muted-foreground">
        Just browsing?{" "}
        <button
          type="button"
          className="font-medium text-primary underline-offset-4 hover:underline"
          onClick={() => nav("browse")}
        >
          Explore services without an account
        </button>
      </p>
    </div>
  );
}
