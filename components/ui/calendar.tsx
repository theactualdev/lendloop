"use client"

import * as React from "react"
import { cn } from "cn"
import {
  DayPicker,
  getDefaultClassNames,
  type DayButton,
} from "react-day-picker"

import { ChevronLeftIcon, ChevronRightIcon, ChevronDownIcon } from "lucide-react"

// Restyled for LendLoop (screen D's month): caption in Besley on the left,
// 44px bordered month buttons on the right, Plex Mono weekday initials, and
// 44px day cells two pixels apart. Weeks start on Monday.
//
// Besides react-day-picker's own modifiers, day cells understand two LendLoop
// modifiers passed through `modifiers`: `booked` (the strip's booked ink) and
// `clash` (a picked day that is booked: the alert wash).
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  formatters,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  const defaultClassNames = getDefaultClassNames()

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      weekStartsOn={1}
      className={cn("group/calendar w-full text-ink", className)}
      formatters={{
        // "M T W T F S S": the initial only; each header cell keeps the full name for screen readers.
        formatWeekdayName: (date) => date.toLocaleDateString("en-US", { weekday: "narrow" }),
        ...formatters,
      }}
      classNames={{
        root: cn("w-full", defaultClassNames.root),
        months: cn("relative flex flex-col", defaultClassNames.months),
        month: cn("flex w-full flex-col", defaultClassNames.month),
        nav: cn("absolute top-0 right-0 flex items-center gap-1", defaultClassNames.nav),
        button_previous: cn(
          "inline-flex size-11 cursor-pointer items-center justify-center rounded-lg border bg-paper text-ink transition-colors select-none hover:bg-paper-muted aria-disabled:cursor-not-allowed aria-disabled:text-disabled-ink aria-disabled:hover:bg-paper",
          defaultClassNames.button_previous
        ),
        button_next: cn(
          "inline-flex size-11 cursor-pointer items-center justify-center rounded-lg border bg-paper text-ink transition-colors select-none hover:bg-paper-muted aria-disabled:cursor-not-allowed aria-disabled:text-disabled-ink aria-disabled:hover:bg-paper",
          defaultClassNames.button_next
        ),
        month_caption: cn("flex h-11 items-center pr-24", defaultClassNames.month_caption),
        caption_label: cn(
          "font-heading text-[17px] font-bold select-none",
          defaultClassNames.caption_label
        ),
        month_grid: cn("mt-3 w-full border-collapse", defaultClassNames.month_grid),
        weekdays: cn("flex gap-0.5", defaultClassNames.weekdays),
        weekday: cn(
          "flex-1 pb-1.5 text-center font-mono text-[11px] font-medium text-ink-muted select-none",
          defaultClassNames.weekday
        ),
        week: cn("mt-0.5 flex w-full gap-0.5", defaultClassNames.week),
        day: cn("group/day relative min-w-0 flex-1 p-0 text-center select-none", defaultClassNames.day),
        today: defaultClassNames.today,
        outside: defaultClassNames.outside,
        disabled: defaultClassNames.disabled,
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...props }) => {
          return (
            <div
              data-slot="calendar"
              ref={rootRef}
              className={cn(className)}
              {...props}
            />
          )
        },
        Chevron: ({ className, orientation, ...props }) => {
          const Icon =
            orientation === "left"
              ? ChevronLeftIcon
              : orientation === "right"
                ? ChevronRightIcon
                : ChevronDownIcon
          return <Icon strokeWidth={1.8} className={cn("size-4", className)} {...props} />
        },
        DayButton: CalendarDayButton,
        ...components,
      }}
      {...props}
    />
  )
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const defaultClassNames = getDefaultClassNames()

  const ref = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])

  // One look per day, strongest first.
  const look = modifiers.clash
    ? "clash"
    : modifiers.selected
      ? "selected"
      : modifiers.booked
        ? "booked"
        : modifiers.disabled
          ? "disabled"
          : modifiers.outside
            ? "outside"
            : "open"

  return (
    <button
      ref={ref}
      type="button"
      data-day={day.isoDate}
      data-look={look}
      data-today={modifiers.today || undefined}
      className={cn(
        "relative flex h-11 w-full min-w-0 items-center justify-center rounded-[4px] p-0 text-sm font-medium transition-colors focus-visible:z-10 focus-visible:outline-offset-1",
        "data-[look=open]:cursor-pointer data-[look=open]:hover:bg-tab",
        "data-[look=outside]:cursor-pointer data-[look=outside]:text-ink-faint data-[look=outside]:hover:bg-tab",
        "data-[look=disabled]:cursor-not-allowed data-[look=disabled]:text-ink-faded",
        "data-[look=booked]:cursor-not-allowed data-[look=booked]:bg-booked data-[look=booked]:text-paper",
        "data-[look=selected]:cursor-pointer data-[look=selected]:bg-violet data-[look=selected]:font-bold data-[look=selected]:text-paper",
        "data-[look=clash]:bg-alert-wash data-[look=clash]:font-bold data-[look=clash]:text-alert-ink data-[look=clash]:shadow-[inset_0_0_0_1.5px_var(--ll-alert)]",
        "data-today:font-bold data-today:data-[look=disabled]:text-ink data-today:data-[look=open]:shadow-[inset_0_0_0_1.5px_var(--ll-ink)] data-today:data-[look=outside]:shadow-[inset_0_0_0_1.5px_var(--ll-ink)]",
        defaultClassNames.day_button,
        className
      )}
      {...props}
    />
  )
}

export { Calendar, CalendarDayButton }
