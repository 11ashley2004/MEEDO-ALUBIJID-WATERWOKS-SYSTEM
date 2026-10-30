'use client'

import { useLayoutEffect } from 'react'

/** Sign-in screens stay light even if the signed-in app last used dark mode. */
export function ForceLightTheme() {
  useLayoutEffect(() => {
    const root = document.documentElement
    root.classList.remove('dark')
    root.classList.add('light')
    root.style.colorScheme = 'light'
  }, [])

  return null
}
