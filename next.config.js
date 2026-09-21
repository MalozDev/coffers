/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable React strict mode for better development experience
  reactStrictMode: true,

  // Allow MongoDB connection strings and other env vars
  env: {
    NEXT_PUBLIC_APP_NAME: "Coffers",
    NEXT_PUBLIC_CURRENCY: "ZMK",
    NEXT_PUBLIC_CURRENCY_LABEL: "Kwacha",
  },
};

module.exports = nextConfig;
