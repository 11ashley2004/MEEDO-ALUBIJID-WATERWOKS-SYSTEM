'use client'

import { useDebounce } from '@/lib/hooks/use-debounce'

export const SEARCH_DEBOUNCE_MS = 300

/** Debounce a search box. Keep the input on the live value and filter with the returned value. */
export function useDebouncedSearch(value: string, delay = SEARCH_DEBOUNCE_MS) {
  return useDebounce(value, delay)
}
