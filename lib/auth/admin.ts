import { NextRequest } from "next/server";
import connectToDatabase from "@/lib/db/connect";
import { User } from "@/lib/models";
import { getUserIdFromRequest } from "@/lib/auth/helpers";

export async function getAdminUserId(request: NextRequest): Promise<string | null> {
  const userId = getUserIdFromRequest(request);
  if (!userId) return null;

  await connectToDatabase();
  const user = await User.findById(userId).select("_id isAdmin").lean();
  return user?.isAdmin ? userId : null;
}
