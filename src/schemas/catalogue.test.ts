import { describe, it, expect } from 'vitest';
import {
  CatalogueSchema,
  CourseSchema,
  ProgramRequirementSchema,
} from './catalogue';

const minimalCourse = {
  code: 'AMM 5101',
  title: 'Theory of Elasticity',
  credits: 3,
  description: 'Test',
  component: 'Lecture',
};

describe('CatalogueSchema', () => {
  it('parses real catalogue structure', () => {
    const data = {
      courses: [minimalCourse],
      programs: [
        {
          title: 'Test Program',
          url: 'https://example.com',
          requirements: [
            { type: 'course' as const, code: 'AMM 5101', credits: 3 },
          ],
        },
      ],
    };
    const result = CatalogueSchema.parse(data);
    expect(result.courses).toHaveLength(1);
    expect(result.courses[0].code).toBe('AMM 5101');
    expect(result.programs).toHaveLength(1);
    expect(result.programs[0].title).toBe('Test Program');
  });

  it('rejects invalid data', () => {
    expect(() =>
      CatalogueSchema.parse({ courses: 'not array', programs: [] })
    ).toThrow();
    expect(() =>
      CatalogueSchema.parse({ courses: [], programs: 'not array' })
    ).toThrow();
  });
});

describe('ProgramRequirementSchema', () => {
  it('parses recursive and/group structures', () => {
    const req = {
      type: 'and' as const,
      title: 'Compulsory',
      options: [
        { type: 'course' as const, code: 'ESL 2100', credits: 3 },
        {
          type: 'group' as const,
          title: '9 from:',
          credits: 9,
          options: [
            { type: 'course' as const, code: 'ESL 2181' },
            { type: 'course' as const, code: 'ESL 2332' },
          ],
        },
      ],
    };
    const result = ProgramRequirementSchema.parse(req);
    expect(result.type).toBe('and');
    expect(result.options).toHaveLength(2);
    expect(result.options![0].type).toBe('course');
    expect(result.options![1].type).toBe('group');
    expect(result.options![1].options).toHaveLength(2);
  });
});

describe('CourseSchema', () => {
  it('parses valid course', () => {
    const result = CourseSchema.parse(minimalCourse);
    expect(result.code).toBe('AMM 5101');
    expect(result.title).toBe('Theory of Elasticity');
  });
});
