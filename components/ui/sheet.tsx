"use client"

import * as React from "react"
import { Dialog as SheetPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"
import { DiscardChangesDialog } from "@/components/shared-ui/discard-changes-dialog"
import { FormPending } from "@/components/shared-ui/form-pending"

const PORTED_UI = '[data-slot="select-content"],[data-slot="popover-content"],[data-slot="dropdown-menu-content"],[data-slot="combobox-content"],[role="listbox"],[role="option"],[data-slot="command-item"],[data-slot="select-item"]'

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn("data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 bg-black/10 text-xs/relaxed duration-100 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs fixed inset-0 z-50", className)}
      {...props}
    />
  )
}

function isPortaledControl(target: EventTarget | null) {
  return target instanceof Element && !!target.closest(PORTED_UI)
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
}) {
  const closeRef = React.useRef<HTMLButtonElement>(null)
  const panelRef = React.useRef<HTMLDivElement>(null)
  const dirtyRef = React.useRef(false)
  const waiting = React.useRef(false)
  const seenBusy = React.useRef(false)
  const ticks = React.useRef(0)
  const submitButton = React.useRef<HTMLButtonElement | null>(null)
  const [confirmDiscard, setConfirmDiscard] = React.useState(false)
  const [promptKey, setPromptKey] = React.useState(0)
  const [pending, setPending] = React.useState(false)

  const markDirty = () => {
    dirtyRef.current = true
  }

  const resetSession = () => {
    dirtyRef.current = false
    waiting.current = false
    seenBusy.current = false
    ticks.current = 0
    setConfirmDiscard(false)
    setPending(false)
  }

  React.useEffect(() => {
    const node = panelRef.current
    if (!node) return
    let last = node.getAttribute('data-state')
    const observer = new MutationObserver(() => {
      const next = node.getAttribute('data-state')
      if (last !== 'open' && next === 'open') resetSession()
      last = next
    })
    observer.observe(node, { attributes: true, attributeFilter: ['data-state'] })
    return () => observer.disconnect()
  }, [])

  React.useEffect(() => {
    const mark = (event: Event) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest('[data-slot="command-item"],[data-slot="select-item"],[role="option"],[role="switch"],[role="checkbox"]')) {
        markDirty()
      }
    }
    document.addEventListener('click', mark)
    return () => document.removeEventListener('click', mark)
  }, [])

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      if (!waiting.current) return
      ticks.current += 1
      const busy = !!submitButton.current?.hasAttribute('disabled')
      if (busy) {
        seenBusy.current = true
        setPending(true)
        return
      }
      if (seenBusy.current || ticks.current >= 4) {
        seenBusy.current = false
        setPending(false)
        waiting.current = false
      }
    }, 120)
    return () => window.clearInterval(timer)
  }, [])

  const askToDiscard = () => {
    if (pending || !dirtyRef.current) return
    setPromptKey((key) => key + 1)
    setConfirmDiscard(true)
  }

  const blockIfDirty = (event: { preventDefault: () => void; target: EventTarget | null }) => {
    if (isPortaledControl(event.target)) {
      event.preventDefault()
      return
    }
    if (pending || dirtyRef.current) {
      event.preventDefault()
      if (dirtyRef.current && !pending) askToDiscard()
    }
  }

  const discard = () => {
    dirtyRef.current = false
    setConfirmDiscard(false)
    closeRef.current?.click()
  }

  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        data-side={side}
        {...props}
        ref={panelRef}
        className={cn("bg-background data-open:animate-in data-closed:animate-out data-[side=right]:data-closed:slide-out-to-right-10 data-[side=right]:data-open:slide-in-from-right-10 data-[side=left]:data-closed:slide-out-to-left-10 data-[side=left]:data-open:slide-in-from-left-10 data-[side=top]:data-closed:slide-out-to-top-10 data-[side=top]:data-open:slide-in-from-top-10 data-closed:fade-out-0 data-open:fade-in-0 data-[side=bottom]:data-closed:slide-out-to-bottom-10 data-[side=bottom]:data-open:slide-in-from-bottom-10 fixed z-50 flex flex-col bg-clip-padding text-xs/relaxed shadow-lg transition duration-200 ease-in-out data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm", className)}
        onInput={markDirty}
        onChange={markDirty}
        onSubmitCapture={(event) => {
          const form = event.target
          if (!(form instanceof HTMLFormElement)) return
          const button =
            (form.id
              ? document.querySelector(`button[type="submit"][form="${CSS.escape(form.id)}"]`)
              : null) ?? form.querySelector('button[type="submit"]')
          if (!(button instanceof HTMLButtonElement)) return
          submitButton.current = button
          waiting.current = true
          seenBusy.current = false
          ticks.current = 0
        }}
        onClickCapture={(event) => {
          const target = event.target
          if (!(target instanceof Element)) return
          const submit = target.closest('button[type="submit"]')
          if (submit instanceof HTMLButtonElement) {
            submitButton.current = submit
            waiting.current = true
            seenBusy.current = false
            ticks.current = 0
          }
          if (target.closest('[role="switch"],[role="checkbox"]')) markDirty()
          if (!target.closest('[data-slot="sheet-close"]')) return
          if (!dirtyRef.current && !pending) return
          event.preventDefault()
          event.stopPropagation()
          askToDiscard()
        }}
        onInteractOutside={blockIfDirty}
        onPointerDownOutside={blockIfDirty}
        onEscapeKeyDown={(event) => {
          if (document.querySelector(PORTED_UI)) return
          blockIfDirty(event)
        }}
      >
        {children}
        {pending && <FormPending />}
        <SheetPrimitive.Close asChild>
          <button ref={closeRef} type="button" className="hidden" tabIndex={-1} aria-hidden />
        </SheetPrimitive.Close>
        {showCloseButton && (
          <SheetPrimitive.Close data-slot="sheet-close" asChild>
            <Button variant="ghost" className="absolute top-3 right-3 z-30" size="icon-sm" disabled={pending}>
              <XIcon />
              <span className="sr-only">Close</span>
            </Button>
          </SheetPrimitive.Close>
        )}
        <DiscardChangesDialog
          key={promptKey}
          open={confirmDiscard}
          onKeepEditing={() => setConfirmDiscard(false)}
          onDiscard={discard}
        />
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("gap-0.5 p-4 flex flex-col", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("gap-2 p-4 mt-auto flex flex-col", className)}
      {...props}
    />
  )
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-foreground text-sm font-medium", className)}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-muted-foreground text-xs/relaxed", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
