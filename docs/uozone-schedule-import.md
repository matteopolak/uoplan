# Official uoZone Schedule Import

## What it is

The calendar can replace its generated schedule with the student's official enrolled schedule from a saved uoZone **My Class Schedule** page. The import keeps the exact course component and section, plus the official meeting times, date ranges, instructors, and locations.

## How it works

The upload action is available in both the basic and advanced calendar toolbars. Its modal asks the student to open the English **List View**, save the complete webpage, then select `SA_LEARNER_SERVICES.html` from the folder created beside the saved page. The file is read and parsed locally in the browser.

`apps/web/src/lib/importFromUoZone.ts` mirrors the table traversal used by [uo2ics](https://github.com/matteopolak/uo2ics): every `.PAGROUPDIVIDER` identifies a course, and the paired `.PSLEVEL3GRID` tables contain its enrollment status and seven-column meeting rows. The parser anchors each heading to its nearest `table.PSGROUPBOXWBO`; it does not count parent elements because browsers insert `<tbody>` wrappers into saved PeopleSoft tables. Blank section or component cells inherit the preceding row.

Each enrolled meeting must resolve to the current term's canonical `ComponentSection` using both its section code and component kind. If any meeting for a course cannot be matched exactly, that entire course is skipped instead of choosing a possibly incorrect section. Confirming the modal calls the existing store `importSchedule` action, which replaces `currentSchedule` and clears swaps.

Rows with `N/A` meeting times (for example, a research or honours-project section) still resolve and preserve their exact section with an empty `times` array. They appear in uoPlan's no-timeslot list instead of causing the whole upload to fail or being replaced with a different section.

Imported meeting rows add optional `location` and `address` values to their cloned `MeetingTime` objects. `@uoplan/calendar` copies `location` to each rendered occurrence and the event details show it. The mobile details drawer resolves the clicked occurrence by its event id, so different meeting rows cannot display one another's day or location. `@uoplan/ics` prefers the imported `address` for `LOCATION`; otherwise its existing room-code inference remains unchanged. As in uo2ics, a physical location is suffixed with `Ottawa, ON, Canada` for calendar clients.

## How to change it

- Update PeopleSoft HTML parsing or component-name aliases in `apps/web/src/lib/importFromUoZone.ts`.
- Update the upload and confirmation experience in `apps/web/src/components/calendar/UoZoneScheduleImportModal.tsx`.
- Update event display propagation in `packages/calendar/src/events.ts` and `apps/web/src/components/calendar/EventInfoSection.tsx`.
- Update ICS location behavior in `packages/ics/src/scheduleToEvents.ts`.
- Keep the synthetic saved-page fixture in `apps/web/src/lib/importFromUoZone.browser.test.ts` representative of every supported table variation.

Do not fall back to a different section when a saved section code is absent or ambiguous. Official imports are expected to preserve actual enrollment, not merely find a schedule with similar times.

## Configuration

There are no environment variables or server endpoints. Accepted files are `.html` and `.htm`; the expected file is `SA_LEARNER_SERVICES.html`. Parsing requires the English List View because the component aliases and enrollment status come from English uoZone labels. Availability is controlled by the `officialScheduleImport` school feature in `packages/domain/src/school.ts`.

## Dependencies

- Browser `DOMParser` and `File.text()` for local parsing
- `@uoplan/core` / `DataCache` for normalization and exact current-term section lookup
- `@uoplan/store` for schedule replacement
- `@uoplan/calendar` for rendered events
- `@uoplan/ics` for downloaded calendar output
- Mantine `FileButton` and modal components for the upload UI
