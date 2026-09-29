import { useLocalSearchParams } from 'expo-router';
import { EmptyState, Page } from '@jci/ui';
import { DocFormScreen } from '../../../../src/desk/DocFormScreen';
import { deskDocType } from '../../../../src/desk/docTypes';

export default function NewDoc() {
  const { doctype } = useLocalSearchParams<{ doctype: string }>();
  const meta = deskDocType(doctype);
  if (!meta) {
    return (
      <Page>
        <EmptyState title="Unknown DocType" description={`There is no DocType called "${String(doctype)}".`} />
      </Page>
    );
  }
  return <DocFormScreen key={`${meta.name}/new`} meta={meta} id={null} />;
}
