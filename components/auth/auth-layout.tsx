import Image from "next/image";
import Link from "next/link";
import { Droplets } from "lucide-react";
import { ForceLightTheme } from "@/components/force-light-theme";
import { Toaster } from "@/components/ui/sonner";

const TEXTURE = `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23a78bfa' fill-opacity='0.15'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`;

// ── Shared purple branding panel (left side, desktop only) ───────────────────
export function AuthBrandPanel() {
  return (
    <div className="relative hidden min-h-dvh lg:flex flex-col bg-purple-800 overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{ backgroundImage: TEXTURE }}
      />
      <div className="pointer-events-none absolute -bottom-40 -left-40 h-[700px] w-[700px] rounded-full border border-purple-600/20" />
      <div className="pointer-events-none absolute -bottom-24 -left-24 h-[500px] w-[500px] rounded-full border border-purple-500/15" />
      <div className="pointer-events-none absolute -bottom-8 -left-8 h-[320px] w-[320px] rounded-full border border-purple-400/10" />

      <div className="relative z-10 p-12">
        <AuthLogo />
      </div>

      <div className="relative z-10 flex flex-1 flex-col justify-center px-14 pb-14">
        <div className="max-w-md">
          <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-md bg-purple-700/60 ring-1 ring-purple-500/30 shadow-xl">
            <Droplets className="h-8 w-8 text-purple-200" />
          </div>
          <h2 className="text-4xl font-bold leading-tight tracking-tight text-white">
            Water Billing
            <br />
            <span className="text-purple-300">Management System</span>
          </h2>
          <p className="mt-5 text-base leading-7 text-purple-200/80">
            MEEDO is a centralized platform designed to simplify water utility
            operations by managing consumers, meters, meter readings, billing,
            payments, and maintenance job orders in one secure system.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Mobile header band (hidden on desktop) ───────────────────────────────────
function AuthMobileHeader() {
  return (
    <header className="relative overflow-hidden bg-purple-800 px-5 pb-20 pt-[max(1.25rem,env(safe-area-inset-top))] lg:hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{ backgroundImage: TEXTURE }}
      />
      <div className="pointer-events-none absolute -bottom-24 -right-20 h-64 w-64 rounded-full border border-purple-500/20" />
      <div className="pointer-events-none absolute -bottom-12 -right-8 h-40 w-40 rounded-full border border-purple-400/15" />

      <div className="relative z-10 flex items-center justify-between gap-3">
        <AuthLogo />
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-purple-700/60 ring-1 ring-purple-500/30">
          <Droplets className="h-5 w-5 text-purple-200" />
        </div>
      </div>

      {/* Mobile greeting — keeps the form card short and scannable */}
      <div className="relative z-10 mt-6">
        <h2 className="text-xl font-bold tracking-tight text-white">Welcome back</h2>
        <p className="mt-1 text-sm text-purple-200/80">
          Sign in to continue
        </p>
      </div>
    </header>
  );
}

// ── Shared light form panel (right side) ─────────────────────────────────────
export function AuthFormPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-slate-50">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at 80% 20%, #ede9fe 0%, transparent 50%), radial-gradient(circle at 20% 80%, #f5f3ff 0%, transparent 50%)",
        }}
      />

      <AuthMobileHeader />

      <div className="relative z-10 flex flex-1 flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-8 lg:items-center lg:justify-center lg:px-16 lg:pb-10">
        <div
          className={[
            "-mt-12 w-full max-w-md self-center",
            "rounded-md border border-slate-200 bg-white p-5 shadow-sm sm:p-8",
            "lg:mt-0 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none",
          ].join(" ")}
        >
          {children}
        </div>

        <p className="mt-6 text-center text-xs text-slate-400 lg:hidden">
          © {new Date().getFullYear()} MEEDO Waterworks
        </p>
      </div>
    </div>
  );
}

// ── Shared Layout ─────────────────────────────────────────────────────────────
export function AuthPageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-slate-50 lg:grid-cols-[3fr_2fr]">
      <ForceLightTheme />
      <AuthBrandPanel />
      <AuthFormPanel>{children}</AuthFormPanel>
      <Toaster theme="light" position="bottom-right" />
    </div>
  );
}

// ── Logo ─────────────────────────────────────────────────────────────────────
export function AuthLogo({ light = false }: { light?: boolean }) {
  return (
    <Link href="/" className="group flex w-fit items-center gap-3">
      <div
        className={`flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-md ring-1 transition-colors ${
          light
            ? "bg-purple-100 ring-purple-200 group-hover:bg-purple-200"
            : "bg-purple-600/50 ring-purple-400/40 group-hover:bg-purple-600/70"
        }`}
      >
        <Image
          src="/meedo-logo-removebg.png"
          alt="MEEDO"
          width={30}
          height={30}
          className="object-contain"
        />
      </div>
      <div className="flex flex-col leading-tight">
        <span
          className={`text-base font-bold tracking-tight ${
            light ? "text-purple-900" : "text-white"
          }`}
        >
          MEEDO
        </span>
        <span
          className={`text-[11px] uppercase tracking-[0.2em] ${
            light ? "text-purple-500" : "text-purple-300/70"
          }`}
        >
          Water Billing System
        </span>
      </div>
    </Link>
  );
}