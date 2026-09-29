import { LIST_LIMIT } from '@jci/client';
import { useDocs } from '@jci/client/react';
import { docTypeLabel, listFilters } from '@jci/core';
import { registry } from '@jci/doctypes';
import { useLocalSearchParams } from 'expo-router';
import { EmptyState, ErrorState, Heading, ListItem, Page, Spinner, Stack, Text } from '@jci/ui';
import { useDesk } from '../../../../src/desk/DeskContext';

export default function DocTypeList() {
  const { doctype } = useLocalSearchParams<{ doctype: string }>();
  const { user, scope } = useDesk();
  const meta = typeof doctype === 'string' && registry.has(doctype) && !registry.get(doctype).isChild ? registry.get(doctype) : null;
  const filters = meta ? listFilters(meta, user, scope) : null;
  const docs = useDocs(meta?.collection ?? null, filters);

  if (!meta) {
    return (
      <Page>
        <EmptyState title="Unknown DocType" description={`There is no DocType called "${String(doctype)}".`} />
      </Page>
    );
  }
  const label = docTypeLabel(meta);
  if (!filters) {
    return (
      <Page>
        <Heading level={1}>{label}</Heading>
        <EmptyState title="Not available here" description={`You can't see ${label} in this organisation. Pick another one from the menu.`} />
      </Page>
    );
  }

  return (
    <Page>
      <Stack direction="row" justify="between" align="center">
        <Heading level={1}>{label}</Heading>
        {docs.status === 'ready' ? (
          <Text tone="muted">{docs.docs.length === LIST_LIMIT ? `First ${LIST_LIMIT}` : String(docs.docs.length)}</Text>
        ) : null}
      </Stack>
      {docs.status === 'loading' ? <Spinner label={`Loading ${label}`} /> : null}
      {docs.status === 'error' ? <ErrorState message={docs.message} /> : null}
      {docs.status === 'ready' && docs.docs.length === 0 ? <EmptyState title={`No ${label} yet`} /> : null}
      {docs.status === 'ready'
        ? docs.docs.map((d) => {
            const raw = meta.titleField ? d.data[meta.titleField] : undefined;
            const title = typeof raw === 'string' && raw !== '' ? raw : d.id;
            return <ListItem key={d.id} testID={`row-${d.id}`} title={title} subtitle={title === d.id ? undefined : d.id} />;
          })
        : null}
    </Page>
  );
}
