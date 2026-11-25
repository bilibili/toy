/**
 * Local "new notification" marker for the tab badge.
 *
 * The CLI is explicitly read-only: `toy notify` never clears the platform's
 * unread state; only opening the web notifications page does. The badge should
 * therefore track "new since I last opened Notifications here", not pretend to
 * mirror the platform counter. This marker is stored per account in
 * localStorage and never sent anywhere.
 */

const KEY = 'dsh-toy-notify-seen-v1'

function readMap(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(KEY)
    const parsed: unknown = raw === null ? {} : JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, number>) : {}
  } catch {
    return {}
  }
}

export function readNotifySeen(uid: number | undefined): number | undefined {
  const value = readMap()[uid === undefined ? 'anon' : String(uid)]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * Record the newest notification the creator has seen. The marker only ever
 * moves forward: opening a narrower category must not make already-read
 * notifications look new again.
 */
export function writeNotifySeen(uid: number | undefined, latestCtime: number): void {
  if (!Number.isFinite(latestCtime)) return
  try {
    const map = readMap()
    const key = uid === undefined ? 'anon' : String(uid)
    const previous = map[key]
    map[key] = typeof previous === 'number' && Number.isFinite(previous) ? Math.max(previous, latestCtime) : latestCtime
    window.localStorage.setItem(KEY, JSON.stringify(map))
  } catch {
    // Storage unavailable: the badge falls back to session behaviour.
  }
}
