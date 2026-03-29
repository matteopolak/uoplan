import { useRef } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { hexToRgb } from "schedule";
import type { Phantom } from "../../hooks/useCalendarMorph";
import { PHANTOM_MS, HALF_PHANTOM_MS } from "../../hooks/useCalendarMorph";

const HALF_S = HALF_PHANTOM_MS / 1000;
const FULL_S = PHANTOM_MS / 1000;
const EASING = [0.4, 0, 0.2, 1] as const;

function rectToStyle(rect: DOMRect) {
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

function PhantomBlock({
  phantom,
  onComplete,
}: {
  phantom: Phantom;
  onComplete: () => void;
}) {
  const { colorHex, kind, fromRect, toRect, heading, section } = phantom;
  const { r, g, b } = hexToRgb(colorHex);
  const bg = `rgba(${r}, ${g}, ${b}, 0.38)`;

  const isFlip = kind === "flip";

  /**
   * Flip phantom:
   *   - Slides from old → new in the first half (HALF_S)
   *   - Stays put while cross-fading with the real event in the second half
   *   - Fades opacity 1 → 0 over the second half (delay HALF_S, duration HALF_S)
   *
   * FadeOut phantom:
   *   - Stays in place, fades opacity 1 → 0 over the full duration
   */
  const transition = isFlip
    ? {
        default: { duration: HALF_S, ease: EASING },
        opacity: { duration: HALF_S, delay: HALF_S, ease: "easeIn" as const },
      }
    : { duration: FULL_S, ease: EASING };

  return (
    <motion.div
      initial={{ ...rectToStyle(fromRect!), opacity: 1 }}
      animate={{ ...rectToStyle(isFlip ? toRect! : fromRect!), opacity: 0 }}
      transition={transition}
      onAnimationComplete={onComplete}
      style={{
        position: "fixed",
        pointerEvents: "none",
        borderLeft: `4px solid ${colorHex}`,
        backgroundColor: bg,
        zIndex: 9999,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        padding: "8px 8px",
        fontSize: "11px",
        boxSizing: "border-box",
      }}
    >
      {/*
        Text inherits the parent's opacity — no separate animation needed.
        First half: fully visible alongside the sliding block.
        Second half: fades out with the block as the real event cross-fades in.
      */}
      {heading && (
        <div className="fc-uoplan-event-body">
          <span className="fc-uoplan-event-code">{heading}</span>
          {section && (
            <span className="fc-uoplan-event-type">{section}</span>
          )}
        </div>
      )}
    </motion.div>
  );
}

interface ScheduleMorphOverlayProps {
  phantoms: Phantom[];
  onComplete: () => void;
}

export function ScheduleMorphOverlay({
  phantoms,
  onComplete,
}: ScheduleMorphOverlayProps) {
  // Only reset the counter when a genuinely new phantom array arrives, not
  // on incidental re-renders while the animation is in flight.
  const phantomsRef = useRef<Phantom[]>([]);
  const remainingRef = useRef(0);

  if (phantoms.length === 0) return null;

  if (phantomsRef.current !== phantoms) {
    phantomsRef.current = phantoms;
    remainingRef.current = phantoms.length;
  }

  const handleOne = () => {
    remainingRef.current -= 1;
    if (remainingRef.current <= 0) {
      onComplete();
    }
  };

  return createPortal(
    <>
      {phantoms.map((p) => (
        <PhantomBlock key={p.layoutId} phantom={p} onComplete={handleOne} />
      ))}
    </>,
    document.body,
  );
}
