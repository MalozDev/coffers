"use client";

import Link from "next/link";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  BarChart3,
  Shield,
  Bell,
  PiggyBank,
} from "lucide-react";
import Image from "next/image";

const features = [
  { icon: ArrowDownCircle, label: "Track Income" },
  { icon: ArrowUpCircle, label: "Manage Expenses" },
  { icon: BarChart3, label: "Smart Analysis" },
  { icon: Shield, label: "Budget & Save" },
  { icon: Bell, label: "Reminders" },
  { icon: PiggyBank, label: "Savings Goals" },
];

export default function HomePage() {
  return (
    <div className="h-dvh bg-background flex flex-col overflow-hidden">
      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        {/* Logo */}
        <div className="relative w-16 h-16 rounded-2xl overflow-hidden shadow-card border border-border mb-4">
          <Image
            src="/coffers-logo.png"
            alt="Coffers Logo"
            fill
            className="object-cover"
            priority
          />
        </div>

        {/* Name */}
        <h1 className="text-3xl font-extrabold text-brand-secondary tracking-tight">
          Coffers
        </h1>

        {/* Big description */}
        <p className="mt-3 max-w-xs leading-relaxed" style={{ color: '#000' }}>
          <span className="block text-2xl font-extrabold">
            Know where your money went.
          </span>
          <span className="block text-xl font-bold" style={{ color: '#3066be' }}>
            Know where it&apos;s going.
          </span>
        </p>

        {/* Buttons */}
        <div className="flex gap-3 mt-6 w-full max-w-xs">
          <Link
            href="/login"
            className="inline-flex items-center justify-center flex-1 h-11 rounded-xl border border-brand-secondary/20 bg-white text-brand-secondary text-sm font-semibold hover:bg-brand-soft-blue/10 active:scale-[0.97] transition-all"
          >
            Sign In
          </Link>
          <Link
            href="/register"
            className="inline-flex items-center justify-center flex-1 h-11 rounded-xl bg-brand-secondary text-white text-sm font-semibold hover:bg-brand-secondary/90 active:scale-[0.97] transition-all"
          >
            Get Started
          </Link>
        </div>
      </div>

      {/* Feature slider */}
      <div className="border-y bg-white py-3 overflow-hidden" style={{ borderColor: 'rgba(0,0,0,0.1)' }}>
        <div className="flex animate-slide-left w-max">
          {[...features, ...features, ...features].map((f, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-5 shrink-0"
            >
              <div className="p-1.5 rounded-lg" style={{ background: 'rgba(0,0,0,0.05)' }}>
                <f.icon className="h-3.5 w-3.5" style={{ color: 'rgba(0,0,0,0.6)' }} />
              </div>
              <span className="text-[11px] font-medium whitespace-nowrap" style={{ color: 'rgba(0,0,0,0.4)' }}>
                {f.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-white px-5 py-4 text-center">
        <div className="flex items-center justify-center gap-2 mb-1.5">
          <div className="relative w-5 h-5 rounded-md overflow-hidden">
            <Image
              src="/coffers-logo.png"
              alt="Coffers"
              fill
              className="object-cover"
            />
          </div>
          <span className="font-bold text-brand-secondary text-xs">Coffers</span>
        </div>
        <p className="text-[10px] text-brand-neutral/30">
          &copy; 2026 Coffers. Built with care for your financial wellbeing.
        </p>
        <p className="text-[10px] text-brand-neutral/20 mt-0.5">
          Default currency: <span className="font-semibold">ZMK (Kwacha)</span>
        </p>
      </footer>
    </div>
  );
}
