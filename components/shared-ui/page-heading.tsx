'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

type PageHeaderValue = {
  title: string
  description: string
}

const PageHeaderContext = createContext<{
  header: PageHeaderValue
  setHeader: (value: PageHeaderValue) => void
} | null>(null)

export function PageHeaderProvider({ children }: { children: React.ReactNode }) {
  const [header, setHeaderState] = useState<PageHeaderValue>({ title: '', description: '' })
  const setHeader = useCallback((value: PageHeaderValue) => {
    setHeaderState(value)
  }, [])
  const value = useMemo(() => ({ header, setHeader }), [header, setHeader])
  return (
    <PageHeaderContext.Provider value={value}>
      {children}
    </PageHeaderContext.Provider>
  )
}

export function usePageHeader() {
  return useContext(PageHeaderContext)?.header ?? { title: '', description: '' }
}

export function PageHeading({
  title,
  description = '',
}: {
  title: string
  description?: string
}) {
  const setHeader = useContext(PageHeaderContext)?.setHeader

  useEffect(() => {
    setHeader?.({ title, description })
    return () => setHeader?.({ title: '', description: '' })
  }, [setHeader, title, description])

  return null
}
