"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Lock, Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") || "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Login failed. Please try again.");
        return;
      }

      router.push(from);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="text-xl font-bold text-brand-secondary tracking-tight">
          Welcome back
        </h2>
        <p className="text-xs text-brand-neutral/50 mt-1">
          Sign in to continue to Coffers
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded-lg px-3 py-2.5">
            {error}
          </div>
        )}

        <div className="space-y-1">
          <Label htmlFor="email" className="text-xs font-medium text-brand-neutral/60">
            Email
          </Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-brand-neutral/30" />
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              className="h-10 text-sm pl-9 bg-background border-border text-brand-neutral placeholder:text-brand-neutral/30 focus:border-brand-accent focus:ring-brand-accent/30"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="text-xs font-medium text-brand-neutral/60">
              Password
            </Label>
            <Link
              href="#"
              className="text-[11px] text-brand-accent font-medium active:opacity-70"
            >
              Forgot?
            </Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-brand-neutral/30" />
            <Input
              id="password"
              type="password"
              placeholder="Enter your password"
              className="h-10 text-sm pl-9 bg-background border-border text-brand-neutral placeholder:text-brand-neutral/30 focus:border-brand-accent focus:ring-brand-accent/30"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </div>

        <Button
          type="submit"
          className="w-full h-10 text-sm font-semibold bg-brand-secondary hover:bg-brand-secondary/90 text-white rounded-xl transition-all active:scale-[0.98]"
          disabled={loading}
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Signing in...
            </span>
          ) : (
            "Sign In"
          )}
        </Button>
      </form>

      <p className="text-center text-xs text-brand-neutral/40">
        Don&apos;t have an account?{" "}
        <Link
          href="/register"
          className="font-semibold text-brand-accent active:opacity-70"
        >
          Create one
        </Link>
      </p>
    </div>
  );
}
