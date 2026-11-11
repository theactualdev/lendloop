"use client"

import type { CSSProperties } from "react"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

// Restyled for LendLoop: a toast is a slip of card stock (paper, 4px corner,
// the raised card shadow) in Public Sans. Errors keep the paper and switch to
// the alert ink and border, as on the D5 alert buttons. Light only: there is
// no dark mode, so next-themes is not used.
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      richColors
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 motion-safe:animate-spin" />,
      }}
      style={
        {
          fontFamily: "var(--font-public-sans), ui-sans-serif, system-ui, sans-serif",
          "--normal-bg": "var(--ll-paper)",
          "--normal-text": "var(--ll-ink)",
          "--normal-border": "var(--ll-border)",
          "--success-bg": "var(--ll-paper)",
          "--success-text": "var(--ll-ok-ink)",
          "--success-border": "var(--ll-border)",
          "--error-bg": "var(--ll-paper)",
          "--error-text": "var(--ll-alert-ink)",
          "--error-border": "var(--ll-alert-line)",
          "--border-radius": "4px",
        } as CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast gap-2.5! border-[1.5px]! text-[15px]! shadow-card-raised!",
          title: "font-semibold! leading-snug!",
          description: "text-ink-soft!",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
