import { Alert, Select, Stack, Text } from '@mantine/core';
import type { Term } from 'schemas';
import { tr } from '../../i18n';

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
        label={tr("termStep.label")}
        placeholder={tr("termStep.placeholder")}
        data={data}
        value={value}
        onChange={(v) => {
          if (!v) return;
          onChange(v);
        }}
        searchable
        size="md"
      />
      <Alert color="blue" variant="light" radius={0}>
        <Text size="sm">
          {tr("termStep.note", )}
        </Text>
      </Alert>
    </Stack>
  );
}

