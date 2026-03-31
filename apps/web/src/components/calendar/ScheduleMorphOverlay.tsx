import { useRef, useEffect, useCallback } from "react";
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

function TextContent({
  heading,
  section,
  time,
  professor,
  ratingColor,
}: {
  heading: string;
  section: string;
  time: string;
  professor: string;
  ratingColor: string;
}) {
  if (!heading) return null;
  return (
    <div className="fc-uoplan-event-body">
      <span className="fc-uoplan-event-code">{heading}</span>
      {section && <span className="fc-uoplan-event-type">{section}</span>}
      {time && <span className="fc-uoplan-event-time">{time}</span>}
      {professor && (
        <span
          className="fc-uoplan-event-professor"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexWrap: "nowrap",
            minWidth: 0,
            maxWidth: "100%",
          }}
        >
          <span
            className="fc-uoplan-event-professor-name"
            style={{
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {professor}
          </span>
          {ratingColor && (
            <span
              aria-hidden
              style={{
                width: 10,
                height: 10,
                borderRadius: 0,
                backgroundColor: ratingColor,
                border: "1px solid rgba(0,0,0,0.45)",
                boxShadow: "0 0 0 1px rgba(255,255,255,0.08) inset",
                flexShrink: 0,
              }}
            />
          )}
        </span>
      )}
    </div>
  );
}

function PhantomBlock({
  phantom,
  onComplete,
}: {
  phantom: Phantom;
  onComplete: () => void;
}) {
  const { colorHex, kind, fromRect } = phantom;
  const { r, g, b } = hexToRgb(colorHex);
  const bg = `rgba(${r}, ${g}, ${b}, 0.38)`;

  const isFlip = kind === "flip";
  const fromText = phantom.fromText;
  const toText = isFlip ? phantom.toText : fromText;

  // Flip phantoms fire `onComplete` via a timer rather than onAnimationComplete:
  // parked phantoms (fromRect === toRect) would otherwise complete instantly.
  useEffect(() => {
    if (!isFlip) return;
    const t = window.setTimeout(onComplete, HALF_PHANTOM_MS);
    return () => window.clearTimeout(t);
  }, [isFlip, onComplete]);

  const blockStyle = {
    position: "fixed" as const,
    pointerEvents: "none" as const,
    borderLeft: `4px solid ${colorHex}`,
    backgroundColor: bg,
    zIndex: 9999,
    overflow: "hidden",
    display: "flex" as const,
    flexDirection: "column" as const,
    alignItems: "flex-start" as const,
    padding: "8px 8px",
    fontSize: "11px",
    boxSizing: "border-box" as const,
  };

  if (isFlip) {
    /**
     * Flip phantom:
     *   - Slides old→new position over HALF_S while old text fades out and new
     *     text fades in, so text is fully changed by arrival.
     *   - onComplete is fired via a timer rather than onAnimationComplete because
     *     parked phantoms (fromRect === toRect) trigger onAnimationComplete instantly,
     *     which would drain the counter before real phantoms mount. The timer is
     *     cancelled on unmount, so only real phantoms (which live for HALF_S) fire it.
     */
    return (
      <motion.div
        initial={rectToStyle(fromRect)}
        animate={rectToStyle(phantom.toRect)}
        transition={{ duration: HALF_S, ease: EASING }}
        style={blockStyle}
      >
        {/* Old text fades out during the slide */}
        <motion.div
          style={{ position: "absolute", top: "8px", left: "8px", right: "8px", bottom: "8px", display: "flex", flexDirection: "column" }}
          animate={{ opacity: 0 }}
          transition={{ duration: HALF_S, ease: "easeIn" }}
        >
          <TextContent
            heading={fromText.heading}
            section={fromText.section}
            time={fromText.time}
            professor={fromText.professor}
            ratingColor={fromText.ratingColor}
          />
        </motion.div>

        {/* New text fades in during the slide */}
        <motion.div
          style={{ position: "absolute", top: "8px", left: "8px", right: "8px", bottom: "8px", display: "flex", flexDirection: "column" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: HALF_S, ease: "easeIn" }}
        >
          <TextContent
            heading={toText.heading}
            section={toText.section}
            time={toText.time}
            professor={toText.professor}
            ratingColor={toText.ratingColor}
          />
        </motion.div>
      </motion.div>
    );
  }

  /**
   * FadeOut phantom:
   *   - Stays in place, fades opacity 1 → 0 over the full duration.
   */
  return (
    <motion.div
      initial={{ ...rectToStyle(fromRect), opacity: 1 }}
      animate={{ ...rectToStyle(fromRect), opacity: 0 }}
      transition={{ duration: FULL_S, ease: EASING }}
      onAnimationComplete={onComplete}
      style={blockStyle}
    >
      <TextContent
        heading={fromText.heading}
        section={fromText.section}
        time={fromText.time}
        professor={fromText.professor}
        ratingColor={fromText.ratingColor}
      />
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
  const phantomsRef = useRef<Phantom[]>([]);
  const remainingRef = useRef(0);

  const handleOne = useCallback(() => {
    remainingRef.current -= 1;
    if (remainingRef.current <= 0) {
      onComplete();
    }
  }, [onComplete]);

  if (phantoms.length === 0) return null;

  if (phantomsRef.current !== phantoms) {
    phantomsRef.current = phantoms;
    remainingRef.current = phantoms.length;
  }

  return createPortal(
    <>
      {phantoms.map((p) => (
        <PhantomBlock key={p.layoutId} phantom={p} onComplete={handleOne} />
      ))}
    </>,
    document.body,
  );
}
