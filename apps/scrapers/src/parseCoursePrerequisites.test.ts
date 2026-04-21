import { describe, it, expect } from 'vitest';
import { parseCoursePrerequisites, extractPrereqSentence } from './scraper.ts';

describe('parseCoursePrerequisites', () => {
  it('parses nested OR before discipline OR (CSI/SDS) and merges unit requirement', () => {
    const text =
      'MAT 1341, ((MAT 2371, STA 2100) or STA 2391) and 12 course units in CSI or SDS at the 3000 or 4000 level';
    const tree = parseCoursePrerequisites(text);
    expect(tree?.type).toBe('and_group');
    const top = tree?.children ?? [];
    expect(top).toHaveLength(2);
    expect(top[0]).toMatchObject({ type: 'course', code: 'MAT 1341' });

    expect(top[1]?.type).toBe('and_group');
    const mid = top[1]?.children ?? [];
    expect(mid).toHaveLength(2);

    expect(mid[0]?.type).toBe('or_group');
    const orChildren = mid[0]?.children ?? [];
    expect(orChildren).toHaveLength(2);
    expect(orChildren[0]?.type).toBe('and_group');
    expect(orChildren[0]?.children?.map((c) => c.code)).toEqual(['MAT 2371', 'STA 2100']);
    expect(orChildren[1]).toMatchObject({ type: 'course', code: 'STA 2391' });

    expect(mid[1]).toMatchObject({
      type: 'non_course',
      credits: 12,
      disciplines: expect.arrayContaining(['CSI', 'SDS']) as string[],
    });
    expect(mid[1]?.disciplineLevels?.map((d) => d.discipline).sort()).toEqual(['CSI', 'SDS']);
    expect(mid[1]?.disciplineLevels?.[0]?.levels).toEqual([3000, 4000]);
  });

  it('parses SEG 2105 with merged CEG/SEG unit clause (not splitting SEG across or_group)', () => {
    const text =
      'MAT 1341, STA 2391 or (MAT 2371, STA 2100), SEG 2105 and 6 university course units in CEG or SEG at the 3000 level';
    const tree = parseCoursePrerequisites(text);
    expect(tree?.type).toBe('and_group');
    const parts = tree?.children ?? [];
    expect(parts).toHaveLength(3);
    expect(parts[0]).toMatchObject({ type: 'course', code: 'MAT 1341' });

    expect(parts[1]?.type).toBe('or_group');
    const orCh = parts[1]?.children ?? [];
    expect(orCh).toHaveLength(2);
    expect(orCh[0]).toMatchObject({ type: 'course', code: 'STA 2391' });
    expect(orCh[1]?.type).toBe('and_group');

    expect(parts[2]?.type).toBe('and_group');
    const last = parts[2]?.children ?? [];
    expect(last).toHaveLength(2);
    expect(last[0]).toMatchObject({ type: 'course', code: 'SEG 2105' });
    expect(last[1]).toMatchObject({
      type: 'non_course',
      credits: 6,
      disciplines: expect.arrayContaining(['CEG', 'SEG']) as string[],
    });
  });

  it('does not split MAT 1341 and MAT 1342 into guarded and_group', () => {
    const tree = parseCoursePrerequisites('MAT 1341 and MAT 1342');
    expect(tree?.type).toBe('and_group');
    const codes = (tree?.children ?? []).map((c) => c.code).filter(Boolean);
    expect(codes.sort()).toEqual(['MAT 1341', 'MAT 1342']);
  });
});

