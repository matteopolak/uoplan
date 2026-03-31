import { useState, useEffect, useRef, useCallback } from "react";

export interface CapturedEvent {
  courseCode: string;
  colorHex: string;
  rect: DOMRect;
  heading: string;
  section: string;
  professor: string;
}

export interface Phantom {
  layoutId: string;
  courseCode: string;
  colorHex: string;
  fromRect: DOMRect | null;
  toRect: DOMRect | null;
  kind: "flip" | "fadeOut";
  heading: string;
  section: string;
  professor: string;
  toHeading: string;
  toSection: string;
  toProfessor: string;
}

type Phase =
  | "idle"
  /** Events hidden, parked phantoms at old positions, FullCalendar rendering new schedule. */
  | "pre-animating"
  /** Final phantoms animating — first half slides, second half fades out. */
  | "animating";

/** Duration of the full phantom animation (ms). */
export const PHANTOM_MS = 350;
/** The midpoint at which the phantom stops moving and starts fading (ms). */
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
      const professor =
        el.querySelector(".fc-uoplan-event-professor > span")?.textContent ?? "";
      captures.push({ courseCode, colorHex, rect, heading, section, professor });
    }
  }
  return captures;
}

/** Build stationary phantoms to cover old events while FullCalendar re-renders. */
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
    professor: c.professor,
    toHeading: c.heading,
    toSection: c.section,
    toProfessor: c.professor,
  }));
}

function buildPhantoms(
  oldEvents: CapturedEvent[],
  newEvents: CapturedEvent[],
): Phantom[] {
  const phantoms: Phantom[] = [];
  const matchedOld = new Set<number>();
  const matchedNew = new Set<number>();
  let idx = 0;

  // Primary: match by courseCode
  for (let oi = 0; oi < oldEvents.length; oi++) {
    const old = oldEvents[oi];
    if (!old.courseCode) continue;
    for (let ni = 0; ni < newEvents.length; ni++) {
      if (matchedNew.has(ni)) continue;
      if (newEvents[ni].courseCode === old.courseCode) {
        phantoms.push({
          layoutId: `p${idx++}`,
          courseCode: old.courseCode,
          colorHex: old.colorHex,
          fromRect: old.rect,
          toRect: newEvents[ni].rect,
          kind: "flip",
          heading: old.heading,
          section: old.section,
          professor: old.professor,
          toHeading: newEvents[ni].heading,
          toSection: newEvents[ni].section,
          toProfessor: newEvents[ni].professor,
        });
        matchedOld.add(oi);
        matchedNew.add(ni);
        break;
      }
    }
  }

  // Secondary: match remaining by colorHex
  const remaining = <T extends { colorHex: string; i: number }>(
    list: T[],
    matched: Set<number>,
  ) => list.filter((c) => !matched.has(c.i));

  const remOld = remaining(
    oldEvents.map((c, i) => ({ ...c, i })),
    matchedOld,
  );
  const remNew = remaining(
    newEvents.map((c, i) => ({ ...c, i })),
    matchedNew,
  );

  const bucket = <T extends { colorHex: string }>(arr: T[]) => {
    const m = new Map<string, T[]>();
    for (const c of arr) {
      const b = m.get(c.colorHex) ?? [];
      b.push(c);
      m.set(c.colorHex, b);
    }
    return m;
  };

  const oldByColor = bucket(remOld);
  const newByColor = bucket(remNew);

  for (const color of new Set([...oldByColor.keys(), ...newByColor.keys()])) {
    const olds = oldByColor.get(color) ?? [];
    const news = newByColor.get(color) ?? [];
    const flips = Math.min(olds.length, news.length);
    for (let i = 0; i < flips; i++) {
      phantoms.push({
        layoutId: `p${idx++}`,
        courseCode: olds[i].courseCode,
        colorHex: color,
        fromRect: olds[i].rect,
        toRect: news[i].rect,
        kind: "flip",
        heading: olds[i].heading,
        section: olds[i].section,
        professor: olds[i].professor,
        toHeading: news[i].heading,
        toSection: news[i].section,
        toProfessor: news[i].professor,
      });
    }
    for (let i = flips; i < olds.length; i++) {
      phantoms.push({
        layoutId: `p${idx++}`,
        courseCode: olds[i].courseCode,
        colorHex: color,
        fromRect: olds[i].rect,
        toRect: null,
        kind: "fadeOut",
        heading: olds[i].heading,
        section: olds[i].section,
        professor: olds[i].professor,
        toHeading: olds[i].heading,
        toSection: olds[i].section,
        toProfessor: olds[i].professor,
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
  onAnimationComplete: () => void;
  triggerTransition: (newIndex: number) => void;
}

/**
 * Animation phases:
 *
 *  idle
 *   → pre-animating  parked phantoms cover old positions; FC renders new schedule
 *   → animating      final phantoms: slide+crossfade (first half) → fade to 0 (second half)
 *   → idle           phantoms removed; real events revealed instantly
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
  // Always reflects the latest phase without stale-closure issues.
  const phaseRef = useRef<Phase>("idle");

  const setPhaseAndRef = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const triggerTransition = useCallback(
    (newIndex: number) => {
      if (newIndex === displayedIndex) return;
      // Ignore re-entrant calls while an animation is already running.
      if (phaseRef.current !== "idle") return;

      if (prefersReduced) {
        setDisplayedIndex(newIndex);
        return;
      }

      const oldCaptures = captureEventPositions(containerRef.current);
      oldCapturesRef.current = oldCaptures;
      pendingIndexRef.current = newIndex;

      // Parked phantoms cover old event positions the instant we hide them,
      // so the calendar grid never becomes visible during the render settle.
      setPhantoms(buildParkedPhantoms(oldCaptures));
      setDisplayedIndex(newIndex);
      setPhaseAndRef("pre-animating");
    },
    [displayedIndex, prefersReduced, containerRef, setPhaseAndRef],
  );

  // pre-animating → wait for FullCalendar to finish rendering, then start animation
  useEffect(() => {
    if (phase !== "pre-animating") return;
    const t = window.setTimeout(() => {
      const newCaptures = captureEventPositions(containerRef.current);
      const built = buildPhantoms(oldCapturesRef.current, newCaptures);
      if (built.length === 0) {
        setPhantoms([]);
        setPhaseAndRef("idle");
        return;
      }
      setPhantoms(built);
      setPhaseAndRef("animating");
    }, RENDER_SETTLE_MS);
    return () => window.clearTimeout(t);
  }, [phase, containerRef, setPhaseAndRef]);

  const onAnimationComplete = useCallback(() => {
    // Phantoms are at opacity 0. Remove them instantly — real events reveal in the same frame.
    setPhantoms([]);
    setPhaseAndRef("idle");
    pendingIndexRef.current = null;
  }, [setPhaseAndRef]);

  return {
    displayedIndex,
    phantoms,
    isHidingEvents: phase === "pre-animating" || phase === "animating",
    onAnimationComplete,
    triggerTransition,
  };
}
