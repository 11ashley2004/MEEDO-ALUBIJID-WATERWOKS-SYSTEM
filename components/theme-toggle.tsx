"use client"

import { saveThemePreference, type ThemeChoice } from "@/lib/actions/theme-preference.actions"
import { cn } from "@/lib/utils"
import { Monitor, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

const themes = [
  { value: "light", label: "Light mode", icon: Sun },
  { value: "dark", label: "Dark mode", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const buttons = useRef<Array<HTMLButtonElement | null>>([])

  useEffect(() => {
    setMounted(true)
  }, [])

  const active = mounted ? (theme ?? "system") : "system"

  function select(value: ThemeChoice, focus = false) {
    setTheme(value)
    void saveThemePreference(value).then((result) => {
      if (result.status === "error" && result.message) toast.error(result.message)
    })
    if (!focus) return
    const index = themes.findIndex((item) => item.value === value)
    buttons.current[index]?.focus()
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const index = themes.findIndex((item) => item.value === active)
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return
    event.preventDefault()
    const next =
      event.key === "ArrowRight"
        ? themes[(index + 1) % themes.length]
        : themes[(index - 1 + themes.length) % themes.length]
    select(next.value, true)
  }

  return (
    <TooltipProvider>
      <div
        role="radiogroup"
        aria-label="Color theme"
        onKeyDown={onKeyDown}
        className="flex items-center rounded-md border border-border bg-muted p-0.5"
      >
        {themes.map((item, index) => {
          const selected = active === item.value
          const Icon = item.icon
          return (
            <Tooltip key={item.value}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={item.label}
                  tabIndex={selected ? 0 : -1}
                  ref={(node) => {
                    buttons.current[index] = node
                  }}
                  onClick={() => select(item.value)}
                  className={cn(
                    "rounded-sm p-1.5 text-muted-foreground outline-none transition-colors",
                    "focus-visible:ring-2 focus-visible:ring-ring",
                    selected && "bg-background text-foreground shadow-sm"
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="rounded-md">{item.label}</TooltipContent>
            </Tooltip>
          )
        })}
      </div>
    </TooltipProvider>
  )
}
