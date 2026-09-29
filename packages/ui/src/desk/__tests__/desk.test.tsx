import type { FieldDef, FormField, FormSection } from '@jci/core';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { DocForm } from '../DocForm';
import { Timeline } from '../Timeline';

const f = (def: Partial<FieldDef> & Pick<FieldDef, 'fieldname' | 'fieldtype'>, editable = true): FormField => ({
  def: { label: def.fieldname, ...def },
  key: def.fieldname,
  editable,
  rowsFixed: false,
  children: null,
});

const sections: FormSection[] = [
  { title: 'Basics', fields: [f({ fieldname: 'title', label: 'Name', fieldtype: 'Data', reqd: true })] },
  { title: null, fields: [f({ fieldname: 'code', label: 'Code', fieldtype: 'Data' }, false)] },
];

describe('DocForm', () => {
  it('renders sections, reports changes by key and submits', async () => {
    const onChange = jest.fn();
    const onSubmit = jest.fn();
    await render(<DocForm sections={sections} values={{ title: 'JCI KL', code: 'jci-kl' }} onChange={onChange} onSubmit={onSubmit} submitLabel="Save changes" />);
    expect(screen.getByRole('header', { name: 'Basics' })).toBeTruthy();
    expect(screen.getByLabelText('Code').props.editable).toBe(false);
    await fireEvent.changeText(screen.getByLabelText('Name'), 'JCI Kuala Lumpur');
    expect(onChange).toHaveBeenCalledWith('title', 'JCI Kuala Lumpur');
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('shows field and form errors', async () => {
    await render(
      <DocForm sections={sections} values={{}} errors={{ title: 'Required' }} formError="You cannot edit this Organization" onChange={() => {}} onSubmit={() => {}} />,
    );
    expect(screen.getByText('Required')).toBeTruthy();
    expect(screen.getByText('You cannot edit this Organization')).toBeTruthy();
  });

  it('has no submit button when read-only, and a busy one while submitting', async () => {
    await render(<DocForm sections={sections} values={{}} onChange={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    await render(<DocForm sections={sections} values={{}} onChange={() => {}} onSubmit={() => {}} submitting />);
    expect(screen.getByRole('button', { name: 'Save' }).props.accessibilityState).toMatchObject({ busy: true });
  });
});

describe('Timeline', () => {
  it('lists entries with their changes', async () => {
    await render(
      <Timeline
        items={[{ id: 'v1', title: 'Updated by u-admin', when: '29/09/2026, 10:00', changes: [{ label: 'Name', from: 'JCI KL', to: 'JCI Kuala Lumpur' }] }]}
      />,
    );
    expect(screen.getByRole('header', { name: 'Timeline' })).toBeTruthy();
    expect(screen.getByText('Updated by u-admin')).toBeTruthy();
    expect(screen.getByText('Name: JCI KL → JCI Kuala Lumpur')).toBeTruthy();
  });

  it('says when nothing has been recorded', async () => {
    await render(<Timeline items={[]} />);
    expect(screen.getByText('No changes recorded yet.')).toBeTruthy();
  });
});
