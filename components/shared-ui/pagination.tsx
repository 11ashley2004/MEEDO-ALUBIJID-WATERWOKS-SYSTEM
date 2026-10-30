'use client'

import type { MouseEvent } from 'react'
import { cn } from '@/lib/utils'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'

function pageItems(page: number, totalPages: number): (number | 'ellipsis')[] {
  if (totalPages <= 5) return Array.from({ length: totalPages }, (_, index) => index + 1)
  if (page <= 3) return [1, 2, 3, 4, 'ellipsis', totalPages]
  if (page >= totalPages - 2) {
    return [1, 'ellipsis', totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
  }
  return [1, 'ellipsis', page - 1, page, page + 1, 'ellipsis', totalPages]
}

export function TablePagination({
  page,
  pageSize,
  total,
  onPageChange,
  className,
}: {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  className?: string
}) {
  if (total <= 0 || pageSize <= 0) return null

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(Math.max(1, page), totalPages)
  const from = (current - 1) * pageSize + 1
  const to = Math.min(current * pageSize, total)

  const go = (event: MouseEvent<HTMLAnchorElement>, next: number) => {
    event.preventDefault()
    if (next < 1 || next > totalPages || next === current) return
    onPageChange(next)
  }

  return (
    <div className={cn('flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between', className)}>
      <p className="text-[11px] text-muted-foreground">
        Showing{' '}
        <span className="font-semibold text-foreground">{from}</span>
        {' – '}
        <span className="font-semibold text-foreground">{to}</span>
        {' of '}
        <span className="font-semibold text-foreground">{total}</span>
      </p>

      {totalPages > 1 && (
        <Pagination className="mx-0 w-full justify-start overflow-x-auto sm:w-auto sm:justify-end">
          <PaginationContent className="gap-1">
            <PaginationItem>
              <PaginationPrevious
                href="#"
                onClick={(event) => go(event, current - 1)}
                className={cn('!rounded-md', current === 1 && 'pointer-events-none opacity-40')}
              />
            </PaginationItem>
            {pageItems(current, totalPages).map((item, index) => (
              <PaginationItem key={`${item}-${index}`}>
                {item === 'ellipsis' ? (
                  <PaginationEllipsis />
                ) : (
                  <PaginationLink
                    href="#"
                    isActive={item === current}
                    onClick={(event) => go(event, item)}
                    className="!rounded-md"
                  >
                    {item}
                  </PaginationLink>
                )}
              </PaginationItem>
            ))}
            <PaginationItem>
              <PaginationNext
                href="#"
                onClick={(event) => go(event, current + 1)}
                className={cn('!rounded-md', current === totalPages && 'pointer-events-none opacity-40')}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  )
}
