import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Routes that require authentication
const protectedRoutes = [
  "/dashboard",
  "/dashboard/income",
  "/dashboard/expenses",
  "/dashboard/activity",
  "/dashboard/budgets",
  "/dashboard/goals",
  "/dashboard/reminders",
  "/dashboard/analysis",
  "/dashboard/categories",
  "/dashboard/settings",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("coffers-token")?.value;

  // Protected routes — redirect to login if no token
  const isProtected = protectedRoutes.some((route) => pathname === route || pathname.startsWith(route + "/"));
  if (isProtected && !token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|manifest.json|icons).*)",
  ],
};
