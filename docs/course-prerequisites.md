## Course prerequisite model and integration notes

This document explains how course prerequisites are represented in the scraped catalogue data, and how they can be integrated into the requirements / eligibility engine.

The scraper lives in `scripts/scraper.ts` and writes `public/data/catalogue.json`.

---

### Data model overview

Each course in `catalogue.json` now has two prerequisite-related fields:

- `prereqText?: string`
- `prerequisites?: CoursePrereqNode`

These are added on top of the existing `Course` fields:

```ts
type Course = {
  code: string;            // e.g. "ADM 2702"
  title: string;
  credits: number;         // course credit value (e.g. 3)
  description: string;
  component?: string;      // e.g. "Lecture", "Discussion Group, Lecture"

  // NEW:
  prereqText?: string;
  prerequisites?: CoursePrereqNode;
};
```

#### `prereqText`

- Normalized prerequisite sentence extracted from the catalogue page.
- Sourced from the `.courseblockextra.highlight` paragraph, with the leading label removed.
- Examples:
  - `"ADM 1300, ENG 1131 and 24 university course units"`
  - `"(ADM 1705 ou MAT 1702), (ADM 1770 ou ITI 1520)"`
  - `"18 crédits universitaires"`
  - `"ANT 1101 or 18 university units"`

Use this as the “ground truth” text for debugging or for any future parsing refinements.

#### `CoursePrereqNode`

Prerequisites are represented as a small AST that can encode basic AND/OR logic, explicit course requirements, credit thresholds, and discipline-scoped credit thresholds.

```ts
type CoursePrereqNode = {
  type: 'course' | 'or_group' | 'and_group' | 'non_course';
  code?: string;          // for type === 'course'
  text?: string;          // human-readable clause text
  credits?: number;       // numeric credit requirement (if any)
  disciplines?: string[]; // discipline codes like ['ANT'] for scoped credit requirements
  children?: CoursePrereqNode[]; // for group nodes
};
```

- **`type: 'course'`**
  - Represents a specific course that must be (or can be) taken.
  - Fields:
    - `code`: e.g. `"ADM 1300"`, `"MAT 1702"`.
    - `text` (optional): source clause text for context.

- **`type: 'and_group'`**
  - Represents a logical AND across `children`.
  - Semantics: *all* children must be satisfied.
  - Used for:
    - Combining multiple independent prerequisites in a single sentence:
      - `"ECO 1502, ECO 1504, (ADM 1740 ou ADM 2740)"`  
        ⇒ `and_group` with children:
        - `course("ECO 1502")`
        - `course("ECO 1504")`
        - `or_group(ADM 1740, ADM 2740)`
    - Representing something like:
      - `"ADM 1300, ENG 1131 and 24 university course units"`  
        ⇒ `and_group` with children:
        - `course("ADM 1300")`
        - `course("ENG 1131")`
        - `non_course(credits: 24)`

- **`type: 'or_group'`**
  - Represents a logical OR across `children`.
  - Semantics: *at least one* child must be satisfied.
  - Examples:
    - `"ADM 1705 ou MAT 1702"`  
      ⇒ `or_group` of `course("ADM 1705")` and `course("MAT 1702")`.
    - `"ANT 1101 or 18 university units"`  
      ⇒ `or_group` of:
      - `course("ANT 1101")`
      - `non_course(credits: 18)`
    - `"9 course units in anthropology (ANT) or 54 university units"`  
      ⇒ `or_group` of:
      - `non_course(credits: 9, disciplines: ['ANT'])`
      - `non_course(credits: 54)`

- **`type: 'non_course'`**
  - Captures requirements that aren’t a single explicit course.
  - This is intentionally broad; it covers credit thresholds, discipline-scoped credit thresholds, and descriptive text-only clauses.
  - Important fields:
    - `credits?: number`
      - Examples:
        - `"18 university units"` ⇒ `{ type: 'non_course', credits: 18 }`
        - `"18 crédits universitaires"` ⇒ same, but in French.
    - `disciplines?: string[]`
      - Extracted from discipline codes in parentheses, e.g. `(ANT)`.
      - Example:
        - `"9 course units in anthropology (ANT)"` ⇒
          - `{ type: 'non_course', credits: 9, disciplines: ['ANT'] }`
    - `text?: string`
      - Always set to the human-readable clause, for reference and for requirements the engine does not interpret structurally (e.g. “All 1000-, 2000-, and 3000-level core ADM courses completed”).

