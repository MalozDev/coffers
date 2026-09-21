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
  Target,
  Bell,
  BarChart3,
  Tag,
  Settings,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/income", label: "Income", icon: ArrowDownCircle },
  { href: "/expenses", label: "Expenses", icon: ArrowUpCircle },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/budgets", label: "Budgets", icon: PiggyBank },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/reminders", label: "Reminders", icon: Bell },
  { href: "/analysis", label: "Analysis", icon: BarChart3 },
];

const secondaryItems = [
  { href: "/categories", label: "Categories", icon: Tag },
  { href: "/settings", label: "Settings", icon: Settings },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

function SidebarContent() {
  const pathname = usePathname();

  return (
    <div className="flex flex-col h-full bg-black">
      {/* Brand with Logo */}
      <div className="px-5 py-6">
        <div className="flex items-center gap-3">
          <div className="relative w-10 h-10 rounded-xl overflow-hidden shadow-md ring-1 ring-white/10">
            <Image
              src="/Money-Logo-Graphics-1-1.jpg"
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

      <Separator className="bg-sidebar-border" />

      {/* Main nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
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

      <Separator className="bg-sidebar-border" />

      {/* Secondary nav */}
      <nav className="px-3 py-3 space-y-0.5">
        {secondaryItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
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

      <Separator className="bg-sidebar-border" />

      {/* User */}
      <div className="px-4 py-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground text-sm font-semibold">
              CU
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sidebar-foreground truncate">
              Coffers User
            </p>
            <p className="text-xs text-sidebar-foreground/50 truncate">
              user@coffers.app
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  return (
    <>
      {/* Desktop — fixed sidebar, hidden on mobile */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-72 lg:flex-col lg:border-r lg:border-sidebar-border">
        <SidebarContent />
      </aside>

      {/* Mobile — sheet overlay */}
      <Sheet open={open} onOpenChange={onClose}>
        <SheetContent
          side="left"
          className="w-72 p-0 bg-black text-white border-white/20"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <SidebarContent />
        </SheetContent>
      </Sheet>
    </>
  );
}
