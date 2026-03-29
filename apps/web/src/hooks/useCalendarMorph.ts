import { useState, useEffect, useRef, useCallback } from "react";

export interface CapturedEvent {
  courseCode: string;
  colorHex: string;
  rect: DOMRect;
  heading: string;
  section: string;
}

export interface Phantom {
  layoutId: string;
  courseCode: string;
  colorHex: string;
  fromRect: DOMRect | null;
  toRect: DOMRect | null;
  /** "flip"    – slides to new position (first half), then cross-fades (second half)
   *  "fadeOut" – fades away in place over the full duration */
  kind: "flip" | "fadeOut";
  heading: string;
  section: string;
}

type Phase =
  | "idle"
  /** Events hidden, parked phantoms visible at old positions, FullCalendar rendering new schedule. */
  | "pre-animating"
  /** Final phantoms animating — first half: slide + old text visible. */
  | "animating"
  /** Second half: phantoms fade out ↔ real events fade in (cross-fade). */
  | "animating-midpoint";

/** Duration of the full phantom animation (ms). */
export const PHANTOM_MS = 350;
/** The midpoint where real-event reveal begins (ms). */
export const HALF_PHANTOM_MS = PHANTOM_MS / 2;

const RENDER_SETTLE_MS = 50;

function captureEventPositions(container: HTMLElement | null): CapturedEvent[] {
  if (!container) return [];
  const els = container.querySelectorAll<HTMLElement>(".fc-uoplan-event");
  const captures: CapturedEvent[] = [];
  for (const el of els) {
    const courseCode = el.dataset.courseCode ?? "";
    const colorHex = el.dataset.colorHex ?? "";
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const heading =
        el.querySelector(".fc-uoplan-event-code")?.textContent ?? "";
      const section =
        el.querySelector(".fc-uoplan-event-type")?.textContent ?? "";
      captures.push({ courseCode, colorHex, rect, heading, section });
    }
  }
  return captures;
}

/** Build phantoms to cover old events immediately (no movement yet). */
function buildParkedPhantoms(oldEvents: CapturedEvent[]): Phantom[] {
  return oldEvents.map((c, i) => ({
    layoutId: `park-${i}`,
    courseCode: c.courseCode,
    colorHex: c.colorHex,
    fromRect: c.rect,
    toRect: c.rect,
    kind: "flip" as const,
    heading: c.heading,
    section: c.section,
  }));
}

function buildPhantoms(
  oldEvents: CapturedEvent[],
  newEvents: CapturedEvent[],
): Phantom[] {
  const phantoms: Phantom[] = [];
  const matchedOld = new Set<number>();
  const matchedNew = new Set<number>();
  let pairIdx = 0;

  // Primary: match by courseCode
  for (let oi = 0; oi < oldEvents.length; oi++) {
    const old = oldEvents[oi];
    if (!old.courseCode) continue;
    for (let ni = 0; ni < newEvents.length; ni++) {
      if (matchedNew.has(ni)) continue;
      if (newEvents[ni].courseCode === old.courseCode) {
        phantoms.push({
          layoutId: `p${pairIdx++}`,
          courseCode: old.courseCode,
          colorHex: old.colorHex,
          fromRect: old.rect,
          toRect: newEvents[ni].rect,
          kind: "flip",
          heading: old.heading,
          section: old.section,
        });
        matchedOld.add(oi);
        matchedNew.add(ni);
        break;
      }
    }
  }

  // Secondary: match remaining by colorHex
  const remainingOld = oldEvents
    .map((c, i) => ({ ...c, i }))
    .filter((c) => !matchedOld.has(c.i));
  const remainingNew = newEvents
    .map((c, i) => ({ ...c, i }))
    .filter((c) => !matchedNew.has(c.i));

  const byColor = <T extends { colorHex: string }>(arr: T[]) => {
    const map = new Map<string, T[]>();
    for (const c of arr) {
      const bucket = map.get(c.colorHex) ?? [];
      bucket.push(c);
      map.set(c.colorHex, bucket);
    }
    return map;
  };

  const oldByColor = byColor(remainingOld);
  const newByColor = byColor(remainingNew);

  for (const color of new Set([...oldByColor.keys(), ...newByColor.keys()])) {
    const olds = oldByColor.get(color) ?? [];
    const news = newByColor.get(color) ?? [];
    const flips = Math.min(olds.length, news.length);
    for (let i = 0; i < flips; i++) {
      phantoms.push({
        layoutId: `p${pairIdx++}`,
        courseCode: olds[i].courseCode,
        colorHex: color,
        fromRect: olds[i].rect,
        toRect: news[i].rect,
        kind: "flip",
        heading: olds[i].heading,
        section: olds[i].section,
      });
    }
    for (let i = flips; i < olds.length; i++) {
      phantoms.push({
        layoutId: `p${pairIdx++}`,
        courseCode: olds[i].courseCode,
        colorHex: color,
        fromRect: olds[i].rect,
        toRect: null,
        kind: "fadeOut",
        heading: olds[i].heading,
        section: olds[i].section,
      });
    }
  }

  return phantoms;
}

