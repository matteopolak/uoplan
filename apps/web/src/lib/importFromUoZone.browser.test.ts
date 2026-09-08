import { describe, expect, it } from "vitest";
import { buildDataCache, buildScheduleIcs, normalizeCourseCode } from "@uoplan/core";
import type { Catalogue, ComponentSection, SchedulesData } from "@uoplan/core";
import { scheduleToEvents } from "@uoplan/calendar";
import { parseUoZoneScheduleHtml, resolveUoZoneSchedule } from "./importFromUoZone";

function cells(values: string[]): string {
  return values.map((value) => `<td><span>${value || "&nbsp;"}</span></td>`).join("");
}

const SAVED_PAGE = `
  <!doctype html>
  <html><body>
    <table class="PSGROUPBOXWBO"><tbody>
      <tr><td class="PAGROUPDIVIDER">CSI 2132 - Databases I</td></tr>
      <tr><td>
      <table class="PSLEVEL3GRID"><tbody><tr>${cells(["Enrolled"])}</tr></tbody></table>
      <table class="PSLEVEL3GRID"><tbody><tr>${cells([
        "1234",
        "A00",
        "Lecture",
        "Mo 10:00AM - 11:20AM",
        "550 Cumberland (TBT) 333",
        "Ada Lovelace",
        "01/12/2026 - 04/10/2026",
        "1234",
        "",
        "",
        "We 10:00AM - 11:20AM",
        "550 Cumberland (TBT) 333",
        "Ada Lovelace",
        "01/12/2026 - 04/10/2026",
      ])}</tr></tbody></table>
      </td></tr>
    </tbody></table>
    <table class="PSGROUPBOXWBO"><tbody>
      <tr><td class="PAGROUPDIVIDER">MAT 1341 - Introduction to Linear Algebra</td></tr>
      <tr><td>
      <table class="PSLEVEL3GRID"><tbody><tr>${cells(["Waiting"])}</tr></tbody></table>
      <table class="PSLEVEL3GRID"><tbody><tr>${cells([
        "5678",
        "B00",
        "Lecture",
        "Tu 1:00PM - 2:20PM",
        "Virtual",
        "Grace Hopper",
        "01/12/2026 - 04/10/2026",
      ])}</tr></tbody></table>
      </td></tr>
    </tbody></table>
    <table class="PSGROUPBOXWBO"><tbody>
      <tr><td class="PAGROUPDIVIDER">CSI 4900 - Honours Project</td></tr>
      <tr><td>
      <table class="PSLEVEL3GRID"><tbody><tr>${cells(["Enrolled"])}</tr></tbody></table>
      <table class="PSLEVEL3GRID"><tbody><tr>${cells([
        "9012",
        "F00",
        "Research",
        "N/A",
        "N/A",
        "Grace Hopper",
        "01/12/2026 - 04/10/2026",
      ])}</tr></tbody></table>
      </td></tr>
    </tbody></table>
  </body></html>`;

function section(code: string, component = "LEC"): ComponentSection {
  return {
    section: `${code}-${component}`,
    sectionCode: code,
    component,
    session: null,
    status: null,
    times: [
      {
        day: "Fr",
        startMinutes: 480,
        endMinutes: 540,
        virtual: false,
        instructor: null,
        meetingDates: null,
      },
    ],
  };
}

function cache() {
  const catalogue: Catalogue = {
    programs: [],
    courses: [
      {
        code: normalizeCourseCode("CSI 2132"),
        title: "Databases I",
        credits: 3,
        description: "",
      },
      {
        code: normalizeCourseCode("CSI 4900"),
        title: "Honours Project",
        credits: 3,
        description: "",
      },
    ],
  };
  const schedules: SchedulesData = {
    termId: "2261",
    schedules: [
      {
        subject: "CSI",
        catalogNumber: "2132",
        courseCode: normalizeCourseCode("CSI 2132"),
        title: "Databases I",
        timeZone: "America/Toronto",
        components: { LEC: [section("A00"), section("B00")] },
      },
      {
        subject: "CSI",
        catalogNumber: "4900",
        courseCode: normalizeCourseCode("CSI 4900"),
        title: "Honours Project",
        timeZone: "America/Toronto",
        components: { REC: [section("F00", "REC")] },
      },
    ],
  };
  return buildDataCache(catalogue, schedules);
}

describe("official uoZone schedule import", () => {
  it("parses the saved List View, selects the exact section, and keeps locations per meeting", () => {
    const parsed = parseUoZoneScheduleHtml(SAVED_PAGE);
    expect(parsed).toHaveLength(3);
    expect(parsed[0].meetings).toMatchObject([
      {
        sectionCode: "A00",
        component: "Lecture",
        day: "Mo",
        startMinutes: 600,
        endMinutes: 680,
        location: "550 Cumberland (TBT) 333",
        address: "550 Cumberland, Ottawa, ON, Canada",
        meetingDates: ["2026-01-12", "2026-04-10"],
      },
      { sectionCode: "A00", component: "Lecture", day: "We" },
    ]);
    expect(parsed[2].meetings).toMatchObject([
      {
        sectionCode: "F00",
        component: "Research",
        day: null,
        startMinutes: null,
        endMinutes: null,
        location: null,
      },
    ]);

    const resolved = resolveUoZoneSchedule(parsed, cache());
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;

    expect(resolved.skippedCount).toBe(1);
    expect(resolved.schedule.enrollments).toHaveLength(2);
    const lecture = resolved.schedule.enrollments[0].sectionCombo.LEC.section;
    expect(lecture.sectionCode).toBe("A00");
    expect(lecture.times.map((time) => time.day)).toEqual(["Mo", "We"]);
    expect(lecture.times[0].location).toBe("550 Cumberland (TBT) 333");
    expect(resolved.schedule.enrollments[1].sectionCombo.REC.section.sectionCode).toBe("F00");
    expect(resolved.schedule.enrollments[1].times).toEqual([]);

    const calendarEvents = scheduleToEvents(resolved.schedule, null);
    expect(calendarEvents[0].location).toBe("550 Cumberland (TBT) 333");

    const ics = buildScheduleIcs({
      schedule: resolved.schedule,
      cache: cache(),
      startDate: "2026-01-12",
      endDate: "2026-04-10",
    });
    expect(ics).toContain("LOCATION:550 Cumberland\\, Ottawa\\, ON\\, Canada");
  });

  it("rejects a same-course section that is absent from the selected term", () => {
    const parsed = parseUoZoneScheduleHtml(SAVED_PAGE);
    parsed[0].meetings = parsed[0].meetings.map((meeting) => ({
      ...meeting,
      sectionCode: "Z99",
    }));
    const resolved = resolveUoZoneSchedule([parsed[0]], cache());
    expect(resolved).toEqual({
      ok: false,
      reason: "no-matches",
      warnings: ["CSI 2132"],
    });
  });
});
