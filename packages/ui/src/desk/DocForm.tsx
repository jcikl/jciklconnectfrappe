import type { FormSection, FormValues } from '@jci/core';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { FieldControl } from '../fields/FieldControl';
import type { RenderField } from '../fields/types';
import { Stack } from '../primitives/Stack';
import { Text } from '../primitives/Text';

export interface DocFormProps {
  /** Sections to show, already filtered for dependsOn visibility. */
  sections: readonly FormSection[];
  values: FormValues;
  errors?: Readonly<Record<string, string>>;
  formError?: string | null;
  onChange: (key: string, value: unknown) => void;
  /** Omit for a read-only form: no submit button. */
  onSubmit?: () => void;
  submitLabel?: string;
  submitting?: boolean;
  renderField?: RenderField;
  testID?: string;
}

/** A DocType form: one card per section, a control per field, then the form error and submit button. */
export function DocForm({
  sections,
  values,
  errors,
  formError,
  onChange,
  onSubmit,
  submitLabel = 'Save',
  submitting = false,
  renderField,
  testID,
}: DocFormProps) {
  return (
    <Stack gap="md" testID={testID}>
      {sections.map((section, index) => (
        <Card key={section.title ?? `section-${index}`} title={section.title ?? undefined}>
          {section.fields.map((field) => (
            <FieldControl
              key={field.key}
              field={field}
              value={values[field.key] ?? null}
              onChange={(value) => onChange(field.key, value)}
              error={errors?.[field.key]}
              renderField={renderField}
            />
          ))}
        </Card>
      ))}
      {formError ? (
        <Text tone="danger" accessibilityLiveRegion="polite">
          {formError}
        </Text>
      ) : null}
      {onSubmit ? <Button label={submitLabel} onPress={onSubmit} loading={submitting} /> : null}
    </Stack>
  );
}
