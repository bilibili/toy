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

export function writeNotifySeen(uid: number | undefined, latestCtime: number): void {
  try {
    const map = readMap()
    map[uid === undefined ? 'anon' : String(uid)] = latestCtime
    window.localStorage.setItem(KEY, JSON.stringify(map))
  } catch {
    // Storage unavailable: the badge falls back to session behaviour.
  }
}
