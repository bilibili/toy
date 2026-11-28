/**
 * The consumer-facing home for signed-out users and signed-in accounts without
 * published Toys. It exposes the Toy square, the official account video feed and
 * the creator entry, using the curated snapshot in `content.ts` (the data feed
 * is a later iteration).
 */

import { createElement as h } from 'react'
import type { ReactNode } from 'react'

import type { Audience } from './audience.ts'
import { OFFICIAL_VIDEOS, TOY_OFFICIAL, WEEKLY_EDITION, WEEKLY_TOYS } from './content.ts'
import type { Copy } from './i18n.ts'
import { TOY_LINKS } from './links.ts'
import { Button, ExternalLink, Icon } from './ui.tsx'

export function ConsumerHome({
  copy,
  audience,
  onLogin,
}: {
  readonly copy: Copy
  readonly audience: Exclude<Audience, 'creator'>
  readonly onLogin: () => void
}): ReactNode {
  const anonymous = audience === 'anonymous'
  return h(
    'div',
    { className: 'toy-home toy-consumer' },
    h(
      'section',
      { className: 'toy-consumer-hero' },
      h('div', { className: 'toy-hero-kicker' }, copy.homeKicker),
      h('h2', { className: 'toy-hero-title' }, copy.consumerTitle),
      h('p', { className: 'toy-hero-sub' }, anonymous ? copy.consumerSubAnonymous : copy.consumerSubVisitor),
      h(
        'div',
        { className: 'toy-hero-actions' },
        anonymous
          ? h(Button, { variant: 'primary', onClick: onLogin }, h(Icon, { name: 'login', size: 18 }), copy.login)
          : null,
        h(ExternalLink, { className: 'toy-btn', href: TOY_LINKS.square, label: copy.consumerSquareCta }),
        anonymous
          ? h(ExternalLink, { className: 'toy-btn', href: TOY_LINKS.apply, label: copy.consumerApplyCta })
          : h(ExternalLink, { className: 'toy-btn', href: TOY_LINKS.publish, label: copy.consumerCreateCta }),
      ),
    ),
    anonymous
      ? null
      : h(
          'section',
          { className: 'toy-consumer-permission' },
          h('div', { className: 'toy-consumer-permission-copy' },
            h('div', { className: 'toy-section-title' }, copy.consumerPermissionTitle),
            h('p', { className: 'toy-caption' }, copy.consumerPermissionBody),
          ),
          h(
            'div',
            { className: 'toy-consumer-permission-actions' },
            h(ExternalLink, { className: 'toy-btn', href: TOY_LINKS.publish, label: copy.consumerCreateCta }),
            h(ExternalLink, { className: 'toy-btn', href: TOY_LINKS.apply, label: copy.consumerApplyCta }),
          ),
        ),
    h(
      'section',
      { className: 'toy-consumer-section' },
      h(
        'div',
        { className: 'toy-consumer-head' },
        h('div', {},
          h('div', { className: 'toy-section-title' }, copy.consumerWeeklyNo(WEEKLY_EDITION)),
          h('div', { className: 'toy-caption' }, copy.consumerWeeklyHint),
        ),
        h(ExternalLink, { className: 'toy-btn', href: TOY_LINKS.square, label: copy.consumerViewAll }),
      ),
      h(
        'div',
        { className: 'toy-weekly-scroller' },
        WEEKLY_TOYS.map((toy) =>
          h(
            'a',
            { key: toy.url, className: 'toy-square-card', href: toy.url, target: '_blank', rel: 'noreferrer' },
            h('span', { className: 'toy-square-cover' },
              h('img', { src: toy.poster, alt: toy.title, loading: 'lazy', referrerPolicy: 'no-referrer' }),
            ),
            h('span', { className: 'toy-square-info' },
              h('img', { className: 'toy-square-bg', src: toy.poster, alt: '', 'aria-hidden': true, loading: 'lazy', referrerPolicy: 'no-referrer' }),
              h('span', { className: 'toy-square-tint', 'aria-hidden': true }),
              h('span', { className: 'toy-square-body' },
                h('span', { className: 'toy-square-title', title: toy.title }, toy.title),
                h('span', { className: 'toy-square-meta' }, `${toy.category} · ${toy.author} · ${copy.consumerPlays(toy.plays)}`),
              ),
            ),
          ),
        ),
      ),
    ),
    h(
      'section',
      { className: 'toy-consumer-section' },
      h(
        'div',
        { className: 'toy-consumer-head' },
        h('div', {},
          h('div', { className: 'toy-section-title' }, copy.consumerVideos),
          h('div', { className: 'toy-caption' }, copy.consumerVideosHint),
        ),
        h(ExternalLink, { className: 'toy-btn', href: TOY_OFFICIAL.space, label: copy.consumerFollow }),
      ),
      h(
        'div',
        { className: 'toy-video-grid' },
        OFFICIAL_VIDEOS.map((video) =>
          h(
            'a',
            { key: video.url, className: 'toy-video-card', href: video.url, target: '_blank', rel: 'noreferrer' },
            h('span', { className: 'toy-video-cover' },
              h('img', { src: video.cover, alt: video.title, loading: 'lazy', referrerPolicy: 'no-referrer' }),
              h('span', { className: 'toy-video-duration' }, video.duration),
            ),
            h('span', { className: 'toy-video-title', title: video.title }, video.title),
            h('span', { className: 'toy-video-meta' }, copy.consumerViews(video.views), h('span', {}, ' · '), video.published),
          ),
        ),
      ),
    ),
  )
}
