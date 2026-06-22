"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { PanelLeftIcon } from "lucide-react"

const SIDEBAR_COOKIE_NAME = "sidebar_state"
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7
const SIDEBAR_WIDTH_DEFAULT = 16 * 16
const SIDEBAR_WIDTH_MIN = 12 * 16
const SIDEBAR_WIDTH_MAX = 22 * 16
const SIDEBAR_WIDTH_STEP = 8
const SIDEBAR_KEYBOARD_SHORTCUT = "b"

const sidebarWidthClasses = [
  { width: 192, className: "sidebar-width-192 [--sidebar-width:192px]" },
  { width: 200, className: "sidebar-width-200 [--sidebar-width:200px]" },
  { width: 208, className: "sidebar-width-208 [--sidebar-width:208px]" },
  { width: 216, className: "sidebar-width-216 [--sidebar-width:216px]" },
  { width: 224, className: "sidebar-width-224 [--sidebar-width:224px]" },
  { width: 232, className: "sidebar-width-232 [--sidebar-width:232px]" },
  { width: 240, className: "sidebar-width-240 [--sidebar-width:240px]" },
  { width: 248, className: "sidebar-width-248 [--sidebar-width:248px]" },
  { width: 256, className: "sidebar-width-256 [--sidebar-width:256px]" },
  { width: 264, className: "sidebar-width-264 [--sidebar-width:264px]" },
  { width: 272, className: "sidebar-width-272 [--sidebar-width:272px]" },
  { width: 280, className: "sidebar-width-280 [--sidebar-width:280px]" },
  { width: 288, className: "sidebar-width-288 [--sidebar-width:288px]" },
  { width: 296, className: "sidebar-width-296 [--sidebar-width:296px]" },
  { width: 304, className: "sidebar-width-304 [--sidebar-width:304px]" },
  { width: 312, className: "sidebar-width-312 [--sidebar-width:312px]" },
  { width: 320, className: "sidebar-width-320 [--sidebar-width:320px]" },
  { width: 328, className: "sidebar-width-328 [--sidebar-width:328px]" },
  { width: 336, className: "sidebar-width-336 [--sidebar-width:336px]" },
  { width: 344, className: "sidebar-width-344 [--sidebar-width:344px]" },
  { width: 352, className: "sidebar-width-352 [--sidebar-width:352px]" },
] as const

const skeletonWidthClasses = [
  "max-w-[50%]",
  "max-w-[60%]",
  "max-w-[70%]",
  "max-w-[80%]",
  "max-w-[90%]",
] as const

type SidebarContextProps = {
  state: "expanded" | "collapsed"
  open: boolean
  setOpen: (open: boolean) => void
  openMobile: boolean
  setOpenMobile: (open: boolean) => void
  isMobile: boolean
  toggleSidebar: () => void
  sidebarWidth: number
  sidebarWidthMin: number
  sidebarWidthMax: number
  setSidebarWidth: (width: number) => void
}

const SidebarContext = React.createContext<SidebarContextProps | null>(null)

function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.")
  }

  return context
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function normalizeSidebarWidth(value: number, min: number, max: number) {
  return clamp(Math.round(value / SIDEBAR_WIDTH_STEP) * SIDEBAR_WIDTH_STEP, min, max)
}

function sidebarWidthClass(width: number) {
  return sidebarWidthClasses.find((item) => item.width === width)?.className ?? sidebarWidthClasses[8].className
}

