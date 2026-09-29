import { LIST_LIMIT } from '@jci/client';
import { useDocs } from '@jci/client/react';
import { can, docTypeLabel, listFilters } from '@jci/core';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, EmptyState, ErrorState, Heading, ListItem, Page, Spinner, Stack, Text } from '@jci/ui';
import { useDesk } from '../../../../src/desk/DeskContext';
import { deskDocType, docTitle } from '../../../../src/desk/docTypes';
import { useScopeOrgPath } from '../../../../src/desk/useScopeOrgPath';

export default function DocTypeList() {
  const { doctype } = useLocalSearchParams<{ doctype: string }>();
  const router = useRouter();
  const { user, scope } = useDesk();
  const scopePath = useScopeOrgPath();
  const meta = deskDocType(doctype);
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
  const canCreateHere =
    (!meta.orgScoped || Array.isArray(scopePath)) &&
    can(meta, user, 'create', { orgPath: meta.orgScoped ? (scopePath ?? []) : null, ownerPersonId: user.personId });
  const newButton = canCreateHere ? (
    <Button label={`New ${label}`} size="sm" onPress={() => router.push({ pathname: '/desk/[doctype]/new', params: { doctype: meta.name } })} />
  ) : null;

  if (!filters) {
    return (
      <Page>
        <Heading level={1}>{label}</Heading>
        <EmptyState title="Not available here" description={`You can't see ${label} in this organisation. Pick another one from the menu.`} />
        {newButton}
      </Page>
    );
  }

  return (
    <Page>
      <Stack direction="row" justify="between" align="center" wrap>
        <Heading level={1}>{label}</Heading>
        <Stack direction="row" gap="sm" align="center">
          {docs.status === 'ready' ? (
            <Text tone="muted">{docs.docs.length === LIST_LIMIT ? `First ${LIST_LIMIT}` : String(docs.docs.length)}</Text>
          ) : null}
          {newButton}
        </Stack>
      </Stack>
      {docs.status === 'loading' ? <Spinner label={`Loading ${label}`} /> : null}
      {docs.status === 'error' ? <ErrorState message={docs.message} /> : null}
      {docs.status === 'ready' && docs.docs.length === 0 ? <EmptyState title={`No ${label} yet`} /> : null}
      {docs.status === 'ready'
        ? docs.docs.map((d) => {
            const title = docTitle(meta, d);
            return (
              <ListItem
                key={d.id}
                testID={`row-${d.id}`}
                title={title}
                subtitle={title === d.id ? undefined : d.id}
                onPress={() => router.push({ pathname: '/desk/[doctype]/[id]', params: { doctype: meta.name, id: d.id } })}
              />
            );
          })
        : null}
    </Page>
  );
}
