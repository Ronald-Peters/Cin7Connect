"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

// Simple tooltip implementation without external dependencies
interface TooltipProviderProps {
  children: React.ReactNode
  delayDuration?: number
}

interface TooltipProps {
  children: React.ReactNode
}

interface TooltipTriggerProps {
  children: React.ReactNode
  asChild?: boolean
}

interface TooltipContentProps {
  children: React.ReactNode
  className?: string
  sideOffset?: number
  side?: string
  align?: string
  hidden?: boolean
}

const TooltipProvider: React.FC<TooltipProviderProps> = ({ children }) => {
  return <>{children}</>
}

const Tooltip: React.FC<TooltipProps> = ({ children }) => {
  return <div className="relative inline-block">{children}</div>
}

const TooltipTrigger: React.FC<TooltipTriggerProps> = ({ children }) => {
  return <>{children}</>
}

const TooltipContent = React.forwardRef<
  HTMLDivElement,
  TooltipContentProps
>(({ className, children, sideOffset = 4, side, align, hidden, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "absolute z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md",
      hidden && "hidden",
      className
    )}
    style={{ top: `calc(100% + ${sideOffset}px)` }}
    {...props}
  >
    {children}
  </div>
))
TooltipContent.displayName = "TooltipContent"

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }