"use client";

import { useRouter } from "next/navigation";
import type { ReactElement } from "react";
import { useState } from "react";
import { LogScreen } from "@/app/(app)/log-screen";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import type { CategoryOption } from "@/lib/categories";

type Props = {
  categories: CategoryOption[];
  groups: { id: string; name: string }[];
  today: string;
  /** The element that opens the sheet (the mobile FAB). */
  trigger: ReactElement;
};

/** Mobile bottom sheet with the same composer as the Log page; closes after a successful save. */
export function LogSheet({ categories, groups, today, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <Drawer open={open} onOpenChange={setOpen} showSwipeHandle>
      <DrawerTrigger render={trigger} />
      <DrawerContent className="rounded-t-3xl border-glass-border bg-popover">
        <DrawerHeader className="text-left">
          <DrawerTitle className="text-lg">Log spending or income</DrawerTitle>
          <DrawerDescription>Type it like a message. Review, then save.</DrawerDescription>
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <LogScreen
            categories={categories}
            groups={groups}
            today={today}
            variant="sheet"
            onSaved={() => {
              setOpen(false);
              router.refresh();
            }}
          />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
