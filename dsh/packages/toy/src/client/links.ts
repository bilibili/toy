/**
 * Official Toy links the panel opens. Kept in one place so the home shortcuts,
 * the notifications footer and the "more info" page cannot drift.
 */

export const TOY_LINKS = {
  /** Creator publish platform (upload, SDK/CLI entry, guide, notifications). */
  publish: 'https://www.bilibili.com/toy/publish/',
  sdk: 'https://www.bilibili.com/toy/publish/sdk',
  cli: 'https://www.bilibili.com/toy/publish/sdk/cli',
  guide: 'https://www.bilibili.com/toy/publish/guide',
  /** Ops whitepaper, as published by the platform. */
  whitepaper: 'https://www.bilibili.com/toy/toy-ops-whitepaper/index.html',
  /** Developer FAQ opus. */
  faq: 'https://www.bilibili.com/opus/1241171666570051585',
  /** Q&A forum (B站 bubble community). */
  forum: 'https://www.bilibili.com/bubble/home/86',
  /** Review support via WeCom customer service. */
  support: 'https://work.weixin.qq.com/kfid/kfcfa8b59d80ebaf241',
  notifications: 'https://www.bilibili.com/toy/publish/notifications',
  /** Public Toy square (community browse). */
  square: 'https://www.bilibili.com/btoy/square/',
} as const

/** Open one link in a new tab, ignoring popup failures. */
export function openLink(url: string): void {
  try {
    window.open(url, '_blank', 'noopener,noreferrer')
  } catch {
    // Popup blocked: the pages also render a plain anchor the user can click.
  }
}
