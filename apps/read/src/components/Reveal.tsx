import { motion } from "motion/react";
import type { ReactNode } from "react";

/** One orchestrated page-load: each section rises + fades, staggered by index. Honours
 *  prefers-reduced-motion automatically via the CSS override. */
export function Reveal({ children, i = 0, className }: { children: ReactNode; i?: number; className?: string }) {
  return (
    <motion.section
      className={className}
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.06 * i, ease: [0.22, 0.61, 0.21, 1] }}
    >
      {children}
    </motion.section>
  );
}
