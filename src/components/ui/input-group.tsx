import * as React from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type InputGroupAddonAlign = "inline-start" | "inline-end" | "block-start" | "block-end"

function InputGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-group"
      className={cn(
        "group/input-group relative flex min-h-12 w-full min-w-0 items-center rounded-lg border border-input bg-card text-foreground shadow-sm transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 has-[[data-align=inline-start]]:[&_[data-slot=input-group-control]]:pl-10 has-[[data-align=inline-end]]:[&_[data-slot=input-group-control]]:pr-24",
        className
      )}
      {...props}
    />
  )
}

function InputGroupInput({ className, ...props }: React.ComponentProps<typeof Input>) {
  return (
    <Input
      data-slot="input-group-control"
      className={cn(
        "h-11 border-0 bg-transparent px-3 text-base shadow-none focus-visible:border-transparent focus-visible:ring-0 min-[720px]:text-sm",
        className
      )}
      {...props}
    />
  )
}

function InputGroupAddon({
  align = "inline-start",
  className,
  ...props
}: React.ComponentProps<"div"> & { align?: InputGroupAddonAlign }) {
  return (
    <div
      data-slot="input-group-addon"
      data-align={align}
      className={cn(
        "flex items-center gap-1.5 text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        align === "inline-start" && "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2",
        align === "inline-end" && "absolute right-3 top-1/2 -translate-y-1/2",
        align === "block-start" && "absolute inset-x-3 top-2",
        align === "block-end" && "absolute inset-x-3 bottom-2",
        className
      )}
      {...props}
    />
  )
}

function InputGroupText({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="input-group-text"
      className={cn("text-xs font-medium whitespace-nowrap", className)}
      {...props}
    />
  )
}

function InputGroupButton({
  className,
  size = "xs",
  variant = "ghost",
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      data-slot="input-group-button"
      className={className}
      size={size}
      variant={variant}
      {...props}
    />
  )
}

export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
}
