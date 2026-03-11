import { useState, useRef, useMemo } from 'react';
import { Select, Stack, Text, Button, Alert, Loader } from '@mantine/core';
import type { Program } from '../schemas/catalogue';
import { useAppStore } from '../store/appStore';
import {
  parseTranscriptPdf,
  findBestMatchingProgram,
} from '../lib/transcriptParser';

interface ProgramStepProps {
  programs: Program[];
  value: string | null;
  onChange: (program: Program | null) => void;
}

export function ProgramStep({ programs, value, onChange }: ProgramStepProps) {
  const { cache, completedCourses, setCompletedCourses } = useAppStore();
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [transcriptError, setTranscriptError] = useState<string | null>(null);
  const [transcriptFeedback, setTranscriptFeedback] = useState<{
    added: number;
    skippedCodes: string[];
    programMatched: Program | null;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { uniquePrograms, valueToIndex, data } = useMemo(() => {
    const seen = new Set<string>();
    const unique: Program[] = [];
    for (const p of programs) {
      if (seen.has(p.url)) continue;
      seen.add(p.url);
      unique.push(p);
    }
    const valueToIndex = new Map<string, number>();
    unique.forEach((p, i) => valueToIndex.set(p.url, i));

    const titleCount = new Map<string, number>();
    const data = unique.map((p, i) => {
      const key = `program-${i}`;
      const count = (titleCount.get(p.title) ?? 0) + 1;
      titleCount.set(p.title, count);
      const label = count > 1 ? `${p.title} (${count})` : p.title;
      return { value: key, label };
    });

    return { uniquePrograms: unique, valueToIndex, data };
  }, [programs]);

  const selectedIndex = value !== null ? valueToIndex.get(value) ?? null : null;
  const selectValue = selectedIndex !== null ? `program-${selectedIndex}` : null;

  const handleTranscriptFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !cache) return;
    setTranscriptError(null);
    setTranscriptFeedback(null);
    setTranscriptLoading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const { courses: parsedCourses, fullText } = await parseTranscriptPdf(arrayBuffer);
      const inCatalogue: string[] = [];
      const skippedCodes: string[] = [];
      for (const code of parsedCourses) {
        if (cache.getCourse(code)) {
          inCatalogue.push(code);
        } else {
          skippedCodes.push(code);
        }
      }
      const merged = [...new Set([...completedCourses, ...inCatalogue])];
      setCompletedCourses(merged);

      const programMatched = findBestMatchingProgram(fullText, uniquePrograms);
      if (programMatched) {
        onChange(programMatched);
      }
      setTranscriptFeedback({
        added: inCatalogue.length,
        skippedCodes,
        programMatched: programMatched ?? null,
      });
    } catch (err) {
      setTranscriptError(
        err instanceof Error ? err.message : 'Failed to parse transcript PDF'
      );
    } finally {
      setTranscriptLoading(false);
      e.target.value = '';
    }
  };

  return (
    <Stack gap="md">
      <Select
        data-tour="program-select"
        label="Select your program"
        placeholder="Search for your program..."
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
        nothingFoundMessage="No program found"
        size="md"
      />
      <Alert color="violet" variant="light" radius="sm">
        <Text size="sm" c="dimmed">
          Upload your unofficial transcript (PDF) to auto-fill completed courses and detect your
          program. The PDF is parsed entirely in your browser (client-side) and does not use AI.
        </Text>
      </Alert>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        onChange={handleTranscriptFile}
        disabled={transcriptLoading}
        style={{ display: 'none' }}
        aria-label="Upload transcript PDF"
      />
      <Button
        data-tour="transcript-upload"
        size="sm"
        color="violet"
        variant="filled"
        radius={0}
        onClick={() => fileInputRef.current?.click()}
        disabled={transcriptLoading}
        leftSection={transcriptLoading ? <Loader size="sm" /> : undefined}
        style={{ border: '2px solid black' }}
      >
        {transcriptLoading ? 'Parsing…' : 'Choose transcript'}
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
        Request transcript on uoZone
      </Button>
      {transcriptError && (
        <Alert color="red" variant="light" title="Upload failed">
          {transcriptError}
        </Alert>
      )}
      {transcriptFeedback && !transcriptError && (
        <Stack gap="xs">
          <Alert color="green" variant="light">
            Added {transcriptFeedback.added} course{transcriptFeedback.added !== 1 ? 's' : ''} from
            transcript.
            {transcriptFeedback.programMatched && (
              <> Program set to: {transcriptFeedback.programMatched.title}.</>
            )}
          </Alert>
          {transcriptFeedback.skippedCodes.length > 0 && (
            <Alert color="yellow" variant="light" title="Not found in catalogue">
              {transcriptFeedback.skippedCodes.length} code
              {transcriptFeedback.skippedCodes.length !== 1 ? 's' : ''} from the PDF were not found
              in the catalogue: {transcriptFeedback.skippedCodes.sort().join(', ')}
            </Alert>
          )}
        </Stack>
      )}
    </Stack>
  );
}
