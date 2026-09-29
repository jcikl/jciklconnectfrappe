import { Input } from '../components/Input';
import { fieldHint } from './hints';
import type { FieldControlProps } from './types';

export function TextField({ field, value, onChange, error, testID }: FieldControlProps) {
  const type = field.def.fieldtype;
  const text = typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value);
  return (
    <Input
      testID={testID}
      label={field.def.label}
      value={text}
      onChangeText={onChange}
      editable={field.editable}
      error={error}
      hint={fieldHint(field.def)}
      multiline={type === 'Text'}
      autoCapitalize={type === 'Data' || type === 'Text' ? 'sentences' : 'none'}
    />
  );
}
