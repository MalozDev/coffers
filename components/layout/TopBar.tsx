"use client";

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
          <Button variant="ghost" size="icon" className="relative h-10 w-10">
            <Bell className="h-5 w-5" />
            <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-destructive" />
            <span className="sr-only">Notifications</span>
          </Button>

          <Avatar className="h-8 w-8">
            {profile?.profileImage ? (
              <AvatarImage src={profile.profileImage} alt={profile.name} />
            ) : (
              <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                {profile?.name?.slice(0, 2).toUpperCase() || "CU"}
              </AvatarFallback>
            )}
          </Avatar>
        </div>
      </div>
    </header>
  );
}
