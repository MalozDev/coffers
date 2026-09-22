import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/db/connect";
import { Notification } from "@/lib/models";
import { getUserIdFromRequest } from "@/lib/auth/helpers";

export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    await connectToDatabase();
    const notifications = await Notification.find({ userId }).sort({ createdAt: -1 }).limit(100).lean();
    const unreadCount = await Notification.countDocuments({ userId, readAt: { $exists: false } });
    return NextResponse.json({ success: true, data: { notifications, unreadCount } });
  } catch (error) {
    console.error("Notifications fetch error:", error);
    return NextResponse.json({ success: false, error: "Failed to load notifications" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    await connectToDatabase();
    if (body.all === true) {
      await Notification.updateMany({ userId, readAt: { $exists: false } }, { $set: { readAt: new Date() } });
    } else if (body.id) {
      await Notification.updateOne({ _id: body.id, userId }, { $set: { readAt: new Date() } });
    } else {
      return NextResponse.json({ success: false, error: "Notification id or all is required" }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Notification update error:", error);
    return NextResponse.json({ success: false, error: "Failed to update notification" }, { status: 500 });
  }
}
