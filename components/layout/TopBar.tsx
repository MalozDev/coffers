"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Menu, Bell } from "lucide-react";
import Image from "next/image";
import type { DashboardProfile } from "@/app/dashboard/layout";

interface TopBarProps {
  onMenuClick: () => void;
  profile?: DashboardProfile | null;
}

export default function TopBar({ onMenuClick, profile }: TopBarProps) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const loadUnreadCount = () => {
      fetch("/api/notifications")
        .then((response) => response.json())
        .then((result) => {
          if (result.success) setUnreadCount(result.data.unreadCount);
        })
        .catch(() => undefined);
    };

    loadUnreadCount();
    window.addEventListener("coffers:notifications-updated", loadUnreadCount);
    window.addEventListener("coffers:data-updated", loadUnreadCount);
    return () => {
      window.removeEventListener("coffers:notifications-updated", loadUnreadCount);
      window.removeEventListener("coffers:data-updated", loadUnreadCount);
    };
  }, []);

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-border">
      <div className="relative flex items-center justify-between h-14 px-4 lg:h-16 lg:px-8">
        {/* Left — hamburger + logo on mobile, brand on desktop */}
        <div className="flex items-center gap-3 lg:static">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden h-10 w-10"
            onClick={onMenuClick}
          >
            <Menu className="h-5 w-5" />
            <span className="sr-only">Menu</span>
          </Button>

          {/* Mobile: logo + name */}
          <div className="absolute left-1/2 flex -translate-x-1/2 items-center justify-center gap-2 lg:hidden">
            <div className="relative w-7 h-7 rounded-lg overflow-hidden">
              <Image
                src="/coffers-logo.png"
                alt="Coffers"
                fill
                sizes="28px"
                className="object-cover"
              />
            </div>
            <span className="text-base font-bold text-foreground tracking-tight">
              Coffers
            </span>
          </div>

          {/* Desktop: text only */}
          <h1 className="hidden lg:block text-lg font-bold text-foreground">
            Coffers
          </h1>
        </div>

        {/* Right — notifications + avatar */}
        <div className="flex items-center gap-2 lg:static">
          <Link href="/dashboard/notifications" className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-muted" aria-label={unreadCount ? `${unreadCount} unread notifications` : "Notifications"}>
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && <span className="absolute right-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">{unreadCount > 99 ? "99+" : unreadCount}</span>}
            <span className="sr-only">Notifications</span>
          </Link>

          {/* Profile opens Settings — no separate profile page */}
          <Link
            href="/dashboard/settings"
            aria-label="Profile and settings"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Avatar className="h-8 w-8">
              {profile?.profileImage ? (
                <AvatarImage src={profile.profileImage} alt={profile.name} />
              ) : (
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                  {profile?.name?.slice(0, 2).toUpperCase() || "CU"}
                </AvatarFallback>
              )}
            </Avatar>
          </Link>
        </div>
      </div>
    </header>
  );
}
