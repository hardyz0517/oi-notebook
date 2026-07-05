export const UI_LAYER_ORDER = {
  dialogOverlay: 50,
  dialogContent: 91,
  floatingContent: 100,
  tooltip: 110,
  toast: 145,
} as const

export const UI_LAYER_CLASS = {
  dialogOverlay: "z-50",
  dialogContent: "z-[91]",
  floatingContent: "z-[100]",
  tooltip: "z-[110]",
  toast: "z-[145]",
} as const
