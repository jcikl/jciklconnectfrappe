import { isCapped, timelineEntries, VERSIONS_LIMIT, type QueryDoc } from '@jci/client';
import { useVersions } from '@jci/client/react';
import { docTypeLabel, filtersForDoc, type DocTypeMeta, type FormField } from '@jci/core';
import { DocForm, EmptyState, ErrorState, Heading, Page, Spinner, Stack, Text, Timeline } from '@jci/ui';
import { useDesk } from './DeskContext';
import { docTitle } from './docTypes';
import { renderDeskField } from './LinkField';
import { useDocForm } from './useDocForm';

const ACTION: Readonly<Record<string, string>> = { create: 'Created', update: 'Updated', delete: 'Deleted' };

export function DocFormScreen({ meta, id }: { meta: DocTypeMeta; id: string | null }) {
  const form = useDocForm(meta, id);
  const label = docTypeLabel(meta);

  if (form.status === 'loading') {
    return (
      <Page>
        <Spinner label={`Loading ${label}`} />
      </Page>
    );
  }
  if (form.status === 'unavailable') {
    return (
      <Page>
        <EmptyState title={form.title} description={form.message} />
      </Page>
    );
  }

  return (
    <Page>
      <Heading level={1}>{form.isNew ? `New ${label}` : form.stored ? docTitle(meta, form.stored) : label}</Heading>
      {!form.submit ? <Text tone="muted">{`You can view this ${label} but not change it.`}</Text> : null}
      <DocForm
        sections={form.sections}
        values={form.values}
        errors={form.errors.fields}
        formError={form.errors.form}
        onChange={form.setValue}
        onSubmit={form.submit}
        submitLabel={form.isNew ? `Create ${label}` : 'Save changes'}
        submitting={form.submitting}
        renderField={renderDeskField}
      />
      {form.stored && meta.trackChanges ? <DocTimeline meta={meta} stored={form.stored} fields={form.fields} /> : null}
    </Page>
  );
}

function DocTimeline({ meta, stored, fields }: { meta: DocTypeMeta; stored: QueryDoc; fields: FormField[] }) {
  const { user } = useDesk();
  const filters = filtersForDoc(meta, user, stored.data);
  const versions = useVersions(meta.name, stored.id, filters);
  if (versions.status === 'loading') return <Spinner label="Loading history" />;
  if (versions.status === 'error') return <ErrorState title="Could not load the history" message={versions.message} />;
  const labels = Object.fromEntries(fields.map((f) => [f.key, f.def.label]));
  const items = timelineEntries(versions.docs, labels).map((e) => ({
    id: e.id,
    title: `${ACTION[e.action] ?? 'Changed'} by ${e.by || 'unknown'}`,
    when: e.at ? e.at.toLocaleString() : '',
    changes: e.changes,
  }));
  return (
    <Stack>
      <Timeline items={items} />
      {isCapped(versions.docs) ? <Text tone="muted">{`Showing the latest ${VERSIONS_LIMIT} changes.`}</Text> : null}
    </Stack>
  );
}
