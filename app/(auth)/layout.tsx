import { getUserSession } from "@/lib/actions/auth";
import { redirect } from "next/navigation";
import { ROLE_ROUTES } from "@/lib/constants/roles";

export default async function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Middleware already handles:
  //   - stage === 'password' on /login → redirect to /set-password
  //   - stage === 'otp' on /login      → stay, OTP dialog handles it
  // So by the time this layout runs, the pending cookie situation is resolved.

  const { status, role } = await getUserSession();

  if (status === "authenticated") {
    if (!role) redirect("/unauthorized");
    if (role in ROLE_ROUTES) redirect(ROLE_ROUTES[role]);
    redirect("/unauthorized");
  }

  return <>{children}</>;
}