import { Select, Stack, Text } from '@mantine/core';
import type { Term } from 'schemas';

interface TermStepProps {
  terms: Term[];
  value: string | null;
  onChange: (termId: string) => void;
}

export function TermStep({ terms, value, onChange }: TermStepProps) {
  const data = terms.map((t) => ({ value: t.termId, label: t.name }));

  return (
    <Stack gap="md" data-tour="term-select">
      <Select
        label="Select your term"
        placeholder="Choose a term..."
        data={data}
        value={value}
        onChange={(v) => {
          if (!v) return;
          onChange(v);
        }}
        searchable
        size="md"
      />
      <Text size="sm" c="dimmed">
        Term selection changes which course sections are available for schedule generation.
      </Text>
    </Stack>
  );
}

