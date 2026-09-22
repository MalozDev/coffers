"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, Mail, Phone, Lock, Loader2 } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          phoneNumber: phone,
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.details) {
          const firstError = Object.values(data.details).flat()[0] as string;
          setError(firstError || "Registration failed. Please try again.");
        } else {
          setError(data.error || "Registration failed. Please try again.");
        }
        return;
      }

      router.push("/dashboard");
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
        <h2 className="text-xl font-bold text-black-400">
          Create your account
        </h2>
        <p className="text-xs text-black-400/50 mt-1">
          Start tracking your finances in minutes
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-2.5">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded-lg px-3 py-2.5">
            {error}
          </div>
        )}

        <div className="space-y-1">
          <Label htmlFor="name" className="text-xs font-medium text-brand-neutral">
            Full Name
          </Label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-brand-neutral" />
            <Input
              id="name"
              type="text"
              placeholder="Stephan Malobeka"
              className="h-10 text-sm pl-9 bg-background border-border text-brand-neutral placeholder:text-brand-neutral focus:border-brand-accent focus:ring-brand-accent/30"
              autoComplete="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="email" className="text-xs font-medium text-brand-neutral">
            Email
          </Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-brand-neutral" />
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              className="h-10 text-sm pl-9 bg-background border-border text-brand-neutral placeholder:text-brand-neutral focus:border-brand-accent focus:ring-brand-accent/30"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="phone" className="text-xs font-medium text-brand-neutral">
            Phone Number
          </Label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-brand-neutral" />
            <Input
              id="phone"
              type="tel"
              placeholder="0 97 123 4567"
              className="h-10 text-sm pl-9 bg-background border-border text-brand-neutral placeholder:text-brand-neutral focus:border-brand-accent focus:ring-brand-accent/30"
              autoComplete="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="password" className="text-xs font-medium text-brand-neutral">
            Password
          </Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-brand-neutral" />
            <Input
              id="password"
              type="password"
              placeholder="At least 8 characters"
              className="h-10 text-sm pl-9 bg-background border-border text-brand-neutral placeholder:text-brand-neutral focus:border-brand-accent focus:ring-brand-accent/30"
              minLength={8}
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </div>

        <div className="bg-background border border-border rounded-lg px-3 py-2.5">
          <p className="text-[11px] text-brand-neutral">
            Default currency:{" "}
            <span className="font-semibold text-brand-secondary">ZMK (Kwacha)</span>
          </p>
        </div>

        <Button
          type="submit"
          className="w-full h-10 text-sm font-semibold bg-brand-secondary hover:bg-brand-secondary text-white rounded-xl transition-all active:scale-[0.98]"
          disabled={loading}
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Creating account...
            </span>
          ) : (
            "Create Account"
          )}
        </Button>
      </form>

      <p className="text-center text-xs text-brand-neutral">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-semibold text-brand-accent active:opacity-70"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
