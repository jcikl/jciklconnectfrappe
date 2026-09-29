import { Select } from '../components/Select';
import { fieldHint } from './hints';
import type { FieldControlProps } from './types';

export function SelectField({ field, value, onChange, error, testID }: FieldControlProps) {
  return (
    <Select
      testID={testID}
      label={field.def.label}
      value={typeof value === 'string' ? value : null}
      options={(field.def.options ?? []).map((o) => ({ value: o, label: o }))}
      onChange={onChange}
      allowClear={field.def.reqd !== true}
      disabled={!field.editable}
      error={error}
      hint={fieldHint(field.def)}
    />
  );
}
