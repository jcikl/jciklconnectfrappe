import type { FieldDef, FormField } from '@jci/core';
import { useState } from 'react';
import { Redirect } from 'expo-router';
import { Card, FieldControl, Heading, Screen } from '@jci/ui';

const f = (def: Partial<FieldDef> & Pick<FieldDef, 'fieldname' | 'fieldtype'>, extra: Partial<FormField> = {}): FormField => ({
  def: { label: def.fieldname, ...def },
  key: def.fieldname,
  editable: true,
  rowsFixed: false,
  children: null,
  ...extra,
});

const FIELDS: FormField[] = [
  f({ fieldname: 'title', label: 'Name (Data, required)', fieldtype: 'Data', reqd: true }),
  f({ fieldname: 'notes', label: 'Notes (Text)', fieldtype: 'Text' }),
  f({ fieldname: 'members', label: 'Members (Int)', fieldtype: 'Int' }),
  f({ fieldname: 'dues', label: 'Dues (Currency)', fieldtype: 'Currency' }),
  f({ fieldname: 'founded', label: 'Founded (Date)', fieldtype: 'Date' }),
  f({ fieldname: 'active', label: 'Active (Check)', fieldtype: 'Check' }),
  f({ fieldname: 'level', label: 'Level (Select)', fieldtype: 'Select', options: ['national', 'local'] }),
  f({ fieldname: 'parent', label: 'Parent (Link, no picker)', fieldtype: 'Link', link: 'Organization' }),
  f({ fieldname: 'extra', label: 'Extra (JSON)', fieldtype: 'JSON' }),
  f({ fieldname: 'code', label: 'Code (locked)', fieldtype: 'Data' }, { editable: false }),
  f(
    { fieldname: 'history', label: 'History (Table)', fieldtype: 'Table', childDocType: 'Row' },
    {
      children: [
        f({ fieldname: 'year', label: 'Year', fieldtype: 'Int', reqd: true }),
        f({ fieldname: 'note', label: 'Note', fieldtype: 'Data' }),
      ],
    },
  ),
];

export default function GalleryFields() {
  const [values, setValues] = useState<Record<string, unknown>>({ code: 'jci-kl', history: [{ year: 2025, note: 'Joined' }] });
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <Screen>
      <Heading level={1}>Field controls</Heading>
      <Card title="One control per field type">
        {FIELDS.map((field) => (
          <FieldControl
            key={field.key}
            field={field}
            value={values[field.key] ?? null}
            onChange={(v) => setValues((prev) => ({ ...prev, [field.key]: v }))}
            error={field.key === 'members' && typeof values.members === 'string' ? 'Enter a whole number' : undefined}
          />
        ))}
      </Card>
    </Screen>
  );
}
