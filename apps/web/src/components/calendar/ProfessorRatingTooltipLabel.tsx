import { Stack, Text } from "@mantine/core";

export function ProfessorRatingTooltipLabel({
  details,
}: {
  details?: Array<{
    id?: string;
    legacyId?: number;
    name: string;
    rating: number;
    numRatings: number;
  }>;
}) {
  if (!details?.length) return null;

  return (
    <Stack gap={4}>
      <Text size="xs" fw={600} c="dimmed">
        RateMyProfessors
      </Text>
      {details.map((d) => (
        <Text key={d.name} size="xs">
          {d.name} ·{" "}
          {d.numRatings > 0 ? `${d.rating.toFixed(1).replace(/\.0$/, "")}/5` : "N/A"}
          {d.numRatings > 0 ? ` (${d.numRatings} ratings)` : ""}
        </Text>
      ))}
    </Stack>
  );
}

