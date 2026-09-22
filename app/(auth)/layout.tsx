import Image from "next/image";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-background flex flex-col items-center justify-center p-4">
      {/* Logo + brand */}
      <div className="text-center mb-6">
        <div className="flex justify-center mb-3">
          <div className="relative w-16 h-16 rounded-2xl overflow-hidden shadow-card ring-1">
            <Image
              src="/coffers-logo.png"
              alt="Coffers Logo"
              fill
              className="object-cover"
              priority
            />
          </div>
        </div>
        <h1 className="text-3xl font-extrabold text-brand-secondary tracking-tight">
          Coffers
        </h1>
        <p className="text-brand-neutral mt-1 text-xs">
          Know where your money went. Know where it&apos;s going.
        </p>
      </div>

      {/* Auth card */}
      <div className="w-full max-w-sm bg-white rounded-2xl border border-border shadow-card p-5">
        {children}
      </div>

      {/* Footer */}
      <p className="text-center text-brand-neutral text-[11px] mt-4">
        Default currency:{" "}
        <span className="font-semibold text-brand-secondary/60">ZMK (Kwacha)</span>
      </p>
    </div>
  );
}
