import { useState, MouseEvent } from 'react';
import { Stack, MultiSelect, Text, Paper, Badge, Group, Box, Collapse, Radio } from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';
import { createCourseOptions, renderCourseOption } from './CourseSelect';
import type { ComboboxItem } from '@mantine/core';
import type { DataCache } from '../lib/dataCache';
import type {
  RemainingRequirement,
  RequirementWithStatus,
  CompletedRequirementItem,
} from '../lib/requirements';

interface RequirementsStepProps {
  cache: DataCache | null;
  remainingRequirements: RemainingRequirement[];
  requirementTreeWithStatus: RequirementWithStatus[];
  completedRequirementsList: CompletedRequirementItem[];
  completedCourses: string[];
  selectedPerRequirement: Record<string, string[]>;
  onSelect: (requirementId: string, courses: string[]) => void;
  selectedOptionsPerRequirement: Record<string, number>;
  onSelectOption: (requirementId: string, optionIndex: number) => void;
}

function getSelectedCredits(cache: DataCache | null, courseCodes: string[]): number {
  if (!cache) return 0;
  return courseCodes.reduce(
    (sum, code) => sum + (cache.getCourse(code)?.credits ?? 3),
    0
  );
}

interface RequirementNodeProps {
  node: RequirementWithStatus;
  cache: DataCache | null;
  completedCourses: Set<string>;
  selectedPerRequirement: Record<string, string[]>;
  onSelect: (requirementId: string, courses: string[]) => void;
  selectedOptionsPerRequirement: Record<string, number>;
  onSelectOption: (requirementId: string, optionIndex: number) => void;
  activeBranch: boolean;
  depth?: number;
}

