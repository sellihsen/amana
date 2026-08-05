import { useState, useRef, useEffect } from 'react'
import { ChevronDown, X } from 'lucide-react'

function normalizeOption(opt) {
  if (opt === null || opt === undefined) return { value: '', label: '' }
  if (typeof opt === 'string' || typeof opt === 'number') return { value: String(opt), label: String(opt) }
  return { value: String(opt.value ?? opt.id ?? ''), label: String(opt.label ?? opt.nom ?? '') }
}

export default function SearchableSelect({
  options = [],
  value,
  onChange,
  placeholder = 'Sélectionner...',
  className = '',
  disabled = false,
  required = false,
  searchPlaceholder = 'Rechercher...',
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef(null)
  const inputRef = useRef(null)

  const normalized = options.map(normalizeOption)
  const selected = normalized.find((o) => o.value === String(value ?? ''))
  const filtered = search
    ? normalized.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : normalized

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  const handleSelect = (opt) => {
    onChange(opt.value)
    setIsOpen(false)
    setSearch('')
  }

  const handleClear = (e) => {
    e.stopPropagation()
    onChange('')
    setSearch('')
  }

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <div
        onClick={() => { if (!disabled) setIsOpen(!isOpen) }}
        className={`input-field flex items-center gap-2 cursor-pointer pr-2 ${
          disabled ? 'opacity-50 cursor-not-allowed' : ''
        } ${isOpen ? 'ring-2 ring-amana-500 border-amana-500' : ''}`}
      >
        {isOpen ? (
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="flex-1 bg-transparent outline-none text-sm min-w-0"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className={`flex-1 text-sm truncate ${selected ? 'text-gray-900' : 'text-gray-400'}`}>
            {selected ? selected.label : placeholder}
          </span>
        )}
        {value !== '' && value !== null && value !== undefined && !isOpen && (
          <button onClick={handleClear} className="p-0.5 text-gray-400 hover:text-gray-600 flex-shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-sm text-gray-400 text-center">Aucun résultat</div>
          ) : (
            filtered.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSelect(opt)}
                className={`w-full text-left px-3 py-2.5 text-sm hover:bg-amana-50 transition-colors ${
                  opt.value === String(value ?? '') ? 'bg-amana-50 text-amana-700 font-medium' : 'text-gray-700'
                }`}
              >
                {opt.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
