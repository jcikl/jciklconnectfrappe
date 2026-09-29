import type { FieldDef, FormField, FormSection } from '@jci/core';
import { useState } from 'react';
import { Redirect } from 'expo-router';
import { DocForm, Heading, Screen, Timeline } from '@jci/ui';

const f = (def: Partial<FieldDef> & Pick<FieldDef, 'fieldname' | 'fieldtype'>, editable = true): FormField => ({
  def: { label: def.fieldname, ...def },
  key: def.fieldname,
  editable,
  rowsFixed: false,
  children: null,
});

const SECTIONS: FormSection[] = [
  {
    title: 'Organisation',
    fields: [
      f({ fieldname: 'code', label: 'Code', fieldtype: 'Data', reqd: true }, false),
      f({ fieldname: 'title', label: 'Name', fieldtype: 'Data', reqd: true }),
      f({ fieldname: 'level', label: 'Level', fieldtype: 'Select', options: ['national', 'local'], reqd: true }),
    ],
  },
  { title: null, fields: [f({ fieldname: 'currency', label: 'Currency', fieldtype: 'Data' })] },
];

export default function GalleryDocForm() {
  const [values, setValues] = useState<Record<string, unknown>>({ code: 'jci-kl', title: 'JCI Kuala Lumpur', level: 'local' });
  const [submitting, setSubmitting] = useState(false);
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <Screen>
      <Heading level={1}>DocForm</Heading>
      <DocForm
        sections={SECTIONS}
        values={values}
        errors={values.title === '' ? { title: 'Required' } : {}}
        onChange={(key, value) => setValues((prev) => ({ ...prev, [key]: value }))}
        onSubmit={() => {
          setSubmitting(true);
          setTimeout(() => setSubmitting(false), 1000);
        }}
        submitting={submitting}
        submitLabel="Save changes"
      />
      <Timeline
        items={[
          { id: 'v2', title: 'Updated by admin@jci.test', when: '29 Sep 2026, 10:00', changes: [{ label: 'Name', from: 'JCI KL', to: 'JCI Kuala Lumpur' }] },
          { id: 'v1', title: 'Created by admin@jci.test', when: '1 Sep 2026, 09:00', changes: [{ label: 'Name', from: '—', to: 'JCI KL' }] },
        ]}
      />
    </Screen>
  );
}
