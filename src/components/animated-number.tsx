"use client";

import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect } from "react";
import { formatINRWhole } from "@/lib/money";

const FORMATS = {
  inr: (n: number) => formatINRWhole(n),
  plain: (n: number) => n.toLocaleString("en-IN"),
};

/**
 * Counts up to `value` (skipped under reduced motion). `format` is a key rather than a function
 * so server components can render it.
 */
export function AnimatedNumber({ value, format = "plain", className }: { value: number; format?: keyof typeof FORMATS; className?: string }) {
  const reduce = useReducedMotion();
  const fmt = FORMATS[format];
  const mv = useMotionValue(reduce ? value : 0);
  const text = useTransform(mv, (v) => fmt(Math.round(v)));

  useEffect(() => {
    if (reduce) {
      mv.set(value);
      return;
    }
    const controls = animate(mv, value, { duration: 0.6, ease: [0.22, 1, 0.36, 1] });
    return () => controls.stop();
  }, [value, reduce, mv]);

  return (
    <motion.span className={className} aria-label={fmt(value)}>
      {text}
    </motion.span>
  );
}
