// Suggested path: components/ui/masked-value.tsx
'use client'

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'

export function MaskedValue({
  value,
  className,
  maskLength = 10,
}: {
  value: string
  className?: string
  /** Number of dots shown while hidden — fixed, so the mask never leaks the real length. */
  maskLength?: number
}) {
  const [revealed, setRevealed] = useState(false)

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span
        className={cn(
          'font-mono text-[12.5px] select-none',
          revealed ? 'text-slate-700 tracking-normal' : 'text-slate-400 tracking-widest',
        )}
      >
        {revealed ? value : '•'.repeat(maskLength)}
      </span>
      <button
        type="button"
        onClick={() => setRevealed((r) => !r)}
        className="p-0.5 rounded hover:bg-slate-100 text-slate-400 hover:text-violet-600 transition-colors"
        aria-label={revealed ? 'Hide value' : 'Show value'}
        aria-pressed={revealed}
      >
        {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </span>
  )
}