function RequirementNode({
  node,
  cache,
  completedCourses,
  selectedPerRequirement,
  onSelect,
  selectedOptionsPerRequirement,
  onSelectOption,
  activeBranch,
  depth = 0,
}: RequirementNodeProps) {
  const hasOptions = node.options && node.options.length > 0;
  const rawTitle = (node.title ?? '').trim();
  const title = rawTitle || node.code || `${node.type} requirement`;
  const isOrGroup = node.type === 'or_group';
  const isOptionsGroup = node.type === 'options_group';
  const isAnd = node.type === 'and';
  const isSection = node.type === 'section';

  const creditsNeeded = node.creditsNeeded ?? 0;
  const hasNiceTitle = rawTitle.length > 0;
  const hasCode = !!node.code;
  const hasCreditsInfo = creditsNeeded > 0;
  const hasSatisfiedInfo = node.complete && node.satisfiedBy.length > 0;
  const hasSummary = hasNiceTitle || hasCode || hasCreditsInfo || hasSatisfiedInfo;

  const [opened, setOpened] = useState(() => !hasSummary);

  const toggleLocal = (e: MouseEvent) => {
    e.stopPropagation();
    if (!hasOptions) return;
    setOpened((o) => !o);
  };

  if (isSection) {
    return (
      <Text key={title} fw={600} size="sm" c="dimmed" mt={depth > 0 ? 'md' : 0} mb="xs">
        {title}
      </Text>
    );
  }

  const showAsComplete = node.complete && node.satisfiedBy.length > 0;
  const hasRequirementId = node.requirementId != null;
  const available =
    node.candidateCourses?.filter((c) => !completedCourses.has(c)) ?? [];
  const options = createCourseOptions(available, cache);
  const availableSet = new Set(available);
  const selected = (node.requirementId
    ? (selectedPerRequirement[node.requirementId] ?? [])
    : []
  ).filter((c) => availableSet.has(c));
  const selectedCredits = getSelectedCredits(cache, selected);
  const creditsRemaining = Math.max(0, creditsNeeded - selectedCredits);

  const multiSelectBlock =
    hasRequirementId && !showAsComplete ? (
      <Stack gap="xs" mt="xs">
        {node.satisfiedBy.length > 0 && (
          <Text size="xs" c="dimmed">
            Satisfied by completed: {node.satisfiedBy.sort().join(', ')}
          </Text>
        )}
        {creditsNeeded > 0 && (
          <Text size="xs" c="dimmed">
            {selectedCredits > 0
              ? `${selectedCredits} of ${creditsNeeded} credits selected — pick ${Math.ceil(creditsRemaining / 3)} more course${Math.ceil(creditsRemaining / 3) !== 1 ? 's' : ''}`
              : `Select course(s) to fulfill this requirement (${creditsNeeded} credit${creditsNeeded !== 1 ? 's' : ''} total).`}
          </Text>
        )}
        <MultiSelect
          label="Courses for this requirement"
          placeholder="Search by course code or title..."
          data={options}
          value={selected}
          onChange={(courses) => onSelect(node.requirementId!, courses)}
          onClick={(e) => e.stopPropagation()}
          searchable
          clearable
          renderOption={renderCourseOption(cache)}
          filter={({ options: opts, search }) => {
            const q = search.toLowerCase().trim();
            if (!q) return opts;
            return (opts as ComboboxItem[]).filter(
              (o) =>
                o.value.toLowerCase().includes(q) ||
                o.label.toLowerCase().includes(q)
            );
          }}
          nothingFoundMessage="No courses found"
        />
      </Stack>
    ) : null;

  if (showAsComplete && !hasOptions) {
    return (
      <Box key={title} pl={depth > 0 ? 'md' : 0} mt="xs">
        <Group gap="xs" wrap="nowrap" align="center">
          <Text size="sm" c="dimmed" lineClamp={1} style={{ flex: 1 }}>
            {title}
          </Text>
          <Text size="xs" c="dimmed">
            {node.satisfiedBy.sort().join(', ')}
          </Text>
          <Badge color="green" variant="light" size="sm">
            Complete
          </Badge>
        </Group>
      </Box>
    );
  }

  if (isOrGroup && hasOptions) {
    const selectedOptionIndex =
      node.requirementId != null ? selectedOptionsPerRequirement[node.requirementId] : undefined;
    const showError =
      activeBranch && node.requirementId != null && selectedOptionIndex == null && !node.complete;

    const useGenericLabel =
      rawTitle === '' || rawTitle.toLowerCase() === 'or';
    const groupLabel = useGenericLabel
      ? 'One of the following must be completed'
      : title;
    return (
      <Paper
        key={groupLabel}
        p="sm"
        withBorder
        radius={0}
        mt="sm"
        style={{
          paddingLeft: depth * 16 + 12,
          backgroundColor: opened ? 'var(--mantine-color-dark-6)' : 'var(--mantine-color-dark-8)',
        }}
      >
        <Group
          justify="space-between"
          align="center"
          mb="xs"
          onClick={toggleLocal}
          style={{ cursor: 'pointer' }}
        >
          <Group gap="xs" align="center">
            <IconChevronDown
              size={14}
              style={{
                transform: opened ? 'rotate(0deg)' : 'rotate(-90deg)',
                transition: 'transform 150ms ease',
              }}
            />
            <Text fw={600} size="sm">
              {groupLabel}
            </Text>
          </Group>
          {node.complete && node.satisfiedOptionIndex != null && (
            <Badge color="green" variant="light" size="sm">
              Complete
            </Badge>
          )}
        </Group>
        {showError && (
          <Text size="xs" c="red" mt={4}>
            Select exactly one option in this group.
          </Text>
        )}
        {node.complete && node.satisfiedOptionIndex != null && (
          <Text size="xs" c="dimmed" mb="xs">
            Satisfied by: {node.satisfiedBy.join(', ')}
          </Text>
        )}
        <Collapse in={opened}>
          <Stack gap="xs">
            {node.options!.map((opt, idx) => {
              const optTitle = opt.title ?? opt.code ?? `Option ${idx + 1}`;
              const isSatisfiedOption =
                node.satisfiedOptionIndex === idx && opt.complete;
              const isSelected = selectedOptionIndex === idx;
              const childActiveBranch =
                activeBranch &&
                (!node.requirementId ||
                  selectedOptionIndex == null ||
                  selectedOptionIndex === idx);
              return (
                <Box key={idx}>
                  <Group gap="xs" align="center" wrap="nowrap">
                    {node.requirementId != null && !node.complete && (
                      <Radio
                        checked={isSelected}
                        onChange={() => onSelectOption(node.requirementId!, idx)}
                        name={node.requirementId}
                        value={String(idx)}
                      />
                    )}
                    <Text size="sm" fw={500}>
                      {optTitle}
                    </Text>
                    {isSatisfiedOption && opt.satisfiedBy.length > 0 && (
                      <Badge color="green" variant="light" size="sm">
                        Satisfied by: {opt.satisfiedBy.join(', ')}
                      </Badge>
                    )}
                  </Group>
                  {opt.requirementId != null && (
                    <Box mt="xs" pl="sm">
                      <RequirementNode
                        node={opt}
                        cache={cache}
                        completedCourses={completedCourses}
                        selectedPerRequirement={selectedPerRequirement}
                        onSelect={onSelect}
                        selectedOptionsPerRequirement={selectedOptionsPerRequirement}
                        onSelectOption={onSelectOption}
                        activeBranch={childActiveBranch}
                        depth={depth + 1}
                      />
                    </Box>
                  )}
                  {opt.options && opt.options.length > 0 && !opt.requirementId && (
                    <Box pl="sm" mt="xs">
                      {opt.options.map((child, j) => (
                        <RequirementNode
                          key={j}
                          node={child}
                          cache={cache}
                          completedCourses={completedCourses}
                          selectedPerRequirement={selectedPerRequirement}
                          onSelect={onSelect}
                          selectedOptionsPerRequirement={selectedOptionsPerRequirement}
                          onSelectOption={onSelectOption}
                          activeBranch={childActiveBranch}
                          depth={depth + 1}
                        />
                      ))}
                    </Box>
                  )}
                </Box>
              );
            })}
          </Stack>
          {multiSelectBlock}
        </Collapse>
      </Paper>
    );
  }

  if (isOptionsGroup && hasOptions) {
    const selectedOptionIndex =
      node.requirementId != null ? selectedOptionsPerRequirement[node.requirementId] : undefined;
    const showError =
      activeBranch && node.requirementId != null && selectedOptionIndex == null && !node.complete;

    return (
      <Paper
        key={title}
        p="sm"
        withBorder
        radius={0}
        mt="sm"
        style={{
          paddingLeft: depth * 16 + 12,
          backgroundColor: opened ? 'var(--mantine-color-dark-6)' : 'var(--mantine-color-dark-8)',
        }}
      >
        <Group
          justify="space-between"
          align="center"
          mb="xs"
          onClick={toggleLocal}
          style={{ cursor: 'pointer' }}
        >
          <Group gap="xs" align="center">
            <IconChevronDown
              size={14}
              style={{
                transform: opened ? 'rotate(0deg)' : 'rotate(-90deg)',
                transition: 'transform 150ms ease',
              }}
            />
            <Text fw={600} size="sm">
              {title}
            </Text>
          </Group>
          {node.complete && (
            <Badge color="green" variant="light" size="sm">
              Complete
            </Badge>
          )}
        </Group>
        {showError && (
          <Text size="xs" c="red" mt={4}>
            Select exactly one option in this group.
          </Text>
        )}
        {node.complete && node.satisfiedOptionIndex != null && (
          <Text size="xs" c="dimmed" mb="xs">
            Satisfied by option: {node.satisfiedBy.join(', ')}
          </Text>
        )}
        <Collapse in={opened}>
          <Stack gap="md">
            {node.options!.map((opt, idx) => {
              const isSelected =
                node.requirementId != null &&
                selectedOptionsPerRequirement[node.requirementId] === idx;
              const childActiveBranch =
                activeBranch &&
                (!node.requirementId ||
                  selectedOptionIndex == null ||
                  selectedOptionIndex === idx);
              return (
                <Box key={idx}>
                  <Group gap="xs" align="center">
                    {node.requirementId != null && !node.complete && (
                      <Radio
                        checked={isSelected}
                        onChange={() => onSelectOption(node.requirementId!, idx)}
                        name={node.requirementId}
                        value={String(idx)}
                      />
                    )}
                    <Text size="sm" fw={500}>
                      {opt.title ?? opt.code ?? `Option ${idx + 1}`}
                    </Text>
                  </Group>
                  <Box mt="xs" pl="sm">
                    <RequirementNode
                      node={opt}
                      cache={cache}
                      completedCourses={completedCourses}
                      selectedPerRequirement={selectedPerRequirement}
                      onSelect={onSelect}
                      selectedOptionsPerRequirement={selectedOptionsPerRequirement}
                      onSelectOption={onSelectOption}
                      activeBranch={childActiveBranch}
                      depth={depth + 1}
                    />
                  </Box>
                </Box>
              );
            })}
          </Stack>
        </Collapse>
      </Paper>
    );
  }

  if (isAnd && hasOptions) {
    return (
      <Paper
        key={title}
        p="sm"
        withBorder
        radius={0}
        mt="sm"
        style={{
          paddingLeft: depth * 16 + 12,
          backgroundColor: opened ? 'var(--mantine-color-dark-6)' : 'var(--mantine-color-dark-8)',
        }}
      >
        {title && (
          <Group
            justify="space-between"
            align="center"
            mb="xs"
            onClick={toggleLocal}
            style={{ cursor: 'pointer' }}
          >
            <Group gap="xs" align="center">
              <IconChevronDown
                size={14}
                style={{
                  transform: opened ? 'rotate(0deg)' : 'rotate(-90deg)',
                  transition: 'transform 150ms ease',
                }}
              />
              <Text fw={600} size="sm">
                {title}
              </Text>
            </Group>
            {node.complete && (
              <Badge color="green" variant="light" size="sm">
                Complete
              </Badge>
            )}
          </Group>
        )}
        <Collapse in={opened}>
          <Stack gap="xs">
            {node.options!.map((child, idx) => (
              <RequirementNode
                key={idx}
                node={child}
                cache={cache}
                completedCourses={completedCourses}
                selectedPerRequirement={selectedPerRequirement}
                onSelect={onSelect}
                selectedOptionsPerRequirement={selectedOptionsPerRequirement}
                onSelectOption={onSelectOption}
                activeBranch={activeBranch}
                depth={depth + 1}
              />
            ))}
          </Stack>
        </Collapse>
      </Paper>
    );
  }

  const label =
    creditsNeeded > 0 && !showAsComplete
      ? `${title} (${creditsNeeded} credit${creditsNeeded !== 1 ? 's' : ''})`
      : title;

  return (
    <Paper
      key={label}
      p="md"
      withBorder
      radius={0}
      mt="sm"
      style={{
        paddingLeft: depth * 16 + 12,
        backgroundColor: hasOptions
          ? opened
            ? 'var(--mantine-color-dark-6)'
            : 'var(--mantine-color-dark-8)'
          : 'var(--mantine-color-dark-7)',
      }}
    >
      <Stack gap="sm">
        <Group
          justify="space-between"
          wrap="nowrap"
          align="flex-start"
          onClick={hasOptions ? toggleLocal : undefined}
          style={hasOptions ? { cursor: 'pointer' } : undefined}
        >
          <Group gap="xs" align="flex-start">
            {hasOptions && (
              <IconChevronDown
                size={16}
                style={{
                  marginTop: 2,
                  transform: opened ? 'rotate(0deg)' : 'rotate(-90deg)',
                  transition: 'transform 150ms ease',
                }}
              />
            )}
            <Text fw={600} size="md" lineClamp={2}>
              {label}
            </Text>
          </Group>
          {showAsComplete ? (
            <Badge color="green" variant="light" size="sm">
              Complete
            </Badge>
          ) : hasRequirementId && creditsNeeded > 0 ? (
            <Badge color="blue" variant="light" size="sm">
              {creditsRemaining} credit{creditsRemaining !== 1 ? 's' : ''} needed
            </Badge>
          ) : null}
        </Group>
        {multiSelectBlock}
        {hasOptions && (node.type === 'pick' || node.type === 'group') && (
          <Collapse in={opened}>
            <Stack gap="xs" pl="sm">
              {node.options!.map((child, idx) => (
                <RequirementNode
                  key={idx}
                  node={child}
                  cache={cache}
                  completedCourses={completedCourses}
                  selectedPerRequirement={selectedPerRequirement}
                  onSelect={onSelect}
                  selectedOptionsPerRequirement={selectedOptionsPerRequirement}
                  onSelectOption={onSelectOption}
                  activeBranch={activeBranch}
                  depth={depth + 1}
                />
              ))}
            </Stack>
          </Collapse>
        )}
      </Stack>
    </Paper>
  );
}

