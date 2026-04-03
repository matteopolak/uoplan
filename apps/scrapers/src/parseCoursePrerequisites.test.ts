import { describe, it, expect } from 'vitest';
import { parseCoursePrerequisites } from './scraper.ts';

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
