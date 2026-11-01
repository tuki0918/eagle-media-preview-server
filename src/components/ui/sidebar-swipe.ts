import * as React from "react"

// Mobile swipe closes the open sidebar only. Swiping it open would start at the screen's left edge,
// where iOS Safari and Android gesture navigation run their own "back" at the same time.
// A drag only takes over once it has moved this far, mostly sideways.
const SIDEBAR_SWIPE_SLOP = 10
// A release faster than this (px/ms) settles in its direction regardless of how far it got.
const SIDEBAR_SWIPE_FLICK_VELOCITY = 0.4
// A paused finger is no longer flicking, even if its last movement was fast.
const SIDEBAR_SWIPE_VELOCITY_MAX_AGE_MS = 100
// Settling normally ends on the Sheet's own `transitionend`; this only covers a transition that never
// runs (already in place, or transitions disabled). Longer than the Sheet's `duration-200`.
const SIDEBAR_SWIPE_SETTLE_FALLBACK_MS = 500

type SidebarSwipePoint = { startX: number; startY: number; x: number; y: number }

// Decides, once the finger has moved far enough, whether this touch drags the open mobile sidebar
// closed. A sheet still sliding after an earlier release can be caught and pulled either way.
// Returns null while the movement is still too small to tell.
export function sidebarSwipeIntent(
  { startX, startY, x, y }: SidebarSwipePoint,
  catchingSettle = false
): "drag" | "ignore" | null {
  const dx = x - startX
  const dy = y - startY
  if (Math.max(Math.abs(dx), Math.abs(dy)) < SIDEBAR_SWIPE_SLOP) return null
  if (Math.abs(dy) > Math.abs(dx)) return "ignore"
  return dx < 0 || catchingSettle ? "drag" : "ignore"
}

// Where a released drag settles, so the sidebar never stays half open: a flick wins, otherwise
// whichever side of halfway it was let go on. `shown` is the visible fraction, `velocity` is px/ms
// with positive meaning rightwards (towards open).
export function sidebarSwipeSettlesOpen(shown: number, velocity: number) {
  if (velocity >= SIDEBAR_SWIPE_FLICK_VELOCITY) return true
  if (velocity <= -SIDEBAR_SWIPE_FLICK_VELOCITY) return false
  return shown >= 0.5
}

// A leftward drag would scroll this element towards its right end instead. Vertical lists also
// compute `overflow-x: auto` (from their `overflow-y`), and a fractional width can make them report
// 1px of overflow, so only real room to scroll counts.
function scrollsWithLeftwardDrag(el: Element, view: Window) {
  const overflowX = view.getComputedStyle(el).overflowX
  if (overflowX !== "auto" && overflowX !== "scroll") return false
  return el.scrollWidth - el.clientWidth - el.scrollLeft > 1
}

// Swipes that start on these belong to the element under the finger, not to the sidebar.
function ignoresSidebarSwipe(target: EventTarget | null, doc: Document) {
  // A preview, slideshow or other modal on top owns its own gestures.
  if (doc.querySelector("dialog[open], [aria-modal='true']")) return true
  const view = doc.defaultView
  if (!view || !(target instanceof view.Element)) return false
  if (target.closest("input, textarea, select, [contenteditable='true'], [data-sidebar-swipe='ignore']")) return true
  for (let el: Element | null = target; el && el !== doc.body; el = el.parentElement) {
    if (scrollsWithLeftwardDrag(el, view)) return true
  }
  return false
}

export type SidebarMobileDrag = {
  // Offset of the Sheet's left edge as a CSS length, clamped to its own width by the transform.
  offset: string
  // True while the finger is down; afterwards the Sheet's own transition animates to `offset`.
  dragging: boolean
}

type Gesture = {
  startX: number
  startY: number
  // Where the sheet's left edge was (px, <= 0) when the touch began; non-zero only when it was still
  // settling, so the drag picks the sheet up from where it is rather than from fully open.
  baseOffset: number
  catchingSettle: boolean
  dragging: boolean
  lastX: number
  lastTime: number
  velocity: number
}

