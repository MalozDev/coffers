import { readFileSync } from "fs";
import { resolve } from "path";
import bcrypt from "bcryptjs";
import connectToDatabase from "@/lib/db/connect";
import { User } from "@/lib/models";

const envPath = resolve(__dirname, "../.env.local");
const envContent = readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const separator = trimmed.indexOf("=");
  if (separator === -1) continue;
  const key = trimmed.slice(0, separator).trim();
  const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
  if (!process.env[key]) process.env[key] = value;
}

async function ensureAdmin() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI not found in .env.local");
  await connectToDatabase();

  const email = "malozdev@coffers.com";
  const passwordHash = await bcrypt.hash("<stephDev/>@1028", 12);

  await User.updateMany({ email: { $ne: email } }, { $set: { isAdmin: false } });
  await User.findOneAndUpdate(
    { email },
    {
      $set: {
        name: "Coffers Admin",
        email,
        phoneNumber: "+260 97 123 4567",
        passwordHash,
        isAdmin: true,
        defaultCurrency: "ZMK",
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  );

  console.log("Admin account is ready.");
  process.exit(0);
}

ensureAdmin().catch((error) => {
  console.error("Failed to ensure admin account:", error);
  process.exit(1);
});
