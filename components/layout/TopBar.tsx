"use client";

import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Menu, Bell } from "lucide-react";
import Image from "next/image";

interface TopBarProps {
  onMenuClick: () => void;
}

export default function TopBar({ onMenuClick }: TopBarProps) {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-border">
      <div className="flex items-center justify-between h-14 px-4 lg:h-16 lg:px-8">
        {/* Left — hamburger + logo on mobile, brand on desktop */}
        <div className="flex items-center gap-3">
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
          <div className="flex items-center gap-2 lg:hidden">
            <div className="relative w-7 h-7 rounded-lg overflow-hidden">
              <Image
                src="/Money-Logo-Graphics-1-1.jpg"
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
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="relative h-10 w-10">
            <Bell className="h-5 w-5" />
            <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-destructive" />
            <span className="sr-only">Notifications</span>
          </Button>

          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
              CU
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
    </header>
  );
}
