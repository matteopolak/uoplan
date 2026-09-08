import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCHOOL_ID,
  getSchool,
  isSchoolId,
  SCHOOL_IDS,
  SCHOOL_WIRE_IDS,
  schoolAssetId,
  schoolFromPathname,
  schoolFromWireId,
  SCHOOLS,
  withoutSchoolPath,
  withSchoolPath,
} from "./school";

describe("school registry", () => {
  it("defaults to uOttawa", () => {
    expect(DEFAULT_SCHOOL_ID).toBe("uottawa");
  });

  it("keeps uOttawa on wire id 0 so pre-existing state blobs decode unchanged", () => {
    // proto3 scalars default to 0 when the field is absent, so this mapping is
    // what makes the `school` addition backwards compatible without a magic bump.
    expect(SCHOOL_WIRE_IDS.uottawa).toBe(0);
    // An absent field arrives as `undefined`, which is exactly the case here.
    // oxlint-disable-next-line unicorn/no-useless-undefined
    expect(schoolFromWireId(undefined)).toBe("uottawa");
    expect(schoolFromWireId(0)).toBe("uottawa");
    expect(schoolFromWireId(1)).toBe("carleton");
    expect(schoolFromWireId(99)).toBe("uottawa");
  });

  it("round-trips every school through its wire id", () => {
    for (const id of SCHOOL_IDS) {
      expect(schoolFromWireId(SCHOOL_WIRE_IDS[id])).toBe(id);
    }
  });

  it("gives uOttawa an empty path slug so its URLs are unprefixed", () => {
    expect(SCHOOLS.uottawa.pathSlug).toBe("");
    expect(SCHOOLS.uottawa.basePath).toBe("/");
    expect(SCHOOLS.carleton.pathSlug).toBe("carleton");
    expect(SCHOOLS.carleton.basePath).toBe("/carleton");
  });

  it("namespaces assets for both schools", () => {
    expect(schoolAssetId("uottawa", "catalogue.pb")).toBe("uottawa/catalogue.pb");
    expect(schoolAssetId("carleton", "schedules.202630.pb")).toBe("carleton/schedules.202630.pb");
  });

  describe("schoolFromPathname", () => {
    it.each([
      ["/", "uottawa"],
      ["/schedule", "uottawa"],
      ["/explore/course/CSI%202110", "uottawa"],
      ["/carleton", "carleton"],
      ["/carleton/", "carleton"],
      ["/carleton/schedule", "carleton"],
      ["/Carleton/schedule", "carleton"],
      ["//carleton/schedule", "carleton"],
      // A route that merely *starts* with the slug's letters is not a match.
      ["/carletonish/schedule", "uottawa"],
      ["/explore/discipline/carleton", "uottawa"],
    ])("resolves %s to %s", (pathname, expected) => {
      expect(schoolFromPathname(pathname)).toBe(expected);
    });
  });

  describe("path prefixing", () => {
    it("leaves uOttawa paths untouched", () => {
      expect(withSchoolPath("uottawa", "/schedule")).toBe("/schedule");
      expect(withSchoolPath("uottawa", "/")).toBe("/");
      expect(withoutSchoolPath("uottawa", "/schedule")).toBe("/schedule");
    });

    it("prefixes and strips Carleton paths", () => {
      expect(withSchoolPath("carleton", "/schedule")).toBe("/carleton/schedule");
      expect(withSchoolPath("carleton", "schedule")).toBe("/carleton/schedule");
      expect(withSchoolPath("carleton", "/")).toBe("/carleton");
      expect(withoutSchoolPath("carleton", "/carleton/schedule")).toBe("/schedule");
      expect(withoutSchoolPath("carleton", "/carleton")).toBe("/");
    });

    it("round-trips every app path through prefix and strip", () => {
      for (const id of SCHOOL_IDS) {
        for (const path of ["/", "/schedule", "/explore/course/CSI%202110", "/trends"]) {
          expect(withoutSchoolPath(id, withSchoolPath(id, path))).toBe(path);
        }
      }
    });
  });

  describe("getSchool", () => {
    it("falls back to the default for unknown ids", () => {
      expect(getSchool("carleton").id).toBe("carleton");
      expect(getSchool("nope").id).toBe("uottawa");
      expect(getSchool(null).id).toBe("uottawa");
      // oxlint-disable-next-line unicorn/no-useless-undefined
      expect(getSchool(undefined).id).toBe("uottawa");
    });
  });

  it("narrows school ids", () => {
    expect(isSchoolId("uottawa")).toBe(true);
    expect(isSchoolId("carleton")).toBe(true);
    expect(isSchoolId("mcgill")).toBe(false);
    expect(isSchoolId(3)).toBe(false);
  });

  it("builds catalogue deep links per school", () => {
    expect(SCHOOLS.uottawa.courseCatalogueUrl("CSI 2110")).toBe(
      "https://catalogue.uottawa.ca/search/?P=CSI%202110",
    );
    expect(SCHOOLS.carleton.courseCatalogueUrl("COMP 2401")).toBe(
      "https://calendar.carleton.ca/search/?P=COMP%202401",
    );
  });

  it("models Carleton's half-credit system", () => {
    expect(SCHOOLS.uottawa.credits.typicalCourseCredits).toBe(3);
    expect(SCHOOLS.carleton.credits.typicalCourseCredits).toBe(0.5);
    // Both schools consider five courses a normal term.
    for (const id of SCHOOL_IDS) {
      const { fullTimeTermCredits, typicalCourseCredits } = SCHOOLS[id].credits;
      expect(fullTimeTermCredits / typicalCourseCredits).toBe(5);
    }
  });

  it("disables uOttawa-only features for Carleton", () => {
    expect(SCHOOLS.carleton.features.grades).toBe(false);
    expect(SCHOOLS.carleton.features.feedback).toBe(false);
    expect(SCHOOLS.carleton.features.frenchImmersion).toBe(false);
    expect(SCHOOLS.carleton.features.officialScheduleImport).toBe(false);
    expect(SCHOOLS.carleton.features.enrolCli).toBe(false);
  });

  it("provides article forms for prose embedding in each locale", () => {
    expect(SCHOOLS.uottawa.nameWithArticleEn).toBe("the University of Ottawa");
    expect(SCHOOLS.uottawa.nameWithArticleFr).toBe("l'Université d'Ottawa");
    expect(SCHOOLS.carleton.nameWithArticleEn).toBe("Carleton University");
    expect(SCHOOLS.carleton.nameWithArticleFr).toBe("l'Université Carleton");
  });

  it("provides source labels for important-dates links", () => {
    expect(SCHOOLS.uottawa.sourceLabel).toBe("uottawa.ca");
    expect(SCHOOLS.carleton.sourceLabel).toBe("carleton.ca");
  });

  it("provides a French Immersion diploma URL for uOttawa and null for Carleton", () => {
    expect(SCHOOLS.uottawa.frenchImmersionDiplomaUrl).toBe(
      "https://www.uottawa.ca/study/immersion/french/about/diploma-requirements",
    );
    expect(SCHOOLS.carleton.frenchImmersionDiplomaUrl).toBeNull();
  });

  it("provides a transcript request URL for uOttawa and null for Carleton", () => {
    expect(SCHOOLS.uottawa.transcriptRequestUrl).toContain("uocampus.uottawa.ca");
    expect(SCHOOLS.carleton.transcriptRequestUrl).toBeNull();
  });
});
