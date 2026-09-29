import { Checkbox } from '../components/Checkbox';
import { fieldHint } from './hints';
import type { FieldControlProps } from './types';

export function CheckField({ field, value, onChange, error, testID }: FieldControlProps) {
  return (
    <Checkbox
      testID={testID}
      label={field.def.label}
      checked={value === true}
      onChange={onChange}
      disabled={!field.editable}
      error={error}
      hint={fieldHint(field.def)}
    />
  );
}
