export const fmt = {
  date: (iso: string) =>
    new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }),
  dateTime: (iso: string) =>
    new Date(iso).toLocaleString('en-PH', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    }),
  period: (iso: string) => {
    const d    = new Date(iso)
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    return `${d.toLocaleDateString('en-PH', { month: 'long' })} 1–${last}, ${d.getFullYear()}`
  },
  initials: (first: string, last: string) => `${first[0]}${last[0]}`.toUpperCase(),
  num:      (n: number) => n.toLocaleString('en-PH'),
}