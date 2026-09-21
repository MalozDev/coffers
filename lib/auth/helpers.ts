import { NextRequest } from "next/server";
import { cookies } from "next/headers";

interface TokenPayload {
  userId: string;
  email: string;
  exp: number;
}

/**
 * Extract userId from the auth cookie in a Next.js request
 */
export function getUserIdFromRequest(request: NextRequest): string | null {
  const token = request.cookies.get("coffers-token")?.value;
  if (!token) return null;
  try {
    const payload: TokenPayload = JSON.parse(
      Buffer.from(token, "base64").toString()
    );
    if (payload.exp < Date.now()) return null; // expired
    return payload.userId;
  } catch {
    return null;
  }
}

/**
 * Extract userId from server component (cookies API)
 */
export async function getServerUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("coffers-token")?.value;
  if (!token) return null;
  try {
    const payload: TokenPayload = JSON.parse(
      Buffer.from(token, "base64").toString()
    );
    if (payload.exp < Date.now()) return null;
    return payload.userId;
  } catch {
    return null;
  }
}

/**
 * Require auth — throws 401 if not logged in
 */
export function requireAuth(request: NextRequest): string {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    throw new Error("UNAUTHORIZED");
  }
  return userId;
}
