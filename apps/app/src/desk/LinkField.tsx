import { useDocs } from '@jci/client/react';
import { docTypeLabel, listFilters } from '@jci/core';
import { registry } from '@jci/doctypes';
import { fieldHint, LinkPicker, type FieldControlProps, type RenderField } from '@jci/ui';
import { useDesk } from './DeskContext';
import { docTitle } from './docTypes';

/** A Link field backed by a live list of the target DocType in the current Desk scope. */
function LinkField({ field, value, onChange, error, testID }: FieldControlProps) {
  const { user, scope } = useDesk();
  const target = field.def.link && registry.has(field.def.link) ? registry.get(field.def.link) : null;
  const filters = target ? listFilters(target, user, scope) : null;
  const docs = useDocs(target?.collection ?? null, filters);
  const options = target && docs.status === 'ready' ? docs.docs.map((d) => ({ value: d.id, label: docTitle(target, d) })) : [];
  return (
    <LinkPicker
      testID={testID}
      label={field.def.label}
      value={typeof value === 'string' ? value : null}
      options={options}
      loading={docs.status === 'loading'}
      unavailable={target && !filters ? `You can't list ${docTypeLabel(target)} here. The saved value is kept.` : undefined}
      onChange={onChange}
      allowClear={field.def.reqd !== true}
      disabled={!field.editable}
      error={error ?? (docs.status === 'error' ? docs.message : undefined)}
      hint={fieldHint(field.def)}
    />
  );
}

export const renderDeskField: RenderField = (props) => (props.field.def.fieldtype === 'Link' ? <LinkField {...props} /> : undefined);
