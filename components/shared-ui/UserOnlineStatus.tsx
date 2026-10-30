'use client';

import { DateFormatPH } from '@/lib/helper/date.utils';
import { getUserOnlineStatus } from '@/lib/helper/user-status.utils';

type Props = {
  lastActive?: string | null;
};

const UserOnlineStatus = ({ lastActive }: Props) => {
  const status = getUserOnlineStatus(lastActive || undefined);

  const dotColor =
    status.label === 'Online' ? 'bg-emerald-500' :
    status.label === 'Away'   ? 'bg-amber-500' :
    'bg-gray-400';

  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      <span className={`h-3 w-3 rounded-full shrink-0 ${dotColor}`} />
      <span className="text-xs text-gray-500">
        {lastActive ? DateFormatPH(lastActive) : 'Never'}
      </span>
    </div>
  );
};

export default UserOnlineStatus;