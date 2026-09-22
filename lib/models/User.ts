import mongoose, { Schema, Document, Model } from "mongoose";

export interface IUser extends Document {
  name: string;
  email: string;
  phoneNumber: string;
  profileImage?: string;
  passwordHash: string;
  isAdmin: boolean;
  defaultCurrency: "ZMK";
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email"],
    },
    phoneNumber: {
      type: String,
      required: [true, "Phone number is required"],
      trim: true,
    },
    profileImage: {
      type: String,
      maxlength: [4000000, "Profile image is too large"],
    },
    passwordHash: {
      type: String,
      required: [true, "Password is required"],
      select: false, // Never return password by default
    },
    isAdmin: {
      type: Boolean,
      default: false,
      index: true,
    },
    defaultCurrency: {
      type: String,
      enum: ["ZMK"],
      default: "ZMK",
    },
  },
  {
    timestamps: true,
  }
);

UserSchema.index({ email: 1 }, { unique: true });

const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>("User", UserSchema);

export default User;