export function RequirementsStep({
  cache,
  remainingRequirements,
  requirementTreeWithStatus,
  completedRequirementsList,
  completedCourses,
  selectedPerRequirement,
  onSelect,
  selectedOptionsPerRequirement,
  onSelectOption,
}: RequirementsStepProps) {
  const [completedOpen, setCompletedOpen] = useState(false);
  const completedSet = new Set(completedCourses);
  const hasTree = requirementTreeWithStatus.length > 0;
  const incompleteNodes = requirementTreeWithStatus.filter((node) => !node.complete);
  const hasRemaining = incompleteNodes.length > 0;
  const hasCompleted = completedRequirementsList.length > 0;
  const totalRequirements = completedRequirementsList.length + remainingRequirements.length;

  if (!hasTree) {
    return (
      <Text c="dimmed">
        Select a program and complete the previous steps to see requirements.
      </Text>
    );
  }

  return (
    <Stack gap="lg">
      <Text size="sm" c="dimmed">
        For each requirement below, select the courses you want this semester.
        Requirements with only one option are pre-selected. Expand options in
        &quot;or&quot; blocks to see which part your selection satisfies.
      </Text>

      <Stack gap="md">
        {hasRemaining ? (
          incompleteNodes.map((node, idx) => (
            <RequirementNode
              key={idx}
              node={node}
              cache={cache}
              completedCourses={completedSet}
              selectedPerRequirement={selectedPerRequirement}
              onSelect={onSelect}
              selectedOptionsPerRequirement={selectedOptionsPerRequirement}
              onSelectOption={onSelectOption}
              activeBranch
            />
          ))
        ) : (
          <Text size="sm" c="dimmed">
            All requirements are currently satisfied by your completed courses.
          </Text>
        )}
      </Stack>

      {hasCompleted && (
        <Paper
          p="sm"
          withBorder
          radius={0}
          style={{
            backgroundColor: completedOpen ? 'var(--mantine-color-dark-6)' : 'var(--mantine-color-dark-8)',
            cursor: 'pointer',
          }}
          onClick={(e: MouseEvent) => {
            e.stopPropagation();
            setCompletedOpen((o) => !o);
          }}
        >
          <Group justify="space-between" align="center" mb={completedOpen ? 'sm' : 0}>
            <Group gap="xs" align="center">
              <IconChevronDown
                size={14}
                style={{
                  transform: completedOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                  transition: 'transform 150ms ease',
                }}
              />
              <Text fw={600} size="sm">
                {completedRequirementsList.length}/{totalRequirements || '—'} completed requirements
              </Text>
            </Group>
            <Badge size="sm" variant="light" color="green">
              {completedOpen ? 'Hide details' : 'Show details'}
            </Badge>
          </Group>
          <Collapse in={completedOpen}>
            <Stack gap={0} mt="sm">
              {completedRequirementsList.map((item, idx) => (
                <Box
                  key={idx}
                  px="sm"
                  py={8}
                  style={{
                    backgroundColor:
                      idx % 2 === 0
                        ? 'var(--mantine-color-dark-6)'
                        : 'var(--mantine-color-dark-7)',
                    borderTop:
                      idx === 0 ? '1px solid var(--mantine-color-dark-4)' : 'none',
                    borderBottom: '1px solid var(--mantine-color-dark-4)',
                  }}
                >
                  <Group justify="space-between" wrap="nowrap" align="center">
                    <Text size="sm" lineClamp={2} style={{ flex: 1 }}>
                      {item.title}
                    </Text>
                    <Group gap="xs" wrap="nowrap" align="center">
                      <Text size="xs" c="dimmed">
                        {item.satisfiedBy.sort().join(', ')}
                      </Text>
                      <Badge color="green" variant="light" size="sm">
                        Complete
                      </Badge>
                    </Group>
                  </Group>
                </Box>
              ))}
            </Stack>
          </Collapse>
        </Paper>
      )}

      {hasTree && !hasRemaining && !hasCompleted && (
        <Text c="dimmed" size="sm">
          No remaining requirements. You may have completed all courses for your
          program.
        </Text>
      )}
    </Stack>
  );
}