---

### Parsing strategy (high level)

The parser takes `prereqText` and produces a `CoursePrereqNode` tree. The key behaviors:

- **Label stripping and sentence isolation**
  - Raw HTML looks like:  
    `"Prerequisites: ADM 1300, ENG 1131 and 24 university course units. Also offered as SOC 2103."`
  - `extractPrereqSentence`:
    - Strips the label (`Prerequisite(s)`, `Préalable(s)`, including French variants and minor typos).
    - Stops at the first `.` to avoid mixing in “also offered as …” or “cannot be combined …” text.
    - Normalizes spaces.

- **Clause splitting**
  - Top-level split on `.`, `;` while tracking parentheses so that groups like `(ADM 1705 ou MAT 1702)` stay intact.
  - Each clause is parsed independently and combined with an implicit AND at the root if multiple clauses exist.

- **Parentheses and comma handling**
  - Multiple top-level parenthesized groups inside one clause, e.g.  
    `"(ADM 1705 ou MAT 1702), (ADM 1770 ou ITI 1520)"`  
    are parsed as two separate sub-clauses, combined in an `and_group`.
  - Mixed clauses like:  
    `"ECO 1502, ECO 1504, (ADM 1740 ou ADM 2740)"`  
    are split at top-level commas into sub-clauses:
    - `"ECO 1502"`
    - `"ECO 1504"`
    - `"(ADM 1740 ou ADM 2740)"`
    and each is parsed recursively, then wrapped in an `and_group`.

- **OR detection**
  - Inside a clause (or inside each parenthesized group), the parser looks for `or`/`ou` at top level (again with parentheses-aware splitting).
  - Each OR branch is usually one of:
    - A single course.
    - A discipline/credit requirement.
    - A short list of courses (in which case an `and_group` of `course` nodes is created inside that OR branch).

- **Credits and disciplines**
  - A simple regex finds numeric credit requirements in both English and French:
    - `(\d+(\.\d+)?) ... (units?|crédits?|crédit)`
  - Discipline codes are pulled from `(XXX)` patterns inside the clause.
  - When a clause has both courses and a credit requirement, the parser produces an `and_group` with:
    - One `course` node per explicit course code.
    - A `non_course` node holding the credit requirement (and any disciplines).

This strategy is conservative: it aims to produce a structurally useful tree for the common patterns, while still preserving the full `text` so that edge cases can be handled manually or in later refinements.

---

### How to use this in the requirements engine

The requirements / eligibility engine can treat `CoursePrereqNode` as a small DSL for prerequisite checks. A typical evaluation function might look like:

```ts
type TakenCourse = { code: string; credits: number; discipline: string };

function meetsCoursePrereq(
  node: CoursePrereqNode,
  taken: TakenCourse[],
  totalCredits: number,
  disciplineCredits: Record<string, number>,
): boolean {
  switch (node.type) {
    case 'course':
      return taken.some(c => c.code === node.code);
    case 'and_group':
      return (node.children ?? []).every(child =>
        meetsCoursePrereq(child, taken, totalCredits, disciplineCredits),
      );
    case 'or_group':
      return (node.children ?? []).some(child =>
        meetsCoursePrereq(child, taken, totalCredits, disciplineCredits),
      );
    case 'non_course':
      return evaluateNonCourseRequirement(node, totalCredits, disciplineCredits);
  }
}
```

#### Evaluating `non_course` requirements

How you handle `non_course` nodes will depend on what the engine currently knows about the student. A reasonable baseline:

- **Plain credit thresholds**
  - If `node.credits` is set and `node.disciplines` is **not** set:
    - Treat as “has completed at least `node.credits` university credits”.
    - Check against `totalCredits` (or an equivalent concept in your model).

- **Discipline-scoped credit thresholds**
  - If `node.credits` and `node.disciplines` are both set:
    - Treat as “has completed at least `node.credits` credits in any of these disciplines.”
    - For example, for `disciplines: ['ANT']` and `credits: 9`, use:
      - `disciplineCredits['ANT'] >= 9`.
    - If multiple disciplines appear, you can interpret them as:
      - “credits in any of these” (sum across them), or
      - “credits in each” (stricter), depending on downstream needs. The scraper does not disambiguate this further.

