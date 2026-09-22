"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import BottomNav from "@/components/layout/BottomNav";
import PwaInstallPrompt from "@/components/layout/PwaInstallPrompt";

export interface DashboardProfile {
  name: string;
  email: string;
  profileImage?: string | null;
  isAdmin?: boolean;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profile, setProfile] = useState<DashboardProfile | null>(null);
  const pathname = usePathname();

  // Close the mobile menu whenever the route changes
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    const handleProfileUpdate = (event: Event) => {
      const detail = (event as CustomEvent<DashboardProfile>).detail;
      if (detail) setProfile(detail);
    };

    const validateSession = async () => {
      const response = await fetch("/api/dashboard", {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      if (response.status === 401) {
        window.location.replace(`/login?from=${encodeURIComponent(pathname)}`);
        return;
      }
      const result = await response.json();
      if (result.success) setProfile(result.data.user);
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) validateSession();
    };

    validateSession();
    window.addEventListener("coffers:profile-updated", handleProfileUpdate);
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      window.removeEventListener("coffers:profile-updated", handleProfileUpdate);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [pathname]);

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar — hidden on mobile */}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} profile={profile} />

      {/* Main content — full width on mobile, offset on desktop */}
      <div className="lg:pl-72 min-h-screen flex flex-col">
        <TopBar onMenuClick={() => setSidebarOpen(true)} profile={profile} />

        {/* Content area — padded for bottom nav on mobile */}
        <main className="flex-1 px-4 py-5 pb-24 lg:px-8 lg:py-8 lg:pb-8">
          {children}
        </main>
      </div>

      {/* Mobile bottom nav — primary navigation */}
      <BottomNav />
      <PwaInstallPrompt />
    </div>
  );
}
