import { LoginForm } from "@/components/auth/login-form";
import { AuthPageShell } from "@/components/auth/auth-layout";

export default async function LoginPage() {
  return (
    <AuthPageShell>
      <LoginForm />
    </AuthPageShell>
  );
}