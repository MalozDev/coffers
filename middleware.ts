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
  "/dashboard/savings",
  "/dashboard/reminders",
  "/dashboard/analysis",
  "/dashboard/categories",
  "/dashboard/settings",
  "/dashboard/notifications",
  "/admin",
];

// Routes an already-authenticated visitor should never sit on
const authRoutes = ["/login", "/register", "/"];

function readSession(request: NextRequest): boolean {
  const token = request.cookies.get("coffers-token")?.value;
  if (!token) return false;
  try {
    const payload = JSON.parse(Buffer.from(token, "base64").toString());
    return Boolean(payload.userId && payload.exp > Date.now());
  } catch {
    return false;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasValidToken = readSession(request);

  // Protected routes — redirect to login if no token
  const isProtected = protectedRoutes.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );
  if (isProtected && !hasValidToken) {
    // Expired/invalid sessions land on login with a return path, and any
    // stale cookie is cleared so the next request starts clean.
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    const response = NextResponse.redirect(loginUrl);
    if (request.cookies.get("coffers-token")) {
      response.cookies.set("coffers-token", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 0,
        path: "/",
      });
    }
    return response;
  }

  // Startup: a valid session means the user is already signed in — put them
  // straight into the application instead of the landing/login screens.
  if (hasValidToken && authRoutes.includes(pathname)) {
    const from = request.nextUrl.searchParams.get("from");
    const target =
      from && from.startsWith("/") && !from.startsWith("//") ? from : "/dashboard";
    return NextResponse.redirect(new URL(target, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|manifest.json|icons).*)",
  ],
};
