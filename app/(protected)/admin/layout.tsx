import { getUserSession } from '@/lib/actions/auth';
import { ROLES, ROLE_ROUTES } from '@/lib/constants/roles';
import { redirect } from 'next/navigation';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { status, user, role } = await getUserSession();

  if (status === 'unauthenticated' || !user) {
    redirect('/login');
  }

  if (!role) {
        redirect('/login');

  }

  if (role !== ROLES.ADMIN) {
    // Redirect to their own dashboard
    redirect(ROLE_ROUTES[role]);
  }

  return (<>{children}</>);
}