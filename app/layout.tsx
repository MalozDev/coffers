import type { Metadata, Viewport } from "next";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: "Coffers — Personal Finance Tracker",
  description:
    "Know where your money went. Know where it's going. A modern personal finance tracker that learns your spending to help you make better financial decisions.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Coffers",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#090c9b",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">

      <body className="min-h-screen bg-background text-foreground font-sans">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
