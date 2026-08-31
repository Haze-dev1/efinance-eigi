import { motion, useReducedMotion, type Variants } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Motion primitives, kept in one file so the whole app moves with one grammar:
 * short, single-axis, slightly overshooting. Everything here collapses to a
 * plain fade when the visitor has asked for reduced motion — framer's
 * useReducedMotion reads the OS setting, and the CSS media query in index.css
 * covers the non-JS transitions.
 */

const EASE = [0.16, 1, 0.3, 1] as const;

export function useStagger(step = 0.07): Variants {
  const still = useReducedMotion();
  return {
    hidden: {},
    show: {
      transition: {
        staggerChildren: still ? 0 : step,
        delayChildren: still ? 0 : 0.05,
      },
    },
  };
}

export function useRise(distance = 16): Variants {
  const still = useReducedMotion();
  return {
    hidden: { opacity: 0, y: still ? 0 : distance },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: still ? 0.2 : 0.6, ease: EASE },
    },
  };
}

/** A block that animates in the first time it scrolls into view, then stays. */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const still = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: still ? 0 : 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{
        duration: still ? 0.2 : 0.65,
        ease: EASE,
        delay: still ? 0 : delay,
      }}
    >
      {children}
    </motion.div>
  );
}

export { motion, EASE };
