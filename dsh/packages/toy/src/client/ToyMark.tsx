/**
 * The bilibili Toy mark (black T with the five brand-coloured tiles on a white
 * rounded tile). Shared by the sidebar panel icon and the panel header.
 */

import { createElement as h } from 'react'
import type { ReactNode } from 'react'

export function ToyMark({ size = 20 }: { readonly size?: number }): ReactNode {
  return h(
    'svg',
    { width: size, height: size, viewBox: '0 0 48 48', 'aria-hidden': true, style: { flex: '0 0 auto', display: 'block' } },
    h('rect', { width: 48, height: 48, rx: 10, fill: '#fff' }),
    h('path', {
      fill: '#18191C',
      d: 'M4 1h40a3 3 0 0 1 3 3v15H33v26a3 3 0 0 1-3 3H18a3 3 0 0 1-3-3V19H1V4a3 3 0 0 1 3-3Z',
    }),
    h('rect', { x: 5, y: 5, width: 9, height: 9, rx: 2, fill: '#00AEEC' }),
    h('rect', { x: 20, y: 5, width: 9, height: 9, rx: 2, fill: '#FF6699' }),
    h('rect', { x: 34, y: 5, width: 9, height: 9, rx: 2, fill: '#FFDC40' }),
    h('rect', { x: 20, y: 20, width: 9, height: 9, rx: 2, fill: '#2AC864' }),
    h('rect', { x: 20, y: 34, width: 9, height: 9, rx: 2, fill: '#AC6DFF' }),
  )
}
