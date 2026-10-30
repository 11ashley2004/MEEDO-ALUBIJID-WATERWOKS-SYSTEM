// app/admin/notifications/page.tsx
import NotificationsPageContent from '@/components/notifications/NotificationsPageContent'
import { ROLES } from '@/lib/constants/roles'

export default function Page() {
  return <NotificationsPageContent role={ROLES.ADMIN} />
}