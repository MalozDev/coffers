"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import Image from "next/image";
import {
  LayoutDashboard,
  ArrowDownCircle,
  ArrowUpCircle,
  Activity,
  PiggyBank,
  Coins,
  Bell,
  BarChart3,
  Tag,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { DashboardProfile } from "@/app/dashboard/layout";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/income", label: "Income", icon: ArrowDownCircle },
  { href: "/dashboard/expenses", label: "Expenses", icon: ArrowUpCircle },
  { href: "/dashboard/activity", label: "Activity", icon: Activity },
  { href: "/dashboard/budgets", label: "Budgets", icon: PiggyBank },
  { href: "/dashboard/savings", label: "Savings", icon: Coins },
  { href: "/dashboard/reminders", label: "Reminders", icon: Bell },
  { href: "/dashboard/analysis", label: "Analysis", icon: BarChart3 },
];

const secondaryItems = [
  { href: "/dashboard/categories", label: "Categories", icon: Tag },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  profile?: DashboardProfile | null;
}

interface SidebarContentProps {
  onClose?: () => void;
}

function SidebarContent({ onClose, profile }: SidebarContentProps & { profile?: DashboardProfile | null }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col h-full bg-black">
      {/* Brand with Logo */}
      <div className="px-5 py-6">
        <div className="flex items-center gap-3">
          <div className="relative w-10 h-10 rounded-xl overflow-hidden shadow-md ring-1 ring-white/10">
            <Image
              src="/coffers-logo.png"
              alt="Coffers"
              fill
              className="object-cover"
            />
          </div>
          <div>
            <h1 className="text-lg font-bold text-sidebar-foreground tracking-tight">
              Coffers
            </h1>
            <p className="text-[10px] text-sidebar-foreground/50 leading-tight">
              Know where your money went
            </p>
          </div>
        </div>
      </div>

      <Separator className="" />

      {/* Main nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <item.icon className="h-4.5 w-4.5 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <Separator className="" />

      {profile?.isAdmin && <nav className="px-3 py-3 space-y-0.5">
        <Link href="/admin" onClick={onClose} className={cn("flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors", pathname === "/admin" ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground")}>
          <ShieldCheck className="h-4.5 w-4.5 shrink-0" /> Admin portal
        </Link>
      </nav>}

      {/* Secondary nav */}
      <nav className="px-3 py-3 space-y-0.5">
        {secondaryItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <item.icon className="h-4.5 w-4.5 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <Separator className="" />

      {/* User — sidebar profile opens Settings (no redundant profile page) */}
      <div className="px-3 pb-4">
        <Link
          href="/dashboard/settings"
          onClick={onClose}
          className="flex items-center gap-3 rounded-lg px-1 py-2 transition-colors hover:bg-sidebar-accent/50"
          aria-label="Profile and settings"
        >
          <Avatar className="h-9 w-9">
            {profile?.profileImage ? (
              <AvatarImage src={profile.profileImage} alt={profile.name} />
            ) : (
              <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground text-sm font-semibold">
                {profile?.name?.slice(0, 2).toUpperCase() || "CU"}
              </AvatarFallback>
            )}
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sidebar-foreground truncate">
              {profile?.name || "Coffers User"}
            </p>
            <p className="text-xs text-sidebar-foreground/50 truncate">
              {profile?.email || "user@coffers.app"}
            </p>
          </div>
          <Settings className="h-4 w-4 shrink-0 text-sidebar-foreground/50" />
        </Link>
      </div>
    </div>
  );
}

export default function Sidebar({ open, onClose, profile }: SidebarProps) {
  return (
    <>
      {/* Desktop — fixed sidebar, hidden on mobile */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-72 lg:flex-col lg:border-r lg:border-sidebar-border">
        <SidebarContent profile={profile} />
      </aside>

      {/* Mobile — sheet overlay */}
      <Sheet
        open={open}
        onOpenChange={(isOpen) => {
          if (!isOpen) onClose();
        }}
      >
        <SheetContent
          side="left"
          className="w-72 p-0 bg-black text-white border-white/20"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <SidebarContent onClose={onClose} profile={profile} />
        </SheetContent>
      </Sheet>
    </>
  );
}