function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  className,
  style: _style,
  sidebarWidth,
  sidebarWidthMin = SIDEBAR_WIDTH_MIN,
  sidebarWidthMax = SIDEBAR_WIDTH_MAX,
  onSidebarWidthChange,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  sidebarWidth?: number
  sidebarWidthMin?: number
  sidebarWidthMax?: number
  onSidebarWidthChange?: (width: number) => void
}) {
  const isMobile = useIsMobile()
  const [openMobile, setOpenMobile] = React.useState(false)

  // This is the internal state of the sidebar.
  // We use openProp and setOpenProp for control from outside the component.
  const [_open, _setOpen] = React.useState(defaultOpen)
  const open = openProp ?? _open
  const setOpen = React.useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const openState = typeof value === "function" ? value(open) : value
      if (setOpenProp) {
        setOpenProp(openState)
      } else {
        _setOpen(openState)
      }

      // This sets the cookie to keep the sidebar state.
      document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`
    },
    [setOpenProp, open]
  )

  // Helper to toggle the sidebar.
  const toggleSidebar = React.useCallback(() => {
    return isMobile ? setOpenMobile((open) => !open) : setOpen((open) => !open)
  }, [isMobile, setOpen, setOpenMobile])

  // Adds a keyboard shortcut to toggle the sidebar.
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault()
        toggleSidebar()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [toggleSidebar])

  // We add a state so that we can do data-state="expanded" or "collapsed".
  // This makes it easier to style the sidebar with Tailwind classes.
  const state = open ? "expanded" : "collapsed"
  const clampedSidebarWidth =
    typeof sidebarWidth === "number"
      ? normalizeSidebarWidth(sidebarWidth, sidebarWidthMin, sidebarWidthMax)
      : SIDEBAR_WIDTH_DEFAULT
  const setSidebarWidth = React.useCallback(
    (width: number) => {
      onSidebarWidthChange?.(normalizeSidebarWidth(width, sidebarWidthMin, sidebarWidthMax))
    },
    [onSidebarWidthChange, sidebarWidthMin, sidebarWidthMax]
  )

  const contextValue = React.useMemo<SidebarContextProps>(
    () => ({
      state,
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
      sidebarWidth: clampedSidebarWidth,
      sidebarWidthMin,
      sidebarWidthMax,
      setSidebarWidth,
    }),
    [
      state,
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
      clampedSidebarWidth,
      sidebarWidthMin,
      sidebarWidthMax,
      setSidebarWidth,
    ]
  )

  return (
    <SidebarContext.Provider value={contextValue}>
      <div
        data-slot="sidebar-wrapper"
        className={cn(
          "group/sidebar-wrapper flex min-h-svh w-full [--sidebar-width-icon:3rem] has-data-[variant=inset]:bg-sidebar",
          typeof sidebarWidth === "number" ? sidebarWidthClass(clampedSidebarWidth) : "[--sidebar-width:16rem]",
          className
        )}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  )
}

function Sidebar({
  side = "left",
  variant = "sidebar",
  collapsible = "offcanvas",
  className,
  children,
  dir,
  ...props
}: React.ComponentProps<"div"> & {
  side?: "left" | "right"
  variant?: "sidebar" | "floating" | "inset"
  collapsible?: "offcanvas" | "icon" | "none"
}) {
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar()

  if (collapsible === "none") {
    return (
      <div
        data-slot="sidebar"
        className={cn(
          "flex h-full w-(--sidebar-width) flex-col bg-sidebar text-sidebar-foreground",
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }

  if (isMobile) {
    return (
      <Sheet modal={false} open={openMobile} onOpenChange={setOpenMobile} {...props}>
        <SheetContent
          dir={dir}
          data-sidebar="sidebar"
          data-slot="sidebar"
          data-mobile="true"
          className="w-[var(--sidebar-width)] bg-sidebar p-0 text-sidebar-foreground [--sidebar-width:18rem] [&>button]:hidden"
          side={side}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Sidebar</SheetTitle>
            <SheetDescription>Displays the mobile sidebar.</SheetDescription>
          </SheetHeader>
          <div className="flex h-full w-full flex-col">{children}</div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <div
      className="group peer hidden text-sidebar-foreground md:block"
      data-state={state}
      data-collapsible={state === "collapsed" ? collapsible : ""}
      data-variant={variant}
      data-side={side}
      data-slot="sidebar"
    >
      {/* This is what handles the sidebar gap on desktop */}
      <div
        data-slot="sidebar-gap"
        className={cn(
          "relative w-[var(--sidebar-width)] bg-sidebar transition-[width] duration-100 ease-out",
          "group-data-[collapsible=offcanvas]:w-0",
          "group-data-[side=right]:rotate-180",
          variant === "floating" || variant === "inset"
            ? "group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]"
            : "group-data-[collapsible=icon]:w-[var(--sidebar-width-icon)]"
        )}
      />
      <div
        data-slot="sidebar-container"
        data-side={side}
        className={cn(
          "fixed inset-y-0 z-10 hidden h-svh w-[var(--sidebar-width)] overflow-visible bg-sidebar transition-[left,right,width] duration-100 ease-out data-[side=left]:left-0 data-[side=left]:group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)] data-[side=right]:right-0 data-[side=right]:group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)] md:flex",
          // Adjust the padding for floating and inset variants.
          variant === "floating" || variant === "inset"
            ? "p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]"
            : "group-data-[collapsible=icon]:w-[var(--sidebar-width-icon)] group-data-[side=left]:border-r group-data-[side=right]:border-l group-data-[collapsible=icon]:border-r-0 group-data-[collapsible=icon]:border-l-0",
          className
        )}
        {...props}
      >
        <div
          data-sidebar="sidebar"
          data-slot="sidebar-inner"
          className="flex size-full flex-col overflow-visible bg-sidebar group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:shadow-sm group-data-[variant=floating]:ring-1 group-data-[variant=floating]:ring-sidebar-border"
        >
          {children}
        </div>
      </div>
    </div>
  )
}

function SidebarTrigger({
  className,
  onClick,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { toggleSidebar } = useSidebar()

  return (
    <Button
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      variant="ghost"
      size="icon-sm"
      className={cn(className)}
      onClick={(event) => {
        onClick?.(event)
        toggleSidebar()
      }}
      {...props}
    >
      <PanelLeftIcon />
      <span className="sr-only">Toggle Sidebar</span>
    </Button>
  )
}

function SidebarRail({ className, style: _style, ...props }: React.ComponentProps<"button">) {
  const { state, sidebarWidth, setSidebarWidth, toggleSidebar } = useSidebar()
  const dragStateRef = React.useRef<{
    startX: number
    startWidth: number
    side: "left" | "right"
    moved: boolean
    pendingWidth: number | null
    animationFrame: number | null
    hadCursorClass: boolean
    hadUserSelectClass: boolean
    cleanup: () => void
  } | null>(null)

  React.useEffect(() => {
    return () => dragStateRef.current?.cleanup()
  }, [])

  const startResize = React.useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0 || state !== "expanded") return

      const sidebar = event.currentTarget.closest('[data-slot="sidebar"]')
      const side = sidebar?.getAttribute("data-side") === "right" ? "right" : "left"
      const doc = event.currentTarget.ownerDocument
      const win = event.currentTarget.ownerDocument.defaultView
      if (!win) return
      const hadCursorClass = doc.body.classList.contains("cursor-col-resize")
      const hadUserSelectClass = doc.body.classList.contains("select-none")

      doc.body.classList.add("cursor-col-resize", "select-none")

      const scheduleWidth = (width: number) => {
        const activeDrag = dragStateRef.current
        if (!activeDrag) return

        activeDrag.pendingWidth = width
        if (activeDrag.animationFrame !== null) return

        if (typeof win.requestAnimationFrame === "function") {
          activeDrag.animationFrame = win.requestAnimationFrame(() => {
            const scheduledDrag = dragStateRef.current
            if (!scheduledDrag) return

            scheduledDrag.animationFrame = null
            if (scheduledDrag.pendingWidth === null) return

            setSidebarWidth(scheduledDrag.pendingWidth)
            scheduledDrag.pendingWidth = null
          })
          return
        }

        activeDrag.animationFrame = null
        setSidebarWidth(activeDrag.pendingWidth)
        activeDrag.pendingWidth = null
      }

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const activeDrag = dragStateRef.current
        if (!activeDrag) return

        const delta = moveEvent.clientX - activeDrag.startX
        const nextWidth = activeDrag.side === "right" ? activeDrag.startWidth - delta : activeDrag.startWidth + delta
        if (Math.abs(delta) > 2) {
          activeDrag.moved = true
        }
        scheduleWidth(nextWidth)
      }

      const handlePointerUp = () => {
        const activeDrag = dragStateRef.current
        activeDrag?.cleanup()
      }

      const cleanup = () => {
        const activeDrag = dragStateRef.current
        if (activeDrag && activeDrag.animationFrame !== null && typeof win.cancelAnimationFrame === "function") {
          win.cancelAnimationFrame(activeDrag.animationFrame)
        }
        if (activeDrag && activeDrag.pendingWidth !== null) {
          setSidebarWidth(activeDrag.pendingWidth)
          activeDrag.pendingWidth = null
        }
        if (!activeDrag?.hadCursorClass) {
          doc.body.classList.remove("cursor-col-resize")
        }
        if (!activeDrag?.hadUserSelectClass) {
          doc.body.classList.remove("select-none")
        }
        win.removeEventListener("pointermove", handlePointerMove)
        win.removeEventListener("pointerup", handlePointerUp)
        win.removeEventListener("pointercancel", handlePointerUp)
      }

      dragStateRef.current = {
        startX: event.clientX,
        startWidth: sidebarWidth,
        side,
        moved: false,
        pendingWidth: null,
        animationFrame: null,
        hadCursorClass,
        hadUserSelectClass,
        cleanup,
      }
      win.addEventListener("pointermove", handlePointerMove)
      win.addEventListener("pointerup", handlePointerUp)
      win.addEventListener("pointercancel", handlePointerUp)
    },
    [setSidebarWidth, sidebarWidth, state]
  )

  return (
    <button
      data-sidebar="rail"
      data-slot="sidebar-rail"
      aria-label="Toggle Sidebar"
      tabIndex={-1}
      onPointerDown={startResize}
      onClick={(event) => {
        if (dragStateRef.current?.moved) {
          event.preventDefault()
          dragStateRef.current = null
          return
        }
        dragStateRef.current = null
        toggleSidebar()
      }}
      title="Toggle Sidebar"
      className={cn(
        "absolute inset-y-0 z-20 hidden w-4 cursor-col-resize transition-all ease-linear group-data-[side=left]:right-0 group-data-[side=right]:left-0 after:absolute after:inset-y-0 after:w-[2px] group-data-[side=left]:after:right-0 group-data-[side=right]:after:left-0 hover:after:bg-sidebar-border sm:flex",
        "[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize",
        "group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full hover:group-data-[collapsible=offcanvas]:bg-sidebar",
        "[[data-side=left][data-collapsible=offcanvas]_&]:-right-2",
        "[[data-side=right][data-collapsible=offcanvas]_&]:-left-2",
        className
      )}
      {...props}
    />
  )
}

function SidebarInset({ className, ...props }: React.ComponentProps<"main">) {
  return (
    <main
      data-slot="sidebar-inset"
      className={cn(
        "relative flex w-full flex-1 flex-col bg-background md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2",
        className
      )}
      {...props}
    />
  )
}

function SidebarInput({
  className,
  ...props
}: React.ComponentProps<typeof Input>) {
  return (
    <Input
      data-slot="sidebar-input"
      data-sidebar="input"
      className={cn("h-8 w-full bg-background shadow-none", className)}
      {...props}
    />
  )
}

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-header"
      data-sidebar="header"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  )
}

function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-footer"
      data-sidebar="footer"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  )
}

function SidebarSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="sidebar-separator"
      data-sidebar="separator"
      className={cn("mx-2 w-auto bg-sidebar-border", className)}
      {...props}
    />
  )
}

function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-content"
      data-sidebar="content"
      className={cn(
        "no-scrollbar flex min-h-0 flex-1 flex-col gap-0 overflow-auto group-data-[collapsible=icon]:overflow-hidden",
        className
      )}
      {...props}
    />
  )
}

function SidebarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group"
      data-sidebar="group"
      className={cn("relative flex w-full min-w-0 flex-col p-2", className)}
      {...props}
    />
  )
}

function SidebarGroupLabel({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"div"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "div"

  return (
    <Comp
      data-slot="sidebar-group-label"
      data-sidebar="group-label"
      className={cn(
        "flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 ring-sidebar-ring outline-hidden transition-[margin,opacity] duration-200 ease-linear group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0 focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        className
      )}
      {...props}
    />
  )
}

function SidebarGroupAction({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="sidebar-group-action"
      data-sidebar="group-action"
      className={cn(
        "absolute top-3.5 right-3 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground ring-sidebar-ring outline-hidden transition-transform group-data-[collapsible=icon]:hidden after:absolute after:-inset-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 md:after:hidden [&>svg]:size-4 [&>svg]:shrink-0",
        className
      )}
      {...props}
    />
  )
}

function SidebarGroupContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group-content"
      data-sidebar="group-content"
      className={cn("w-full text-sm", className)}
      {...props}
    />
  )
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu"
      data-sidebar="menu"
      className={cn("flex w-full min-w-0 flex-col gap-0", className)}
      {...props}
    />
  )
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="sidebar-menu-item"
      data-sidebar="menu-item"
      className={cn("group/menu-item relative", className)}
      {...props}
    />
  )
}

const sidebarMenuButtonVariants = cva(
  "peer/menu-button group/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm ring-sidebar-ring outline-hidden transition-[width,height,padding] group-has-data-[sidebar=menu-action]/menu-item:pr-8 group-data-[collapsible=icon]:!size-8 group-data-[collapsible=icon]:!p-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-open:hover:bg-sidebar-accent data-open:hover:text-sidebar-accent-foreground data-active:bg-sidebar-accent data-active:font-medium data-active:text-sidebar-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0 [&>span:last-child]:truncate",
  {
    variants: {
      variant: {
        default: "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        outline:
          "bg-background shadow-[0_0_0_1px_var(--sidebar-border)] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-[0_0_0_1px_var(--sidebar-accent)]",
      },
      size: {
        default: "h-8 text-sm",
        sm: "h-7 text-xs",
        lg: "h-12 text-sm group-data-[collapsible=icon]:!p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function SidebarMenuButton({
  asChild = false,
  isActive = false,
  variant = "default",
  size = "default",
  tooltip,
  className,
  ...props
}: React.ComponentProps<"button"> & {
  asChild?: boolean
  isActive?: boolean
  tooltip?: string | React.ComponentProps<typeof TooltipContent>
} & VariantProps<typeof sidebarMenuButtonVariants>) {
  const Comp = asChild ? Slot.Root : "button"
  const { isMobile, state } = useSidebar()

  const button = (
    <Comp
      data-slot="sidebar-menu-button"
      data-sidebar="menu-button"
      data-size={size}
      data-active={isActive}
      className={cn(sidebarMenuButtonVariants({ variant, size }), className)}
      {...props}
    />
  )

  if (!tooltip) {
    return button
  }

  if (typeof tooltip === "string") {
    tooltip = {
      children: tooltip,
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent
        side="right"
        align="center"
        hidden={state !== "collapsed" || isMobile}
        {...tooltip}
      />
    </Tooltip>
  )
}

function SidebarMenuAction({
  className,
  asChild = false,
  showOnHover = false,
  ...props
}: React.ComponentProps<"button"> & {
  asChild?: boolean
  showOnHover?: boolean
}) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="sidebar-menu-action"
      data-sidebar="menu-action"
      className={cn(
        "absolute top-1.5 right-1 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground ring-sidebar-ring outline-hidden transition-transform group-data-[collapsible=icon]:hidden peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[size=default]/menu-button:top-1.5 peer-data-[size=lg]/menu-button:top-2.5 peer-data-[size=sm]/menu-button:top-1 after:absolute after:-inset-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 md:after:hidden [&>svg]:size-4 [&>svg]:shrink-0",
        showOnHover &&
          "group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 peer-data-active/menu-button:text-sidebar-accent-foreground aria-expanded:opacity-100 md:opacity-0",
        className
      )}
      {...props}
    />
  )
}

function SidebarMenuBadge({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-menu-badge"
      data-sidebar="menu-badge"
      className={cn(
        "pointer-events-none absolute right-1 flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-medium text-sidebar-foreground tabular-nums select-none group-data-[collapsible=icon]:hidden peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[size=default]/menu-button:top-1.5 peer-data-[size=lg]/menu-button:top-2.5 peer-data-[size=sm]/menu-button:top-1 peer-data-active/menu-button:text-sidebar-accent-foreground",
        className
      )}
      {...props}
    />
  )
}

function SidebarMenuSkeleton({
  className,
  showIcon = false,
  ...props
}: React.ComponentProps<"div"> & {
  showIcon?: boolean
}) {
  const [widthClassName] = React.useState(() => skeletonWidthClasses[Math.floor(Math.random() * skeletonWidthClasses.length)])

  return (
    <div
      data-slot="sidebar-menu-skeleton"
      data-sidebar="menu-skeleton"
      className={cn("flex h-8 items-center gap-2 rounded-md px-2", className)}
      {...props}
    >
      {showIcon && (
        <Skeleton
          className="size-4 rounded-md"
          data-sidebar="menu-skeleton-icon"
        />
      )}
      <Skeleton
        className={cn("h-4 flex-1", widthClassName)}
        data-sidebar="menu-skeleton-text"
      />
    </div>
  )
}

function SidebarMenuSub({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu-sub"
      data-sidebar="menu-sub"
      className={cn(
        "mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l border-sidebar-border px-2.5 py-0.5 group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  )
}

function SidebarMenuSubItem({
  className,
  ...props
}: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="sidebar-menu-sub-item"
      data-sidebar="menu-sub-item"
      className={cn("group/menu-sub-item relative", className)}
      {...props}
    />
  )
}

function SidebarMenuSubButton({
  asChild = false,
  size = "md",
  isActive = false,
  className,
  ...props
}: React.ComponentProps<"a"> & {
  asChild?: boolean
  size?: "sm" | "md"
  isActive?: boolean
}) {
  const Comp = asChild ? Slot.Root : "a"

  return (
    <Comp
      data-slot="sidebar-menu-sub-button"
      data-sidebar="menu-sub-button"
      data-size={size}
      data-active={isActive}
      className={cn(
        "flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden group-data-[collapsible=icon]:hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[size=md]:text-sm data-[size=sm]:text-xs data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-sidebar-accent-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
}