// Lets the open mobile sidebar be dragged closed, following the finger. `sheetId` names the Sheet
// element through its `data-sidebar-sheet` attribute.
export function useMobileSidebarSwipe(
  enabled: boolean,
  setOpen: (open: boolean) => void,
  sheetId: string
) {
  const [drag, setDrag] = React.useState<SidebarMobileDrag | null>(null)

  React.useEffect(() => {
    if (!enabled) return
    let gesture: Gesture | null = null
    let stopFollowing: (() => void) | null = null
    let settling: { open: boolean; stop: () => void } | null = null

    const sheet = () => document.querySelector<HTMLElement>(`[data-sidebar-sheet="${sheetId}"]`)

    const finishSettle = () => {
      const current = settling
      if (!current) return
      settling = null
      current.stop()
      if (!current.open) setOpen(false)
      setDrag(null)
    }

    // Drops a settle without applying it, for a new drag that takes the sheet over mid-animation.
    const abandonSettle = () => {
      settling?.stop()
      settling = null
    }

    // Animates the sheet fully open or closed, then hands its position back to the Sheet.
    const settle = (open: boolean) => {
      finishSettle()
      setDrag({ offset: open ? "0px" : "-100%", dragging: false })
      const el = sheet()
      const handleTransitionEnd = (event: TransitionEvent) => {
        if (event.target === el && event.propertyName === "transform") finishSettle()
      }
      el?.addEventListener("transitionend", handleTransitionEnd)
      const fallback = window.setTimeout(finishSettle, SIDEBAR_SWIPE_SETTLE_FALLBACK_MS)
      settling = {
        open,
        stop: () => {
          el?.removeEventListener("transitionend", handleTransitionEnd)
          window.clearTimeout(fallback)
        },
      }
    }

    // A second finger or a touch the system took over never finished the gesture, so the sidebar
    // returns to where it started (open) instead of acting on wherever the finger happened to be.
    const cancelGesture = () => {
      const current = gesture
      gesture = null
      stopFollowing?.()
      if (current?.dragging) settle(true)
    }

    const handleTouchStart = (event: TouchEvent) => {
      cancelGesture()
      const touch = event.touches.length === 1 ? event.touches[0] : null
      if (!touch || ignoresSidebarSwipe(event.target, document)) return
      const catchingSettle = settling !== null
      gesture = {
        startX: touch.clientX,
        startY: touch.clientY,
        baseOffset: catchingSettle ? Math.min(0, sheet()?.getBoundingClientRect().left ?? 0) : 0,
        catchingSettle,
        dragging: false,
        lastX: touch.clientX,
        lastTime: event.timeStamp,
        velocity: 0,
      }
      // Later touch events always go to the element first touched, and stop reaching the document if a
      // re-render removes it mid-drag, which would leave the sheet stuck half open. Listen on it directly.
      const target = event.target
      if (!target) return
      target.addEventListener("touchmove", handleTouchMove as EventListener, { passive: false })
      target.addEventListener("touchend", handleTouchEnd as EventListener)
      target.addEventListener("touchcancel", cancelGesture)
      stopFollowing = () => {
        target.removeEventListener("touchmove", handleTouchMove as EventListener)
        target.removeEventListener("touchend", handleTouchEnd as EventListener)
        target.removeEventListener("touchcancel", cancelGesture)
        stopFollowing = null
      }
    }

    function handleTouchMove(event: TouchEvent) {
      const touch = event.touches[0]
      if (!gesture || !touch) return
      if (!gesture.dragging) {
        const intent = sidebarSwipeIntent(
          { startX: gesture.startX, startY: gesture.startY, x: touch.clientX, y: touch.clientY },
          gesture.catchingSettle && settling !== null
        )
        if (intent === null) return
        if (intent === "ignore") {
          gesture = null
          stopFollowing?.()
          return
        }
        gesture.dragging = true
        // Only a real drag takes over from a settle still animating; plain taps leave it alone. The
        // settle is dropped, not finished, so a sheet that was sliding shut stays open under the finger.
        if (gesture.catchingSettle && settling) abandonSettle()
        // The settle already finished (open) before the drag began, so the sheet is fully open again.
        else gesture.baseOffset = 0
      }
      // Keep the page from scrolling under a horizontal drag.
      if (event.cancelable) event.preventDefault()
      const elapsed = event.timeStamp - gesture.lastTime
      if (elapsed > 0) gesture.velocity = (touch.clientX - gesture.lastX) / elapsed
      gesture.lastX = touch.clientX
      gesture.lastTime = event.timeStamp
      setDrag({ offset: `${Math.min(0, gesture.baseOffset + touch.clientX - gesture.startX)}px`, dragging: true })
    }

    function handleTouchEnd(event: TouchEvent) {
      const current = gesture
      gesture = null
      stopFollowing?.()
      if (!current?.dragging) return
      const rect = sheet()?.getBoundingClientRect()
      const dx = current.baseOffset + current.lastX - current.startX
      const shown = rect && rect.width > 0
        ? Math.min(1, Math.max(0, rect.right / rect.width))
        : dx < 0 ? 0 : 1
      const velocity = event.timeStamp - current.lastTime <= SIDEBAR_SWIPE_VELOCITY_MAX_AGE_MS
        ? current.velocity
        : 0
      settle(sidebarSwipeSettlesOpen(shown, velocity))
    }

    // Browsers decide whether a touch sequence may block scrolling when it starts, so a non-passive
    // listener added during touchstart can come too late. This one is in place before any touch begins.
    const blockScrollWhileDragging = (event: TouchEvent) => {
      if (gesture?.dragging && event.cancelable) event.preventDefault()
    }

    document.addEventListener("touchstart", handleTouchStart, { passive: true })
    document.addEventListener("touchmove", blockScrollWhileDragging, { passive: false })
    return () => {
      document.removeEventListener("touchstart", handleTouchStart)
      document.removeEventListener("touchmove", blockScrollWhileDragging)
      stopFollowing?.()
      gesture = null
      settling?.stop()
      settling = null
      setDrag(null)
    }
  }, [enabled, setOpen, sheetId])

  return drag
}
