import * as React from "react"
import { cn } from "@/lib/utils"

/** Native <select> styled like Input. Preferred over a custom popover for mobile-first forms. */
function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        "h-11 md:h-9 w-full min-w-0 rounded-xl border border-input bg-background/50 dark:bg-white/[0.03] px-2 py-1 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { NativeSelect }
