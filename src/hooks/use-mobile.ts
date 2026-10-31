import * as React from "react"

const MOBILE_BREAKPOINT = 768
// The exact query behind Tailwind's `md:` variant, which shows the desktop sidebar. Mobile is its
// complement, so the mobile Sheet and the desktop sidebar can never both be hidden. Reading
// `window.innerWidth` instead can disagree with CSS: it is rounded (a 767.5px viewport matches neither
// side) and in iOS standalone PWAs it can still hold the pre-rotation width when the query changes.
const DESKTOP_QUERY = `(min-width: ${MOBILE_BREAKPOINT}px)`

function subscribe(onChange: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {}
  const mql = window.matchMedia(DESKTOP_QUERY)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

function getSnapshot() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false
  return !window.matchMedia(DESKTOP_QUERY).matches
}

function getServerSnapshot() {
  return false
}

export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
