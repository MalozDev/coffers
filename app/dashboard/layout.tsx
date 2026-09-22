"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import BottomNav from "@/components/layout/BottomNav";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  // Close the mobile menu whenever the route changes
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    const validateSession = async () => {
      const response = await fetch("/api/dashboard", {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      if (response.status === 401) {
        window.location.replace(`/login?from=${encodeURIComponent(pathname)}`);
      }
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) validateSession();
    };

    validateSession();
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, [pathname]);

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar — hidden on mobile */}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content — full width on mobile, offset on desktop */}
      <div className="lg:pl-72 min-h-screen flex flex-col">
        <TopBar onMenuClick={() => setSidebarOpen(true)} />

        {/* Content area — padded for bottom nav on mobile */}
        <main className="flex-1 px-4 py-5 pb-24 lg:px-8 lg:py-8 lg:pb-8">
          {children}
        </main>
      </div>

      {/* Mobile bottom nav — primary navigation */}
      <BottomNav />
    </div>
  );
}
