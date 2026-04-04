import { useState, useRef, useMemo } from 'react';
import { Select, MultiSelect, Stack, Text, Button, Alert, Loader, Badge } from '@mantine/core';
import { tr } from "../../i18n";
import type { Program } from 'schemas';
import { useAppStore } from '../../store/appStore';
import { useShallow } from 'zustand/react/shallow';
import {
  parseTranscriptPdf,
  findBestMatchingProgram,
  isOptCourse,
} from 'schedule';
import { normalizeCourseCode } from 'schedule';

interface ProgramStepProps {
  programs: Program[];
  value: string | null;
  onChange: (program: Program | null) => void;
}

export function ProgramStep({ programs: _programs, value, onChange }: ProgramStepProps) {
  const {
    cache,
    indices,
    completedCourses,
    studentPrograms,
    availableYears,
    firstYear,
    yearCataloguePrograms,
    yearCatalogueLoading,
  } = useAppStore(
    useShallow((s) => ({
      cache: s.cache,
      indices: s.indices,
      completedCourses: s.completedCourses,
      studentPrograms: s.studentPrograms,
      availableYears: s.availableYears,
      firstYear: s.firstYear,
      yearCataloguePrograms: s.yearCataloguePrograms,
      yearCatalogueLoading: s.yearCatalogueLoading,
    })),
  );

  const setCompletedCourses = useAppStore((s) => s.setCompletedCourses);
  const setStudentPrograms = useAppStore((s) => s.setStudentPrograms);
  const minorProgram = useAppStore((s) => s.minorProgram);
  const setMinorProgram = useAppStore((s) => s.setMinorProgram);
  const setFirstYear = useAppStore((s) => s.setFirstYear);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [transcriptError, setTranscriptError] = useState<string | null>(null);
  const [transcriptFeedback, setTranscriptFeedback] = useState<{
    added: number;
    skippedCodes: string[];
    programMatched: Program | null;
    minorMatched: Program | null;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const yearSelectData = useMemo(() =>
    availableYears.map(y => ({ value: String(y), label: `${y}–${y + 1}` })),
    [availableYears],
  );

  const { uniquePrograms, minors, valueToIndex, data, minorData, minorValueToIndex } = useMemo(() => {
    const seen = new Set<string>();
    const uniquePrograms: Program[] = [];
    const minors: Program[] = [];
    
    for (const p of (yearCataloguePrograms ?? [])) {
      if (seen.has(p.url)) continue;
      seen.add(p.url);
      uniquePrograms.push(p);
      
      const t = p.title.toLowerCase();
      if (t.includes('minor in') || t.includes('advanced minor')) {
        minors.push(p);
      }
    }
    const valueToIndex = new Map<string, number>();
    uniquePrograms.forEach((p, i) => valueToIndex.set(p.url, i));
    
    const minorValueToIndex = new Map<string, number>();
    minors.forEach((p, i) => minorValueToIndex.set(p.url, i));

    const titleCount = new Map<string, number>();
    const data = uniquePrograms.map((p, i) => {
      const key = `program-${i}`;
      const count = (titleCount.get(p.title) ?? 0) + 1;
      titleCount.set(p.title, count);
      const label = count > 1 ? `${p.title} (${count})` : p.title;
      return { value: key, label };
    });
    
    const minorData = minors.map((p, i) => {
      const key = `minor-${i}`;
      return { value: key, label: p.title };
    });

    return { uniquePrograms, minors, valueToIndex, data, minorData, minorValueToIndex };
  }, [yearCataloguePrograms]);

  const indexedCodes = useMemo(() => {
    if (!indices) return null;
    return new Set(indices.courses.map(normalizeCourseCode));
  }, [indices]);

  const allDisciplineCodes = useMemo(() => {
    if (!cache) return [];
    const disciplines = new Set<string>();
    for (const course of cache.getAllCourses()) {
      const d = course.code.split(/\s+/)[0]?.toUpperCase();
      if (d) disciplines.add(d);
    }
    return [...disciplines].sort();
  }, [cache]);

  const selectedIndex = value !== null ? valueToIndex.get(value) ?? null : null;
  const selectValue = selectedIndex !== null ? `program-${selectedIndex}` : null;
  
  const minorSelectedIndex = minorProgram !== null ? minorValueToIndex.get(minorProgram.url) ?? null : null;
  const minorSelectValue = minorSelectedIndex !== null ? `minor-${minorSelectedIndex}` : null;

  const handleTranscriptFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !cache) return;
    setTranscriptError(null);
    setTranscriptFeedback(null);
    setTranscriptLoading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const { courses: parsedCourses, fullText, startingYear } = await parseTranscriptPdf(arrayBuffer);
      const inCatalogue: string[] = [];
      const skippedCodes: string[] = [];
      for (const code of parsedCourses) {
        if (isOptCourse(normalizeCourseCode(code)) || cache.getCourse(code) || indexedCodes?.has(normalizeCourseCode(code))) {
          inCatalogue.push(code);
        } else {
          skippedCodes.push(code);
        }
      }
      const merged = [...new Set([...completedCourses, ...inCatalogue])];
      setCompletedCourses(merged);

      // Set year first; setFirstYear awaits the catalogue fetch and then calls setProgram(null),
      // so we must await it before matching the program against the updated programme list.
      let programListToMatch = uniquePrograms;
      if (startingYear !== null && firstYear === null) {
        await setFirstYear(startingYear);
        const freshPrograms = useAppStore.getState().yearCataloguePrograms;
        if (freshPrograms) {
          const seen = new Set<string>();
          programListToMatch = freshPrograms.filter(p => {
            if (seen.has(p.url)) return false;
            seen.add(p.url);
            return true;
          });
        }
      }
      const { program: programMatched, minor: minorMatched } = findBestMatchingProgram(fullText, programListToMatch, minors);
      if (programMatched) {
        onChange(programMatched);
      }
      if (minorMatched) {
        setMinorProgram(minorMatched);
      }
      setTranscriptFeedback({
        added: inCatalogue.length,
        skippedCodes,
        programMatched: programMatched ?? null,
        minorMatched: minorMatched ?? null,
      });
    } catch (err) {
      console.error(err);
      setTranscriptError(
        err instanceof Error
          ? err.message
          : tr("programStep.transcript.parseFailed")
      );
    } finally {
      setTranscriptLoading(false);
      e.target.value = '';
    }
  };

  return (
    <Stack gap="md" data-tour="program-step">
      <Select
        label={tr("programStep.firstYear.label")}
        description={tr("programStep.firstYear.description")}
        placeholder={tr("programStep.firstYear.placeholder")}
        data={yearSelectData}
        value={firstYear !== null ? String(firstYear) : null}
        onChange={(v) => setFirstYear(v !== null ? Number(v) : null)}
        rightSection={yearCatalogueLoading ? <Loader size="xs" /> : undefined}
        disabled={yearCatalogueLoading}
        clearable
        size="md"
      />
      <Select
        label={tr("programStep.program.label")}
        placeholder={tr("programStep.program.placeholder")}
        data={data}
        value={selectValue}
        onChange={(v) => {
          if (v == null) {
            onChange(null);
            return;
          }
          const i = parseInt(v.replace(/^program-/, ''), 10);
          const selected = uniquePrograms[i] ?? null;
          onChange(selected);
        }}
        searchable
        clearable
        nothingFoundMessage={tr("programStep.program.notFound")}
        size="md"
      />
      {value && (
        <Select
          label="Select your minor (optional)"
          placeholder="Search for a minor program..."
          data={minorData}
          value={minorSelectValue}
          onChange={(v) => {
            if (v == null) {
              setMinorProgram(null);
              return;
            }
            const i = parseInt(v.replace(/^minor-/, ''), 10);
            const selected = minors[i] ?? null;
            setMinorProgram(selected);
          }}
          searchable
          clearable
          nothingFoundMessage={tr("programStep.program.notFound")}
          size="md"
        />
      )}
      {value && (
        <MultiSelect
          label={tr("programStep.disciplines.label")}
          description={tr("programStep.disciplines.description")}
          data={allDisciplineCodes}
          value={studentPrograms}
          onChange={setStudentPrograms}
          searchable
          size="md"
        />
      )}
      <Alert color="blue" variant="light" radius={0}>
        <Text size="sm">
          <strong>{tr("programStep.optional")}</strong>{" "}
          {tr("programStep.transcript.description")}
        </Text>
      </Alert>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        onChange={handleTranscriptFile}
        disabled={transcriptLoading}
        style={{ display: 'none' }}
        aria-label={tr("programStep.transcript.uploadAria")}
      />
      <Button
        size="sm"
        color="violet"
        variant="filled"
        radius={0}
        onClick={() => fileInputRef.current?.click()}
        disabled={transcriptLoading}
        leftSection={transcriptLoading ? <Loader size="sm" /> : undefined}
        style={{ border: '2px solid black' }}
      >
        {transcriptLoading
          ? tr("programStep.transcript.parsing")
          : tr("programStep.transcript.choose")}
      </Button>
      <Button
        component="a"
        href="https://www.uocampus.uottawa.ca/psp/csprpr9www/EMPLOYEE/SA/c/SA_LEARNER_SERVICES.SSS_TSRQST_UNOFF.GBL?languageCd=ENG"
        target="_blank"
        rel="noreferrer"
        size="sm"
        color="violet"
        variant="light"
        radius={0}
      >
        {tr("programStep.transcript.request")}
      </Button>
      {transcriptError && (
        <Alert
          color="red"
          variant="light"
          title={tr("programStep.transcript.uploadFailed")}
        >
          {transcriptError}
        </Alert>
      )}
      {transcriptFeedback && !transcriptError && (
        <Stack gap="xs">
          <Alert color="green" variant="light">
            {tr(
              "programStep.transcript.added",
              {
                count: transcriptFeedback.added,
                suffix: transcriptFeedback.added !== 1 ? "s" : "",
              },
            )}
            {transcriptFeedback.programMatched && (
              <div style={{ marginTop: '8px' }}>
                <Text size="sm">
                  {tr("programStep.transcript.programDetected")}{" "}
                  <Badge color="green" variant="light" style={{ textTransform: 'none' }}>
                    {transcriptFeedback.programMatched.title}
                  </Badge>
                  {transcriptFeedback.minorMatched && (
                    <>
                      {" "}
                      {tr("programStep.transcript.withMinor")}{" "}
                      <Badge color="green" variant="light" style={{ textTransform: 'none' }}>
                        {transcriptFeedback.minorMatched.title}
                      </Badge>
                    </>
                  )}
                </Text>
              </div>
            )}
          </Alert>
          {transcriptFeedback.skippedCodes.length > 0 && (
            <Alert
              color="yellow"
              variant="light"
              title={tr("programStep.transcript.notInCatalogue")}
            >
              <Stack gap="xs">
                <Text size="sm">
                  {tr(
                    "programStep.transcript.codesNotFound",
                    {
                      count: transcriptFeedback.skippedCodes.length,
                      suffix: transcriptFeedback.skippedCodes.length !== 1 ? "s" : "",
                      codes: transcriptFeedback.skippedCodes.sort().join(", "),
                    },
                  )}
                </Text>
                <Button
                  size="xs"
                  variant="light"
                  color="yellow"
                  onClick={() => {
                    const merged = [...new Set([...completedCourses, ...transcriptFeedback.skippedCodes])];
                    setCompletedCourses(merged);
                    setTranscriptFeedback({ ...transcriptFeedback, skippedCodes: [] });
                  }}
                >
                  {tr("programStep.transcript.addAnyway")}
                </Button>
              </Stack>
            </Alert>
          )}
        </Stack>
      )}
    </Stack>
  );
}
