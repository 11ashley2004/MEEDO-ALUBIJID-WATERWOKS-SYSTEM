'use client'

import { Search, Loader2, Check, X, ChevronsUpDown } from 'lucide-react'
import { useRef, useState, useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { useDebouncedSearch } from '@/lib/hooks/use-debounced-search'

export interface ComboboxOption {
  value: string
  label: string
}

interface CustomSearchComboboxProps {
  /** Currently selected value (controlled) */
  value: string
  /** Called when user picks an option or clears */
  onChange: (value: string) => void
  /** Async function to fetch options given a search string */
  onSearch: (query: string) => Promise<ComboboxOption[]>
  /** Debounce delay in ms (default: 350) */
  debounceMs?: number
  placeholder?: string
  id?: string
  isInvalid?: boolean
}

const CustomSearchCombobox = ({
  value,
  onChange,
  onSearch,
  debounceMs = 350,
  placeholder = 'Search...',
  id,
  isInvalid = false,
}: CustomSearchComboboxProps) => {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [options, setOptions] = useState<ComboboxOption[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedOption, setSelectedOption] = useState<ComboboxOption | null>(null)

  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Sync selectedOption when value is reset externally (e.g. form.reset())
  useEffect(() => {
    if (!value) {
      setSelectedOption(null)
      setSearchQuery('')
      setOptions([])
      setDropdownOpen(false)
    }
  }, [value])

  const debouncedQuery = useDebouncedSearch(searchQuery, debounceMs)

  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setOptions([])
      setIsSearching(false)
      return
    }

    let cancelled = false
    setIsSearching(true)
    onSearch(debouncedQuery)
      .then((results) => {
        if (!cancelled) setOptions(results)
      })
      .catch((err) => {
        console.error('CustomSearchCombobox search error:', err)
      })
      .finally(() => {
        if (!cancelled) setIsSearching(false)
      })

    return () => { cancelled = true }
  }, [debouncedQuery, onSearch])

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query)
    setDropdownOpen(true)
    if (!query.trim()) {
      setOptions([])
      setIsSearching(false)
    }
  }, [])

  const handleSelect = useCallback((option: ComboboxOption) => {
    setSelectedOption(option)
    onChange(option.value)
    setSearchQuery('')
    setDropdownOpen(false)
  }, [onChange])

  const handleClear = useCallback(() => {
    setSelectedOption(null)
    onChange('')
    setSearchQuery('')
    setOptions([])
    setDropdownOpen(false)
    inputRef.current?.focus()
  }, [onChange])

  return (
    <div ref={dropdownRef} className="relative w-full">
      {/* Input row */}
      <div className={cn(
        'flex items-center w-full border bg-transparent px-3 py-0.5 text-sm shadow-sm transition-colors bg-popover',
        'focus-within:ring-1 focus-within:ring-ring',
        isInvalid
          ? 'border-destructive focus-within:ring-destructive'
          : 'border-input'
      )}>
        <Search className="h-4 w-4 text-muted-foreground shrink-0 mr-2" />

        {selectedOption ? (
          <span className="flex-1 py-1 text-sm">
            {selectedOption.label}
          </span>
        ) : (
          <input
            ref={inputRef}
            id={id}
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={() => setDropdownOpen(true)}
            placeholder={placeholder}
            className="flex-1 bg-transparent py-1 outline-none placeholder:text-muted-foreground text-sm"
            autoComplete="off"
          />
        )}

        {selectedOption && (
          <button
            type="button"
            onClick={handleClear}
            className="ml-1 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Clear selection"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            if (selectedOption) {
              handleClear()
            } else {
              setDropdownOpen((prev) => !prev)
              inputRef.current?.focus()
            }
          }}
          className="ml-1 text-muted-foreground hover:text-foreground transition-colors"
          tabIndex={-1}
        >
          <ChevronsUpDown className="h-4 w-4" />
        </button>
      </div>

      {/* Dropdown */}
      {dropdownOpen && (
        <div className="absolute z-10 mt-1 w-full border border-input bg-popover text-popover-foreground shadow-md">

          {/* Idle */}
          {!searchQuery.trim() && !isSearching && (
            <div className="flex flex-col items-center justify-center py-6 gap-2 text-center">
              <Search className="h-5 w-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Start typing to search
              </p>
            </div>
          )}

          {/* Searching */}
          {isSearching && (
            <div className="flex items-center justify-center py-6 gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Searching...</p>
            </div>
          )}

          {/* No results */}
          {!isSearching && searchQuery.trim() && options.length === 0 && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No results found.
            </div>
          )}

          {/* Results */}
          {!isSearching && options.length > 0 && (
            <ul className="max-h-60 overflow-y-auto py-1">
              {options.map((option) => (
                <li
                  key={option.value}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    handleSelect(option)
                  }}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 text-sm cursor-pointer select-none',
                    'hover:bg-accent hover:text-accent-foreground transition-colors',
                    value === option.value && 'bg-accent/50'
                  )}
                >
                  <Check className={cn(
                    'h-4 w-4 shrink-0',
                    value === option.value ? 'opacity-100' : 'opacity-0'
                  )} />
                  {option.label}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export default CustomSearchCombobox