export interface CalendarMorphState {
  displayedIndex: number;
  phantoms: Phantom[];
  /** Real events must be invisible — the overlay owns the visual. */
  isHidingEvents: boolean;
  /** Real events should be fading in (second half, concurrent with phantom fade-out). */
  isFadingIn: boolean;
  onAnimationComplete: () => void;
  triggerTransition: (newIndex: number) => void;
}

/**
 * Two-half morph lifecycle:
 *
 *  idle
 *   → pre-animating  (parked phantoms cover old events; FullCalendar renders new schedule)
 *   → animating      (final phantoms slide; old text visible — first half)
 *   → animating-midpoint (phantom opacity fades out ↔ real events fade in — second half)
 *   → idle
 */
export function useCalendarMorph(
  initialIndex: number,
  containerRef: React.RefObject<HTMLElement | null>,
  prefersReduced: boolean,
): CalendarMorphState {
  const [displayedIndex, setDisplayedIndex] = useState(initialIndex);
  const [phase, setPhase] = useState<Phase>("idle");
  const [phantoms, setPhantoms] = useState<Phantom[]>([]);

  const oldCapturesRef = useRef<CapturedEvent[]>([]);
  const pendingIndexRef = useRef<number | null>(null);

  const triggerTransition = useCallback(
    (newIndex: number) => {
      if (newIndex === displayedIndex) return;

      if (prefersReduced) {
        setDisplayedIndex(newIndex);
        return;
      }

      // Capture positions while old events are still fully visible.
      const oldCaptures = captureEventPositions(containerRef.current);
      oldCapturesRef.current = oldCaptures;
      pendingIndexRef.current = newIndex;

      // Immediately cover old events with parked phantoms so the calendar grid
      // never becomes visible during the 50 ms FullCalendar render settle.
      setPhantoms(buildParkedPhantoms(oldCaptures));
      setDisplayedIndex(newIndex);
      setPhase("pre-animating");
    },
    [displayedIndex, prefersReduced, containerRef],
  );

  // pre-animating → wait for FullCalendar to finish rendering new events, then
  // replace parked phantoms with final animated ones.
  useEffect(() => {
    if (phase !== "pre-animating") return;
    const t = window.setTimeout(() => {
      const newCaptures = captureEventPositions(containerRef.current);
      const built = buildPhantoms(oldCapturesRef.current, newCaptures);
      if (built.length === 0) {
        setPhantoms([]);
        setPhase("animating-midpoint");
        return;
      }
      // Final phantoms start at the same positions as parked ones, so
      // Framer Motion's `initial` = fromRect means no visible jump.
      setPhantoms(built);
      setPhase("animating");
    }, RENDER_SETTLE_MS);
    return () => window.clearTimeout(t);
  }, [phase, containerRef]);

  // animating → at the halfway point, start revealing real events.
  useEffect(() => {
    if (phase !== "animating") return;
    const t = window.setTimeout(() => {
      setPhase("animating-midpoint");
    }, HALF_PHANTOM_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  // animating-midpoint with no phantoms (the skip case) → back to idle.
  useEffect(() => {
    if (phase !== "animating-midpoint" || phantoms.length > 0) return;
    const t = window.setTimeout(() => {
      setPhase("idle");
      pendingIndexRef.current = null;
    }, HALF_PHANTOM_MS);
    return () => window.clearTimeout(t);
  }, [phase, phantoms.length]);

  const onAnimationComplete = useCallback(() => {
    setPhantoms([]);
    setPhase("idle");
    pendingIndexRef.current = null;
  }, []);

  return {
    displayedIndex,
    phantoms,
    isHidingEvents: phase === "pre-animating" || phase === "animating",
    isFadingIn: phase === "animating-midpoint",
    onAnimationComplete,
    triggerTransition,
  };
}
