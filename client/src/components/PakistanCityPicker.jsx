import { useEffect, useRef, useState } from 'react'
import { PAKISTAN_CITIES } from '../data/pakistanCities'
import { inputClass } from '../ui'

// Searchable, scrollable list of Pakistani cities for the add-city form. The
// list opens as soon as the field is focused, filters as the admin types, and
// choosing an entry fills the city, province and country fields. Typing a name
// that is not listed is still allowed — the picker is a shortcut, not a rule.
export default function PakistanCityPicker({ id, value, onChange, onSelect, error, takenNames = [] }) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const box = useRef(null)
  const list = useRef(null)

  const taken = new Set(takenNames.map((name) => name.trim().toLowerCase()))
  const query = value.trim().toLowerCase()
  const options = query ? PAKISTAN_CITIES.filter((city) => city.name.toLowerCase().includes(query)) : PAKISTAN_CITIES
  const activeIndex = options.length ? Math.min(active, options.length - 1) : -1

  useEffect(() => {
    if (!open) return undefined
    const onOutside = (event) => {
      if (!box.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [open])

  // Keep the highlighted row visible while arrowing through a long list.
  useEffect(() => {
    if (!open || activeIndex < 0) return
    list.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex])

  function choose(city) {
    if (taken.has(city.name.toLowerCase())) return
    onSelect(city)
    setOpen(false)
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      setOpen(false)
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!open) {
        setOpen(true)
        setActive(0)
      } else {
        setActive(Math.min(activeIndex + 1, options.length - 1))
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        setOpen(true)
        setActive(Math.max(options.length - 1, 0))
      } else {
        setActive(Math.max(activeIndex - 1, 0))
      }
    } else if (event.key === 'Enter' && open && options[activeIndex]) {
      event.preventDefault()
      choose(options[activeIndex])
    }
  }

  return (
    <div ref={box} className="relative min-w-0">
      <label htmlFor={id} className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-[0.1em] text-muted">
        New city
      </label>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={open && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
        autoComplete="off"
        required
        value={value}
        onChange={(event) => {
          setActive(0)
          setOpen(true)
          onChange(event)
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search or pick a city"
        className={`h-11 ${inputClass} ${error ? 'border-clay' : ''}`}
      />
      {open && (
        <ul
          ref={list}
          id={`${id}-list`}
          role="listbox"
          aria-label="Cities of Pakistan"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-line bg-white py-1 shadow-lg"
        >
          {options.length === 0 ? (
            <li className="px-4 py-3 text-sm text-muted">
              No city matches. You can still type the name and fill the province yourself.
            </li>
          ) : (
            options.map((city, index) => {
              const alreadyAdded = taken.has(city.name.toLowerCase())
              return (
                <li
                  key={`${city.name}-${city.province}`}
                  id={`${id}-option-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  aria-disabled={alreadyAdded || undefined}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(city)}
                  className={`flex items-center justify-between gap-3 px-4 py-2.5 text-sm ${
                    alreadyAdded
                      ? 'cursor-not-allowed text-muted/60'
                      : `cursor-pointer ${index === activeIndex ? 'bg-sand text-ink' : 'text-ink'}`
                  }`}
                >
                  <span className="font-medium">{city.name}</span>
                  <span className="text-[11.5px] text-muted">{alreadyAdded ? 'Already added' : city.province}</span>
                </li>
              )
            })
          )}
        </ul>
      )}
      {error ? <p className="mt-1.5 text-xs text-clay">{error}</p> : null}
    </div>
  )
}
