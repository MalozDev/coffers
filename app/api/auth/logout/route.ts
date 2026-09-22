import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json(
    { success: true, data: { message: "Logged out successfully" } },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );

  // Clear auth cookie
  response.cookies.set("coffers-token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });

  return response;
}