- **Descriptive / unsupported non-course clauses**
  - If `credits` is not set, you can:
    - Treat it as **unknown/unsupported** and either:
      - Mark the prerequisite as “cannot be auto-verified”, or
      - Fall back to a manual rule keyed by `node.text`.
  - Examples:
    - `"Tous les cours ADM du tronc commun de niveaux 1000, 2000, 3000..."`  
      ⇒ may require custom logic outside of this generic model.

#### Integration guidelines

1. **Use structural logic first**
   - Respect `and_group` / `or_group` structure exactly:
     - `and_group` ⇒ all children must be satisfied.
     - `or_group` ⇒ at least one child must be satisfied.
   - This captures most realistic prerequisite combinations (single ORs, multiple ANDs of ORs, credits OR course, etc.).

2. **Leverage `course` nodes for graph-building**
   - Every `course` node has a `code` string you can use to:
     - Build a directed graph of course dependencies.
     - Detect cycles or suggest course ordering.
   - You do **not** need to parse `text` for `course` nodes; rely on `code`.

3. **Treat `non_course` nodes as soft constraints where necessary**
   - If the engine has robust credit tracking, you can implement hard checks for:
     - `credits` only.
     - `credits` + `disciplines`.
   - Otherwise, consider:
     - Surfacing them as advisory messages (“You should have ~18 credits completed”).
     - Or gating enrolment only on `course` and `or_group`/`and_group` structure, while leaving non-course checks for later.

4. **Always keep `prereqText` as a fallback**
   - If the engine sees a `non_course` node it does not understand, it can always:
     - Display `prereqText` to the user.
     - Or flag the course for manual rule coding.

---

### Examples from the live data

These are representative patterns currently seen in `public/data/catalogue.json`:

- **Simple single-course prerequisite**

```json
{
  "code": "ADM 1340",
  "prereqText": "ADM 1100",
  "prerequisites": {
    "type": "course",
    "code": "ADM 1100",
    "text": "ADM 1100"
  }
}
```

- **Course OR credit threshold**

```json
{
  "code": "ANT 2103",
  "prereqText": "ANT 1101 or 18 university units",
  "prerequisites": {
    "type": "or_group",
    "text": "ANT 1101 or 18 university units",
    "children": [
      { "type": "course", "code": "ANT 1101", "text": "ANT 1101" },
      { "type": "non_course", "text": "18 university units", "credits": 18 }
    ]
  }
}
```

- **Discipline-scoped credit threshold OR plain credits**

```json
{
  "code": "ANT 31053",
  "prereqText": "9 course units in anthropology (ANT) or 54 university units",
  "prerequisites": {
    "type": "or_group",
    "text": "9 course units in anthropology (ANT) or 54 university units",
    "children": [
      {
        "type": "non_course",
        "text": "9 course units in anthropology (ANT)",
        "credits": 9,
        "disciplines": ["ANT"]
      },
      {
        "type": "non_course",
        "text": "54 university units",
        "credits": 54
      }
    ]
  }
}
```

- **AND of two independent OR-groups**

```json
{
  "code": "ADM 2702",
  "prereqText": "(ADM 1705 ou MAT 1702), (ADM 1770 ou ITI 1520)",
  "prerequisites": {
    "type": "and_group",
    "text": "(ADM 1705 ou MAT 1702), (ADM 1770 ou ITI 1520)",
    "children": [
      {
        "type": "or_group",
        "text": "ADM 1705 ou MAT 1702",
        "children": [
          { "type": "course", "code": "ADM 1705", "text": "ADM 1705" },
          { "type": "course", "code": "MAT 1702", "text": "MAT 1702" }
        ]
      },
      {
        "type": "or_group",
        "text": "ADM 1770 ou ITI 1520",
        "children": [
          { "type": "course", "code": "ADM 1770", "text": "ADM 1770" },
          { "type": "course", "code": "ITI 1520", "text": "ITI 1520" }
        ]
      }
    ]
  }
}
```

These patterns should be enough for another agent to wire the prerequisites into the requirements engine in a predictable way. If stricter semantics are needed for particular text-only `non_course` clauses, they can be handled via special cases keyed on `prereqText` or `non_course.text`.

