import { useEffect, useState } from 'react';
import { Input } from '../components/Input';
import { fieldHint } from './hints';
import type { FieldControlProps } from './types';

/** A number, null when blank, or the raw text so validation can report it. */
function toNumber(text: string): number | string | null {
  const t = text.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : text;
}

const show = (value: unknown) => (value === null || value === undefined ? '' : String(value));

export function NumberField({ field, value, onChange, error, testID }: FieldControlProps) {
  const [text, setText] = useState(show(value));
  // Follow outside changes (e.g. a reset) without overwriting in-progress text such as "1.".
  useEffect(() => {
    setText((current) => (toNumber(current) === (value ?? null) ? current : show(value)));
  }, [value]);
  return (
    <Input
      testID={testID}
      label={field.def.label}
      value={text}
      onChangeText={(next) => {
        setText(next);
        onChange(toNumber(next));
      }}
      keyboardType="numeric"
      editable={field.editable}
      error={error}
      hint={fieldHint(field.def)}
    />
  );
}
