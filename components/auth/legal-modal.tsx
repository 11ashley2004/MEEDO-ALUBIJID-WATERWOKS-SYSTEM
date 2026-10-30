"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { X, FileText, ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"

export type LegalDoc = "terms" | "privacy"

type DocContent = {
  title: string
  tabLabel: string
  icon: typeof FileText
  updated: string
  sections: { heading: string; body: string }[]
}

const DOCS: Record<LegalDoc, DocContent> = {
  terms: {
    title: "Terms of Service",
    tabLabel: "Terms",
    icon: FileText,
    updated: "Last updated: October 2026",
    sections: [
      {
        heading: "1. Acceptance of Terms",
        body: "By accessing or using the MEEDO Water Billing Management System (\u201cMEEDO\u201d), you agree to be bound by these Terms of Service. If you do not agree with any part of these terms, you must not use the system. MEEDO is intended solely for authorized personnel of MEEDO Waterworks.",
      },
      {
        heading: "2. Authorized Use",
        body: "Access to MEEDO is restricted to authorized staff, administrators, and personnel explicitly granted credentials by the system administrator. You may use the system only for legitimate water utility operations, including managing consumers, meters, readings, billing, payments, and maintenance job orders. Any unauthorized access, attempted access, or use for personal or malicious purposes is strictly prohibited and may result in disciplinary and/or legal action.",
      },
      {
        heading: "3. Account Security",
        body: "You are responsible for maintaining the confidentiality of your login credentials, including your email address and password. You must not share your account with any other person. You agree to notify your system administrator immediately if you suspect any unauthorized use of your account. MEEDO employs verification codes and CAPTCHA checks to help protect your account \u2014 you agree to complete these checks as required.",
      },
      {
        heading: "4. Data Accuracy",
        body: "You are responsible for the accuracy and completeness of all information you enter into the system, including consumer records, meter readings, and payment entries. Inaccurate data may affect billing, service delivery, and regulatory compliance. Always verify entries before saving or submitting them.",
      },
      {
        heading: "5. Consumer Contact Information",
        body: "Phone numbers stored in consumer records are collected only so that authorized MEEDO personnel can contact a consumer by voice call regarding account-related concerns, service interruptions, maintenance schedules, or other legitimate utility matters. Phone numbers are not used for SMS campaigns, billing statements, payment reminders, marketing, or any automated messaging of any kind. Billing statements and payment notices are delivered through their official, documented channels and never through consumer phone numbers.",
      },
      {
        heading: "6. Intellectual Property",
        body: "MEEDO, including its design, code, logos, and content, is the property of MEEDO Waterworks and its licensors. You may not copy, modify, distribute, or reverse-engineer any part of the system without prior written permission.",
      },
      {
        heading: "7. Limitation of Liability",
        body: "MEEDO is provided \u201cas is\u201d for internal utility operations. To the fullest extent permitted by law, MEEDO Waterworks shall not be liable for any indirect, incidental, or consequential damages arising from the use or inability to use the system, including errors in billing data or service interruptions.",
      },
      {
        heading: "8. Changes to Terms",
        body: "These Terms may be updated from time to time. Continued use of the system after changes are posted constitutes acceptance of the revised Terms. The current version will always be available through the login page.",
      },
      {
        heading: "9. Contact",
        body: "For questions about these Terms of Service, contact your MEEDO system administrator or the MEEDO Waterworks office.",
      },
    ],
  },
  privacy: {
    title: "Privacy Policy",
    tabLabel: "Privacy",
    icon: ShieldCheck,
    updated: "Last updated: October 2026",
    sections: [
      {
        heading: "1. Information We Collect",
        body: "MEEDO collects the information necessary to operate the water billing system, including: your email address (used as your login identifier), password (stored only in hashed form), verification codes, and operational data you enter such as consumer profiles, meter readings, billing records, and payment information. Consumer records may also include a phone number, which is used strictly for voice contact as described below.",
      },
      {
        heading: "2. How We Use Your Information",
        body: "We use your information to: authenticate your identity and secure your account; process meter readings, billing, and payments; manage consumers and maintenance job orders; generate reports and audit trails; and communicate with you regarding your account or system notices. Phone numbers stored in consumer records are used only to contact a consumer by voice call about account-related matters or service updates. We do not use phone numbers to send SMS messages, billing statements, payment reminders, promotional content, or any other form of automated or mass messaging.",
      },
      {
        heading: "3. Verification & Security",
        body: "MEEDO uses email verification codes and CAPTCHA verification to protect accounts from unauthorized access. All credentials are stored in encrypted or hashed form. Access to consumer and financial data is restricted based on your role within the organization.",
      },
      {
        heading: "4. Phone Number Data",
        body: "Phone numbers are collected solely for legitimate utility operations. They are used only to: (a) contact a consumer by voice call regarding account-related concerns; (b) place service-related voice calls about service interruptions or maintenance work; and (c) place voice calls for account recovery support when requested through proper channels. Phone numbers are never used for SMS messaging, billing notifications, payment reminders, automated text campaigns, marketing, or any similar purpose. They are never sold, rented, or shared with third parties for marketing purposes.",
      },
      {
        heading: "5. Data Sharing",
        body: "We do not sell, rent, or trade personal information to third parties. Data may be shared only: (a) within MEEDO Waterworks among authorized personnel who need it to perform their duties; (b) when required by law, regulation, or a valid government request; or (c) with trusted service providers who host or support the system under strict confidentiality obligations. Phone numbers are not shared with any third-party messaging, SMS, or marketing provider.",
      },
      {
        heading: "6. Data Retention",
        body: "Operational records, including billing and payment history, are retained for as long as required for legal, regulatory, and auditing purposes. Account information is retained while your account is active and removed upon request by the system administrator, subject to applicable retention obligations.",
      },
      {
        heading: "7. Your Rights",
        body: "You may request access to, correction of, or deletion of personal information by contacting the system administrator. Consumers may also request that their phone number be updated or removed from the contact list, subject to service and legal requirements.",
      },
      {
        heading: "8. Cookies & Tracking",
        body: "MEEDO uses only essential session cookies required for authentication and security. CAPTCHA services may set their own cookies solely for the purpose of verifying that you are human.",
      },
      {
        heading: "9. Changes to This Policy",
        body: "This Privacy Policy may be updated periodically. The latest version will always be accessible from the login page. Continued use of the system after an update constitutes acceptance of the revised policy.",
      },
      {
        heading: "10. Contact",
        body: "For privacy-related questions or requests, contact your MEEDO system administrator or the MEEDO Waterworks office.",
      },
    ],
  },
}

