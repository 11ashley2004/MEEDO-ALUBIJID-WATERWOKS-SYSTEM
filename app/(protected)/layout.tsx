import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getUserSession } from "@/lib/actions/auth";
import { getThemePreference } from "@/lib/actions/theme-preference.actions";
import { ROLE_ROUTES } from '@/lib/constants/roles';
import Sidebar from "@/components/shared-ui/Sidebar";
import Header from "@/components/shared-ui/Header";
import { PageHeaderProvider } from "@/components/shared-ui/page-heading";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { BillingDisconnectionRealtimeListener } from "@/components/shared-ui/BillingDisconnectionRealtimeListener";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { status, user, role } = await getUserSession();

  if (status === 'unauthenticated' || !user) {
    redirect('/login');
  }

  if (role) {
    const headersList = await headers();
    const pathname = headersList.get('x-invoke-path') || headersList.get('x-pathname');

    if (pathname === '/dashboard') {
      redirect(ROLE_ROUTES[role]);
    }
  }

  const theme = await getThemePreference();

  return (
    <ThemeProvider theme={theme}>
      <PageHeaderProvider>
        <div className="flex h-dvh overflow-hidden bg-gray-50 text-foreground dark:bg-background">
          <Sidebar role={role} />

          <div className="flex flex-1 flex-col min-w-0 w-0">
            <Header role={role} />
            <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 p-3 dark:bg-background sm:p-4 lg:p-6">
              {children}
            </main>
          </div>

          <BillingDisconnectionRealtimeListener />
        </div>
      </PageHeaderProvider>
      <Toaster
        position="bottom-right"
        expand
        visibleToasts={5}
        gap={5}
        duration={5000}
        toastOptions={{
          classNames: {
            title: "text-foreground font-semibold",
            description: "!text-muted-foreground",
            error:
              "!bg-red-600 !border-red-700 [&_[data-title]]:!text-white [&_[data-description]]:!text-red-50",
          },
        }}
      />
    </ThemeProvider>
  );
}