import * as React from "react"

import { Button } from "@/components/ui/button"

type ButtonProps = React.ComponentProps<typeof Button>

export interface IconButtonProps extends Omit<ButtonProps, "size"> {
  "aria-label": string
  size?: Extract<ButtonProps["size"], "icon" | "icon-xs" | "icon-sm" | "icon-lg">
}

function IconButton({
  size = "icon",
  variant = "ghost",
  ...props
}: IconButtonProps) {
  return <Button data-slot="icon-button" variant={variant} size={size} {...props} />
}

export { IconButton }
