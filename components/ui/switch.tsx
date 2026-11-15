"use client"

import { Switch as SwitchPrimitive } from "@base-ui/react/switch"
import { cn } from "cn"

// Restyled for LendLoop: violet when on, a quiet outlined track when off (both
// meet 3:1 against the card), the global 3px ink focus outline, and a 44px-tall
// hit area from the ::after so the row stays an easy target.
function Switch({
  className,
  ...props
}: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer relative inline-flex h-[26px] w-[46px] shrink-0 cursor-pointer items-center rounded-full border-[1.5px] transition-colors outline-none after:absolute after:-inset-x-1 after:-inset-y-2.5 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-ink data-checked:border-violet data-checked:bg-violet data-unchecked:border-ink-muted data-unchecked:bg-tab data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-[18px] rounded-full transition-transform data-checked:translate-x-[22px] data-checked:bg-paper data-unchecked:translate-x-[3px] data-unchecked:bg-ink-muted"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
