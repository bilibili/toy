/**
 * A compact searchable Toy picker.
 *
 * The panel can hold hundreds of Toys, so a native `<select>` is unusable: the
 * trigger shows the current choice and the popover filters as you type. The
 * list is capped and the search matches title, slug and id.
 */

import { createElement as h, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'

import { matchToy } from './filters.js'
import type { Copy } from './i18n.ts'
import { Icon } from './ui.tsx'
import type { ToySummary } from '../shared/types.ts'

/** How many matches the popover renders at most. */
const MAX_RESULTS = 60

/** The searchable Toy picker used by the Stats and Publish tabs. */
export function ToyPicker({
  copy,
  toys,
  value,
  onChange,
  placeholder,
}: {
  readonly copy: Copy
  readonly toys: readonly ToySummary[]
  readonly value?: number | undefined
  readonly onChange: (toy: ToySummary) => void
  readonly placeholder?: string
}): ReactNode {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement | null>(null)
  const listId = useId()
  const selected = toys.find((toy) => toy.id === value)
  const results = useMemo(
    () => toys.filter((toy) => matchToy(toy, query)).slice(0, MAX_RESULTS),
    [toys, query],
  )

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent): void => {
      if (rootRef.current !== null && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return h(
    'div',
    { className: 'toy-picker', ref: rootRef },
    h(
      'button',
      {
        type: 'button',
        className: 'toy-picker-trigger',
        'aria-haspopup': 'listbox',
        'aria-expanded': open,
        'aria-controls': listId,
        onClick: () => setOpen((current) => !current),
      },
      h(Icon, { name: 'search' }),
      h(
        'span',
        { className: selected === undefined ? 'toy-picker-placeholder' : 'toy-picker-value', title: selected?.title },
        selected === undefined ? (placeholder ?? copy.pickerPlaceholder) : `${selected.title} (#${selected.id})`,
      ),
      h(Icon, { name: 'chevronDown', size: 13 }),
    ),
    open
      ? h(
          'div',
          { className: 'toy-picker-menu' },
          h('input', {
            className: 'toy-input toy-picker-search',
            value: query,
            autoFocus: true,
            placeholder: copy.pickerSearch,
            'aria-label': copy.pickerSearch,
            onChange: (event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value),
          }),
          results.length === 0
            ? h('div', { className: 'toy-picker-empty' }, copy.pickerNoMatches)
            : h(
                'ul',
                { className: 'toy-picker-list', id: listId, role: 'listbox', 'aria-label': copy.selectToy },
                results.map((toy) =>
                  h(
                    'li',
                    { key: String(toy.id), role: 'none' },
                    h(
                      'button',
                      {
                        type: 'button',
                        role: 'option',
                        'aria-selected': toy.id === value,
                        className: 'toy-picker-option',
                        onClick: () => {
                          onChange(toy)
                          setOpen(false)
                          setQuery('')
                        },
                      },
                      h('span', { className: 'toy-picker-option-title', title: toy.title }, toy.title),
                      h(
                        'span',
                        { className: 'toy-picker-option-meta' },
                        `#${toy.id}`,
                        toy.status === undefined || toy.status === '' ? null : h('span', { className: 'toy-caption' }, ` · ${toy.status}`),
                      ),
                    ),
                  ),
                ),
              ),
        )
      : null,
  )
}
