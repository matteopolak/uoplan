import fs from 'fs/promises';
import path from 'path';
import got from 'got';

const GRAPHQL_URL = 'https://www.ratemyprofessors.com/graphql';
const PAGE_SIZE = 1000;

const TEACHER_SEARCH_QUERY = `query TeacherSearchPaginationQuery(
  $count: Int!
  $cursor: String
  $query: TeacherSearchQuery!
) {
  search: newSearch {
    ...TeacherSearchPagination_search_1jWD3d
  }
}
fragment TeacherCard_teacher on Teacher {
  id
  legacyId
  avgRating
  numRatings
  firstName
  lastName
}
fragment TeacherSearchPagination_search_1jWD3d on newSearch {
  teachers(query: $query, first: $count, after: $cursor) {
    didFallback
    edges {
      node {
        ...TeacherCard_teacher
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
    resultCount
    filters {
      field
      options {
        value
        id
      }
    }
  }
}`;

interface TeacherNode {
  id: string;
  legacyId: number;
  avgRating: number | null;
  numRatings: number;
  firstName: string;
  lastName: string;
}

interface FormattedTeacherNode {
  name: string;
  rating: number | null;
  numRatings: number;
}

interface TeacherSearchResponse {
  data?: {
    search?: {
      teachers?: {
        edges: Array<{ node: TeacherNode }>;
        pageInfo: {
          hasNextPage: boolean;
          endCursor: string | null;
        };
        resultCount: number;
      };
    };
  };
  errors?: Array<{ message: string }>;
}

async function fetchTeachersPage(
  cursor: string | null,
  schoolId: string | null,
): Promise<TeacherSearchResponse> {
  const variables = {
    count: PAGE_SIZE,
    cursor,
    query: {
      text: '',
      ...(schoolId ? { schoolID: schoolId } : {}),
      fallback: true,
    },
  };

  const res = await got.post(GRAPHQL_URL, {
    json: {
      query: TEACHER_SEARCH_QUERY,
      operationName: 'TeacherSearchPaginationQuery',
      variables,
    },
    responseType: 'json',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent':
        'Mozilla/5.0 (compatible; uoplan-scraper/1.0)',
    },
  });

  return res.body as TeacherSearchResponse;
}

async function main(): Promise<void> {
  // Optional: scrape a specific school (e.g. University of Ottawa). Omit to try global search.
  const schoolId = process.env.RMP_SCHOOL_ID || 'U2Nob29sLTE0NTI=';

  const allTeachers: FormattedTeacherNode[] = [];
  let cursor: string | null = null;
  let page = 0;

  console.log('Fetching professors from RateMyProfessors (GraphQL)...');

  while (true) {
    page += 1;
    const data = await fetchTeachersPage(cursor, schoolId);

    if (data.errors?.length) {
      throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
    }

    const teachers = data.data?.search?.teachers;
    if (!teachers) {
      throw new Error('Unexpected response: no data.search.teachers');
    }

    const nodes = teachers.edges.map((e) => ({
      name: `${e.node.firstName} ${e.node.lastName}`,
      rating: e.node.avgRating,
      numRatings: e.node.numRatings,
    }));
    allTeachers.push(...nodes);

    const { pageInfo, resultCount } = teachers;
    console.log(
      `Page ${page}: got ${nodes.length} professors (total so far: ${allTeachers.length}, resultCount: ${resultCount})`,
    );

    if (!pageInfo.hasNextPage) {
      break;
    }
    cursor = pageInfo.endCursor ?? null;
    if (!cursor) {
      console.warn('hasNextPage was true but endCursor missing; stopping.');
      break;
    }

    // Be nice to the API
    await new Promise((r) => setTimeout(r, 300));
  }

  const outDir = path.join(process.cwd(), 'public', 'data');
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, 'ratemyprofessors.json');

  allTeachers.sort((a, b) => a.name.localeCompare(b.name));

  const output = {
    resultCount: allTeachers.length,
    professors: allTeachers,
  };

  await fs.writeFile(outPath, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`Saved ${allTeachers.length} professors to ${outPath}`);
}

main().catch((err) => {
  console.error('RateMyProfessors scrape failed:', err);
  process.exit(1);
});
