import { describe, it, expect } from 'vitest';
import {
  encodeState,
  decodeState,
  encodeStateToBase64,
  decodeStateFromBase64,
  peekTermAndYear,
  peekTermAndYearFromBase64,
  urlToSlug,
  type EncodeInput,
  type CatalogueLike,
} from './stateEncode';
import type { Indices } from '../schemas/indices';
import type { Program } from '../schemas/catalogue';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const programA: Program = {
  title: 'BSc Computer Science',
  url: 'https://catalogue.uottawa.ca/en/undergrad/bsc-computer-science/',
  slug: 'undergrad/bsc-computer-science',
  requirements: [],
};

const programB: Program = {
  title: 'BA English',
  url: 'https://catalogue.uottawa.ca/en/undergrad/ba-english/',
  // no slug — should fall back to urlToSlug(url)
  requirements: [],
};

const catalogue: CatalogueLike = {
  courses: [
    { code: 'CSI 2110' },
    { code: 'MAT 1320' },
    { code: 'PHY 1122' },
  ],
  programs: [programA, programB],
};

const indices: Indices = {
  courses: ['CSI 2110', 'MAT 1320', 'PHY 1122'],
  programs: [
    'undergrad/bsc-computer-science',
    'undergrad/ba-english',
  ],
};

function makeInput(overrides: Partial<EncodeInput> = {}): EncodeInput {
  return {
    selectedTermId: '202509',
    firstYear: null,
    program: programA,
    completedCourses: ['MAT 1320'],
    levelBuckets: ['undergrad'],
    languageBuckets: ['en', 'other'],
    electiveLevelBuckets: [1000, 2000],
    coursesThisSemester: 5,
    selectedScheduleIndex: 2,
    generationSeed: 0xdeadbeef,
    selectedPerRequirement: {},
    selectedOptionsPerRequirement: {},
    requirementTreeWithStatus: [],
    remainingRequirements: [],
    includeClosedComponents: false,
    studentPrograms: ['CSI', 'MAT'],
    ...overrides,
  };
}

// ── urlToSlug ─────────────────────────────────────────────────────────────────

describe('urlToSlug', () => {
  it('strips current-year base URL and trailing slash', () => {
    expect(urlToSlug('https://catalogue.uottawa.ca/en/undergrad/bsc-computer-science/'))
      .toBe('undergrad/bsc-computer-science');
  });

  it('strips archive-year base URL', () => {
    expect(urlToSlug('https://catalogue.uottawa.ca/archive/2024-2025/en/undergrad/honours-bsc-biology/'))
      .toBe('undergrad/honours-bsc-biology');
  });

  it('handles URLs without trailing slash', () => {
    expect(urlToSlug('https://catalogue.uottawa.ca/en/undergrad/bsc-computer-science'))
      .toBe('undergrad/bsc-computer-science');
  });

  it('handles http scheme', () => {
    expect(urlToSlug('http://catalogue.uottawa.ca/en/grad/msc-cs/'))
      .toBe('grad/msc-cs');
  });
});

// ── Full roundtrip ────────────────────────────────────────────────────────────

describe('encodeState / decodeState roundtrip', () => {
  it('round-trips all basic fields', () => {
    const input = makeInput();
    const bytes = encodeState(input, catalogue, indices);
    expect(bytes).not.toBeNull();

    const decoded = decodeState(bytes!, catalogue, indices);
    expect('error' in decoded).toBe(false);
    if ('error' in decoded) return;

    expect(decoded.selectedTermId).toBe('202509');
    expect(decoded.firstYear).toBeNull();
    expect(decoded.program?.title).toBe('BSc Computer Science');
    expect(decoded.completedCourseCodes).toEqual(['MAT 1320']);
    expect(decoded.levelBuckets).toEqual(['undergrad']);
    expect(decoded.languageBuckets).toEqual(['en', 'other']);
    expect(decoded.electiveLevelBuckets).toEqual([1000, 2000]);
    expect(decoded.coursesThisSemester).toBe(5);
    expect(decoded.selectedScheduleIndex).toBe(2);
    expect(decoded.generationSeed).toBe(0xdeadbeef >>> 0);
    expect(decoded.includeClosedComponents).toBe(false);
    expect(decoded.studentPrograms).toEqual(['CSI', 'MAT']);
  });

  it('round-trips firstYear', () => {
    const input = makeInput({ firstYear: 2023 });
    const bytes = encodeState(input, catalogue, indices);
    const decoded = decodeState(bytes!, catalogue, indices);
    expect('error' in decoded).toBe(false);
    if ('error' in decoded) return;
    expect(decoded.firstYear).toBe(2023);
  });

  it('encodes firstYear = null as 0 and decodes back to null', () => {
    const input = makeInput({ firstYear: null });
    const bytes = encodeState(input, catalogue, indices)!;
    const decoded = decodeState(bytes, catalogue, indices);
    expect('error' in decoded).toBe(false);
    if ('error' in decoded) return;
    expect(decoded.firstYear).toBeNull();
  });

  it('round-trips selectedTermId with various values', () => {
    for (const termId of ['202509', '20261', '111111']) {
      const input = makeInput({ selectedTermId: termId });
      const bytes = encodeState(input, catalogue, indices)!;
      const decoded = decodeState(bytes, catalogue, indices);
      expect('error' in decoded).toBe(false);
      if ('error' in decoded) return;
      expect(decoded.selectedTermId).toBe(termId);
    }
  });

  it('round-trips null selectedTermId', () => {
    const input = makeInput({ selectedTermId: null });
    const bytes = encodeState(input, catalogue, indices)!;
    const decoded = decodeState(bytes, catalogue, indices);
    expect('error' in decoded).toBe(false);
    if ('error' in decoded) return;
    expect(decoded.selectedTermId).toBeNull();
  });

  it('round-trips null program', () => {
    const input = makeInput({ program: null, completedCourses: [] });
    const bytes = encodeState(input, catalogue, indices)!;
    const decoded = decodeState(bytes, catalogue, indices);
    expect('error' in decoded).toBe(false);
    if ('error' in decoded) return;
    expect(decoded.program).toBeNull();
  });

  it('looks up program by slug when program has no slug field', () => {
    // programB has no slug field — should fall back to urlToSlug(url)
    const input = makeInput({ program: programB });
    const bytes = encodeState(input, catalogue, indices);
    expect(bytes).not.toBeNull();
    const decoded = decodeState(bytes!, catalogue, indices);
    expect('error' in decoded).toBe(false);
    if ('error' in decoded) return;
    expect(decoded.program?.title).toBe('BA English');
  });

  it('round-trips includeClosedComponents = true', () => {
    const input = makeInput({ includeClosedComponents: true });
    const bytes = encodeState(input, catalogue, indices)!;
    const decoded = decodeState(bytes, catalogue, indices);
    expect('error' in decoded).toBe(false);
    if ('error' in decoded) return;
    expect(decoded.includeClosedComponents).toBe(true);
  });

  it('returns null when program is not in indices', () => {
    const unknownProgram: Program = {
      title: 'Unknown',
      url: 'https://catalogue.uottawa.ca/en/undergrad/not-in-index/',
      requirements: [],
    };
    const input = makeInput({ program: unknownProgram });
    expect(encodeState(input, catalogue, indices)).toBeNull();
  });

  it('returns null when a completed course is not in indices', () => {
    const input = makeInput({ completedCourses: ['XYZ 9999'] });
    expect(encodeState(input, catalogue, indices)).toBeNull();
  });
});

