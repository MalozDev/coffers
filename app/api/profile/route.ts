import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/db/connect";
import { User } from "@/lib/models";
import { getUserIdFromRequest } from "@/lib/auth/helpers";

export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  await connectToDatabase();
  const user = await User.findById(userId).select("name email phoneNumber profileImage defaultCurrency").lean();
  if (!user) return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });

  return NextResponse.json({ success: true, data: { user } });
}

export async function PATCH(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const phoneNumber = String(body.phoneNumber || "").trim();
    const profileImage = body.profileImage;

    if (name.length < 2 || name.length > 100) {
      return NextResponse.json({ success: false, error: "Name must be between 2 and 100 characters" }, { status: 400 });
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ success: false, error: "Enter a valid email address" }, { status: 400 });
    }
    if (!phoneNumber) {
      return NextResponse.json({ success: false, error: "Phone number is required" }, { status: 400 });
    }
    if (profileImage !== undefined && profileImage !== null && (typeof profileImage !== "string" || !profileImage.startsWith("data:image/") || profileImage.length > 4000000)) {
      return NextResponse.json({ success: false, error: "Profile image must be a valid image smaller than 3 MB" }, { status: 400 });
    }

    await connectToDatabase();
    const duplicate = await User.findOne({ email, _id: { $ne: userId } }).select("_id").lean();
    if (duplicate) return NextResponse.json({ success: false, error: "That email is already in use" }, { status: 409 });

    const user = await User.findByIdAndUpdate(
      userId,
      {
        $set: { name, email, phoneNumber, ...(profileImage !== undefined && profileImage !== null ? { profileImage } : {}) },
        ...(profileImage === null ? { $unset: { profileImage: 1 } } : {}),
      },
      { new: true, runValidators: true }
    ).select("name email phoneNumber profileImage defaultCurrency").lean();

    return NextResponse.json({ success: true, data: { user } });
  } catch (error) {
    console.error("Profile update error:", error);
    return NextResponse.json({ success: false, error: "Failed to update profile" }, { status: 500 });
  }
}