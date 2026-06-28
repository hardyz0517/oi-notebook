"use client"

import * as React from "react"
import { Tabs as TabsPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("grid min-w-0 gap-3", className)}
      {...props}
    />
  )
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "inline-flex min-w-0 items-center gap-0.5 rounded-[var(--ui-radius-control)] bg-muted p-0.5",
        className,
      )}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex h-7 min-w-0 items-center justify-center gap-1 rounded-[var(--ui-radius-item)] px-2.5 text-xs font-medium text-muted-foreground outline-none transition-[background-color,color,box-shadow,opacity] duration-[var(--ui-motion-duration-fast)] ease-[var(--ui-motion-ease-standard)] hover:bg-[var(--ui-state-hover)] hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-[var(--ui-focus-ring-soft)] disabled:pointer-events-none disabled:opacity-[var(--ui-disabled-opacity)] data-[state=active]:bg-[var(--ui-state-selected)] data-[state=active]:text-[var(--ui-state-selected-foreground)] data-[state=active]:shadow-sm",
        className,
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("min-w-0 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsContent, TabsList, TabsTrigger }