const TAB_ORDER: LegalDoc[] = ["terms", "privacy"]

/** "3. Account Security" -> { num: "3", text: "Account Security" } */
function splitHeading(heading: string) {
  const m = heading.match(/^(\d+)\.\s*(.*)$/)
  return m ? { num: m[1], text: m[2] } : { num: "", text: heading }
}

export function LegalModal({
  doc,
  open,
  onClose,
}: {
  doc: LegalDoc
  open: boolean
  onClose: () => void
}) {
  const [mounted, setMounted] = useState(false)
  const [active, setActive] = useState<LegalDoc>(doc)
  const [progress, setProgress] = useState(0)

  const panelRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastFocused = useRef<HTMLElement | null>(null)

  useEffect(() => setMounted(true), [])

  // Open on the document the user clicked
  useEffect(() => {
    if (open) {
      setActive(doc)
      setProgress(0)
    }
  }, [open, doc])

  // Back to the top + reset progress when switching tabs
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
    setProgress(0)
  }, [active])

  // Lock body scroll, close on Escape, move focus in and restore it on close
  useEffect(() => {
    if (!open) return
    lastFocused.current = document.activeElement as HTMLElement | null
    const original = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    panelRef.current?.focus()
    return () => {
      document.body.style.overflow = original
      window.removeEventListener("keydown", onKey)
      lastFocused.current?.focus?.()
    }
  }, [open, onClose])

  if (!mounted || !open) return null

  const content = DOCS[active]
  const Icon = content.icon

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const max = el.scrollHeight - el.clientHeight
    setProgress(max > 0 ? Math.min(1, el.scrollTop / max) : 1)
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6 pb-10"
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 animate-in fade-in bg-purple-950/50 backdrop-blur-sm duration-200"
        onClick={onClose}
      />

      {/* Panel: bottom sheet on mobile, centered dialog from sm up */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          "relative z-10 flex w-full max-w-lg flex-col overflow-hidden bg-white outline-none rounded-md",
          "h-[88svh] rounded-t-md border border-b-0 border-slate-200",
          "sm:h-auto sm:max-h-[85vh] sm:rounded-md sm:border-b",
          "shadow-2xl shadow-purple-950/20",
          "animate-in fade-in slide-in-from-bottom-6 duration-200 sm:zoom-in-95 sm:slide-in-from-bottom-0 mx-2",
        )}
      >
        {/* Header */}
        <div className="bg-purple-700">
          {/* Mobile grab handle (visual cue that it's a sheet) */}
          <div className="flex justify-center pt-2 sm:hidden">
            <span className="h-1 w-10 rounded-full bg-purple-300/40" />
          </div>

          <div className="flex items-center gap-3 px-4 pb-3 pt-3 sm:px-5 sm:py-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-purple-600/70 ring-1 ring-purple-400/40">
              <Icon className="h-5 w-5 text-purple-100" />
            </div>
            <div className="min-w-0 flex-1">
              <h2
                id="legal-modal-title"
                className="truncate text-base font-bold leading-tight text-white"
              >
                {content.title}
              </h2>
              <p className="text-[11px] text-purple-200/80">{content.updated}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md border border-purple-400/40 bg-purple-600/50 text-purple-100 transition-colors hover:bg-purple-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 sm:h-9 sm:w-9"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Tabs */}
          <div
            role="tablist"
            aria-label="Legal documents"
            className="grid grid-cols-2 gap-1.5 px-4 pb-3 sm:px-5"
          >
            {TAB_ORDER.map((id) => {
              const isActive = active === id
              const TabIcon = DOCS[id].icon
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActive(id)}
                  className={cn(
                    "flex h-10 items-center justify-center gap-2 rounded-md border text-xs font-semibold transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300",
                    isActive
                      ? "border-white bg-white text-purple-800"
                      : "border-purple-400/40 bg-purple-600/40 text-purple-100 hover:bg-purple-600/70",
                  )}
                >
                  <TabIcon className="h-3.5 w-3.5" />
                  {DOCS[id].tabLabel}
                </button>
              )
            })}
          </div>

          {/* Reading progress */}
          <div className="h-0.5 w-full bg-purple-900/40">
            <div
              className="h-full bg-purple-300 transition-[width] duration-100"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>

        {/* Body */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          role="tabpanel"
          className="flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-5"
        >
          <ol className="flex flex-col gap-6">
            {content.sections.map((section) => {
              const { num, text } = splitHeading(section.heading)
              return (
                <li key={section.heading} className="flex gap-3">
                  {num && (
                    <span
                      aria-hidden
                      className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border border-purple-200 bg-purple-50 text-[11px] font-bold text-purple-700"
                    >
                      {num}
                    </span>
                  )}
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <h3 className="text-sm font-bold leading-6 text-purple-900">
                      {text}
                    </h3>
                    <p className="text-sm leading-6 text-slate-600">
                      {section.body}
                    </p>
                  </div>
                </li>
              )
            })}
          </ol>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 bg-slate-50 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
          <div className="rounded-md border border-gray-300 bg-white p-1">
            <button
              type="button"
              onClick={onClose}
              className={cn(
                "h-11 w-full rounded-md border border-purple-400/40 bg-purple-700",
                "text-sm font-semibold text-white shadow-sm transition-colors",
                "hover:border-purple-300/50 hover:bg-purple-600",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300",
              )}
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}