describe('extractPrereqSentence', () => {
  it('extracts simple prerequisite sentence', () => {
    const raw = 'Prerequisite: ADM 1100 or ADM 1300. Course open to all students.';
    expect(extractPrereqSentence(raw)).toBe('ADM 1100 or ADM 1300');
  });

  it('handles B.Com abbreviation without truncating', () => {
    const raw = 'Prerequisite: Course reserved for students in a B.Com program. Other students may not enroll.';
    expect(extractPrereqSentence(raw)).toBe('Course reserved for students in a B.Com program');
  });

  it('handles B.A. abbreviation without truncating', () => {
    const raw = 'Prerequisite: admission to the Honours B.A. program. Minimum GPA required.';
    expect(extractPrereqSentence(raw)).toBe('admission to the Honours B.A. program');
  });

  it('handles grade B+ in parentheses without truncating', () => {
    const raw = 'Prerequisite: ADM 2350 (B+ or higher). Minimum grade requirement.';
    expect(extractPrereqSentence(raw)).toBe('ADM 2350 (B+ or higher)');
  });

  it('handles French Baccalauréat abbreviation', () => {
    const raw = 'Préalable: Réservé aux étudiants inscrits au Baccalauréat en musique (B.Mus.).';
    expect(extractPrereqSentence(raw)).toBe('Réservé aux étudiants inscrits au Baccalauréat en musique (B.Mus.)');
  });

  it('returns undefined when no prerequisite label found', () => {
    const raw = 'This course has no prerequisites listed.';
    expect(extractPrereqSentence(raw)).toBeUndefined();
  });

  it('handles multiple sentences after prerequisite', () => {
    const raw = 'Prerequisite: MAT 1341. This course is challenging. Students should prepare.';
    expect(extractPrereqSentence(raw)).toBe('MAT 1341');
  });

  it('stops at bilingual separator and keeps only first language', () => {
    const raw = 'Préalable: 15 crédits. / Prerequisites: 15 units.';
    expect(extractPrereqSentence(raw)).toBe('15 crédits');
  });

  it('stops at reverse bilingual separator', () => {
    const raw = 'Prerequisite: 15 units. / Préalables: 15 crédits.';
    expect(extractPrereqSentence(raw)).toBe('15 units');
  });
});

describe('parseCoursePrerequisites - edge cases', () => {
  it('ignores grade indicator (M) as separate prerequisite', () => {
    const text = 'CMN 2160. (M)';
    const tree = parseCoursePrerequisites(text);
    expect(tree?.type).toBe('course');
    expect(tree?.code).toBe('CMN 2160');
  });

  it('ignores grade indicator (B+) as separate prerequisite', () => {
    const text = 'ADM 2350 (B+ or higher)';
    const tree = parseCoursePrerequisites(text);
    expect(tree?.type).toBe('course');
    expect(tree?.code).toBe('ADM 2350');
    expect(tree?.text).toBe('ADM 2350 (B+ or higher)');
  });

  it('ignores standalone grade indicators', () => {
    const text = '(A-)';
    const tree = parseCoursePrerequisites(text);
    expect(tree).toBeUndefined();
  });

  it('ignores honors standing indicator (H)', () => {
    const text = 'ART 1361. (H)';
    const tree = parseCoursePrerequisites(text);
    expect(tree?.type).toBe('course');
    expect(tree?.code).toBe('ART 1361');
  });

  it('ignores two-letter standing indicator (HP)', () => {
    const text = '12 crédits PHI incluant PHI 2783. (HP)';
    const tree = parseCoursePrerequisites(text);
    expect(tree?.type).toBe('and_group');
    // Should not have the (HP) as a separate non_course node
    const hasHP = JSON.stringify(tree).includes('"text":"HP"');
    expect(hasHP).toBe(false);
  });

  it('handles decimal credits without splitting', () => {
    const text = '7.5 credits';
    const tree = parseCoursePrerequisites(text);
    expect(tree?.type).toBe('non_course');
    expect(tree?.credits).toBe(7.5);
  });

  it('extracts credits from English "credits" text', () => {
    const text = '18 credits of university-level courses';
    const tree = parseCoursePrerequisites(text);
    expect(tree?.type).toBe('non_course');
    expect(tree?.credits).toBe(18);
  });

  it('does not split 1000 and 2000 level text', () => {
    const text = 'All ADM core courses at 1000 and 2000 levels';
    const tree = parseCoursePrerequisites(text);
    expect(tree?.type).toBe('non_course');
    expect(tree?.text).toBe('All ADM core courses at 1000 and 2000 levels');
  });

  it('preserves B.Com abbreviation', () => {
    const text = 'Courses reserved for B.Com students';
    const tree = parseCoursePrerequisites(text);
    expect(tree?.type).toBe('non_course');
    expect(tree?.text).toContain('B.Com');
  });
});
