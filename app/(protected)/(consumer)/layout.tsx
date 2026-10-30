import { getUserSession } from '@/lib/actions/auth'
import { redirect } from 'next/navigation'
import { ROLES, ROLE_ROUTES } from '@/lib/constants/roles'

export default async function ConsumerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { status, user, role } = await getUserSession()

  if (status === 'unauthenticated' || !user) redirect('/login')
  if (!role) redirect('/login')
  if (role !== ROLES.CONSUMER) redirect(ROLE_ROUTES[role])

  return <>{children}</>
}