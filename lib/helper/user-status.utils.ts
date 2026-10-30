export function getUserOnlineStatus(lastActive?: string) {
  if (!lastActive) {
    return { label: 'Offline' };
  }

  const timestamp = lastActive.endsWith('Z') ? lastActive : `${lastActive}Z`;
  const lastActiveDate = new Date(timestamp);
  const now = new Date();
  
  const diffMs = now.getTime() - lastActiveDate.getTime();
  const diffMinutes = diffMs / 1000 / 60;

  if (diffMinutes <= 5) {
    return { label: 'Online' };
  }

  if (diffMinutes <= 30) {
    return { label: 'Away' };
  }

  return { label: 'Offline' };
}