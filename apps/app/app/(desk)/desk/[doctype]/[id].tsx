import { useLocalSearchParams } from 'expo-router';
import { EmptyState, Page } from '@jci/ui';
import { DocFormScreen } from '../../../../src/desk/DocFormScreen';
import { deskDocType } from '../../../../src/desk/docTypes';

export default function EditDoc() {
  const { doctype, id } = useLocalSearchParams<{ doctype: string; id: string }>();
  const meta = deskDocType(doctype);
  if (!meta || typeof id !== 'string') {
    return (
      <Page>
        <EmptyState title="Unknown DocType" description={`There is no DocType called "${String(doctype)}".`} />
      </Page>
    );
  }
  // Keyed by document so moving between records starts a fresh form.
  return <DocFormScreen key={`${meta.name}/${id}`} meta={meta} id={id} />;
}
