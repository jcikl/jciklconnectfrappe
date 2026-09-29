import { View } from 'react-native';
import { Button } from '../components/Button';
import { FieldMessage } from '../components/FieldMessage';
import { Box } from '../primitives/Box';
import { Stack } from '../primitives/Stack';
import { Text } from '../primitives/Text';
import { FieldControl } from './FieldControl';
import type { FieldControlProps } from './types';

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Edits a Table field. Every change emits the whole array, in order (the API compares rows by position). */
export function ChildTable({ field, value, onChange, error, renderField, testID }: FieldControlProps) {
  const rows = Array.isArray(value) ? value.map((r) => (isRecord(r) ? r : {})) : [];
  const columns = field.children ?? [];
  const setCell = (index: number, key: string, cell: unknown) => onChange(rows.map((row, i) => (i === index ? { ...row, [key]: cell } : row)));
  // An append-only table (rowsFixed) may gain rows but never lose them.
  const canRemove = field.editable && !field.rowsFixed;

  return (
    <View testID={testID ?? `field-${field.key}`} className="gap-2">
      <Text variant="label">{field.def.label}</Text>
      {rows.length === 0 ? (
        <Text variant="caption" tone="muted">
          No rows
        </Text>
      ) : null}
      {rows.map((row, index) => (
        <Box key={index} padding="md" rounded bordered>
          <Stack gap="sm">
            <Stack direction="row" justify="between" align="center">
              <Text variant="label">{`Row ${index + 1}`}</Text>
              {canRemove ? (
                <Button label={`Remove row ${index + 1}`} variant="ghost" size="sm" onPress={() => onChange(rows.filter((_, i) => i !== index))} />
              ) : null}
            </Stack>
            {columns.map((col) => (
              <FieldControl
                key={col.key}
                testID={`field-${field.key}-${index}-${col.key}`}
                field={col}
                value={row[col.key] ?? null}
                onChange={(cell) => setCell(index, col.key, cell)}
                renderField={renderField}
              />
            ))}
          </Stack>
        </Box>
      ))}
      {field.editable ? <Button label="Add row" variant="secondary" size="sm" onPress={() => onChange([...rows, {}])} /> : null}
      <FieldMessage error={error} />
    </View>
  );
}