// ── peekTermAndYear ───────────────────────────────────────────────────────────

describe('peekTermAndYear', () => {
  it('extracts termId and firstYear without catalogue', () => {
    const bytes = encodeState(makeInput({ firstYear: 2022 }), catalogue, indices)!;
    const peeked = peekTermAndYear(bytes);
    expect(peeked).not.toBeNull();
    expect(peeked!.termId).toBe('202509');
    expect(peeked!.firstYear).toBe(2022);
  });

  it('returns null termId when termId was null', () => {
    const bytes = encodeState(makeInput({ selectedTermId: null }), catalogue, indices)!;
    const peeked = peekTermAndYear(bytes);
    expect(peeked!.termId).toBeNull();
  });

  it('returns null firstYear when firstYear was null', () => {
    const bytes = encodeState(makeInput({ firstYear: null }), catalogue, indices)!;
    const peeked = peekTermAndYear(bytes);
    expect(peeked!.firstYear).toBeNull();
  });

  it('returns null on empty buffer', () => {
    expect(peekTermAndYear(new Uint8Array(0))).toBeNull();
  });

  it('returns null on version mismatch', () => {
    const bytes = encodeState(makeInput(), catalogue, indices)!;
    const bad = new Uint8Array(bytes);
    bad[0] = 99; // wrong version
    expect(peekTermAndYear(bad)).toBeNull();
  });
});

// ── peekTermAndYearFromBase64 ─────────────────────────────────────────────────

describe('peekTermAndYearFromBase64', () => {
  it('peeks correctly from base64', () => {
    const base64 = encodeStateToBase64(makeInput({ firstYear: 2024 }), catalogue, indices)!;
    const peeked = peekTermAndYearFromBase64(base64);
    expect(peeked!.termId).toBe('202509');
    expect(peeked!.firstYear).toBe(2024);
  });

  it('returns null for invalid base64', () => {
    expect(peekTermAndYearFromBase64('!!!notbase64!!!')).toBeNull();
  });
});

// ── Error cases ───────────────────────────────────────────────────────────────

describe('decodeState errors', () => {
  it('returns error on version mismatch', () => {
    const bytes = encodeState(makeInput(), catalogue, indices)!;
    const bad = new Uint8Array(bytes);
    bad[0] = 99;
    const result = decodeState(bad, catalogue, indices);
    expect('error' in result).toBe(true);
  });

  it('returns error on too-short buffer', () => {
    const result = decodeState(new Uint8Array(0), catalogue, indices);
    expect('error' in result).toBe(true);
  });

  it('returns error when program slug is no longer in catalogue', () => {
    const bytes = encodeState(makeInput(), catalogue, indices)!;
    // Present the same bytes to a catalogue missing programA
    const emptyCat: CatalogueLike = { courses: catalogue.courses, programs: [] };
    const result = decodeState(bytes, emptyCat, indices);
    expect('error' in result).toBe(true);
  });
});

// ── Base64 helpers ────────────────────────────────────────────────────────────

describe('encodeStateToBase64 / decodeStateFromBase64', () => {
  it('round-trips through base64', () => {
    const input = makeInput({ firstYear: 2021, selectedTermId: '202501' });
    const base64 = encodeStateToBase64(input, catalogue, indices);
    expect(base64).not.toBeNull();
    const decoded = decodeStateFromBase64(base64!, catalogue, indices);
    expect('error' in decoded).toBe(false);
    if ('error' in decoded) return;
    expect(decoded.selectedTermId).toBe('202501');
    expect(decoded.firstYear).toBe(2021);
  });

  it('returns error for invalid base64 string', () => {
    const result = decodeStateFromBase64('not-valid-base64!!!', catalogue, indices);
    expect('error' in result).toBe(true);
  });
});
