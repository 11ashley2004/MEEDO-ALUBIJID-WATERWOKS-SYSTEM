"use client"

import type { ThemeChoice } from "@/lib/actions/theme-preference.actions"
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes"
import { useEffect, useRef } from "react"

function SyncSavedTheme({ saved }: { saved: ThemeChoice }) {
  const { setTheme } = useTheme()
  const applied = useRef(false)

  useEffect(() => {
    if (applied.current) return
    applied.current = true
    setTheme(saved)
  }, [saved, setTheme])

  return null
}

export function ThemeProvider({
  children,
  theme = "system",
}: {
  children: React.ReactNode
  theme?: ThemeChoice
}) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme={theme}
      enableSystem
      disableTransitionOnChange
    >
      <SyncSavedTheme saved={theme} />
      {children}
    </NextThemesProvider>
  )
}
