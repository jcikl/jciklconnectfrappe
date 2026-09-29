import { useEffect, useState } from 'react';
import { Input } from '../components/Input';
import { fieldHint } from './hints';
import type { FieldControlProps } from './types';

/** A parsed JSON object, null when blank, or the raw text so validation can report it. */
function toJson(text: string): unknown {
  const t = text.trim();
  if (t === '') return null;
  try {
    const v: unknown = JSON.parse(t);
    return v !== null && typeof v === 'object' && !Array.isArray(v) ? v : text;
  } catch {
    return text;
  }
}

const show = (value: unknown) =>
  value === null || value === undefined ? '' : typeof value === 'string' ? value : JSON.stringify(value, null, 2);

export function JsonField({ field, value, onChange, error, testID }: FieldControlProps) {
  const [text, setText] = useState(show(value));
  useEffect(() => {
    setText((current) => (JSON.stringify(toJson(current)) === JSON.stringify(value ?? null) ? current : show(value)));
  }, [value]);
  return (
    <Input
      testID={testID}
      label={field.def.label}
      value={text}
      onChangeText={(next) => {
        setText(next);
        onChange(toJson(next));
      }}
      multiline
      autoCapitalize="none"
      editable={field.editable}
      error={error}
      hint={fieldHint(field.def)}
    />
  );
}
