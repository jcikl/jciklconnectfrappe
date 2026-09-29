import type { FieldDef, FormField } from '@jci/core';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { Text } from '../../primitives/Text';
import { FieldControl } from '../FieldControl';
import type { RenderField } from '../types';

function field(def: Partial<FieldDef> & Pick<FieldDef, 'fieldname' | 'fieldtype'>, extra: Partial<FormField> = {}): FormField {
  return { def: { label: def.fieldname, ...def }, key: def.fieldname, editable: true, rowsFixed: false, children: null, ...extra };
}

/** Holds the value like a form would, and records every change. */
function Harness({ f, initial = null, spy, renderField }: { f: FormField; initial?: unknown; spy: jest.Mock; renderField?: RenderField }) {
  const [value, setValue] = useState<unknown>(initial);
  return (
    <FieldControl
      field={f}
      value={value}
      renderField={renderField}
      onChange={(v) => {
        spy(v);
        setValue(v);
      }}
    />
  );
}

describe('text-like fields', () => {
  it('edits Data and shows the required hint', async () => {
    const spy = jest.fn();
    await render(<Harness f={field({ fieldname: 'title', label: 'Name', fieldtype: 'Data', reqd: true })} spy={spy} />);
    expect(screen.getByText('Required')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Name'), 'JCI KL');
    expect(spy).toHaveBeenLastCalledWith('JCI KL');
  });

  it('uses a multiline input for Text and a format hint for Date', async () => {
    await render(<Harness f={field({ fieldname: 'notes', label: 'Notes', fieldtype: 'Text' })} spy={jest.fn()} />);
    expect(screen.getByLabelText('Notes').props.multiline).toBe(true);
    await render(<Harness f={field({ fieldname: 'joinDate', label: 'Join date', fieldtype: 'Date' })} spy={jest.fn()} />);
    expect(screen.getByText('YYYY-MM-DD')).toBeTruthy();
  });

  it('disables controls that are not editable', async () => {
    await render(<Harness f={field({ fieldname: 'authUid', label: 'Auth UID', fieldtype: 'Data' }, { editable: false })} initial="abc" spy={jest.fn()} />);
    expect(screen.getByLabelText('Auth UID').props.editable).toBe(false);
    expect(screen.getByLabelText('Auth UID').props.value).toBe('abc');
  });

  it('falls back to an id input for Link fields', async () => {
    await render(<Harness f={field({ fieldname: 'parent', label: 'Parent', fieldtype: 'Link', link: 'Organization' })} spy={jest.fn()} />);
    expect(screen.getByText('Organization id')).toBeTruthy();
  });
});

describe('number and JSON fields', () => {
  it('emits numbers, null when empty and the raw text when invalid', async () => {
    const spy = jest.fn();
    await render(<Harness f={field({ fieldname: 'year', label: 'Year', fieldtype: 'Int' })} spy={spy} />);
    const input = screen.getByLabelText('Year');
    await fireEvent.changeText(input, '42');
    expect(spy).toHaveBeenLastCalledWith(42);
    await fireEvent.changeText(input, 'abc');
    expect(spy).toHaveBeenLastCalledWith('abc');
    await fireEvent.changeText(input, '');
    expect(spy).toHaveBeenLastCalledWith(null);
  });

  it('keeps in-progress text such as "1." while emitting the number', async () => {
    const spy = jest.fn();
    await render(<Harness f={field({ fieldname: 'amount', label: 'Amount', fieldtype: 'Currency' })} spy={spy} />);
    await fireEvent.changeText(screen.getByLabelText('Amount'), '1.');
    expect(spy).toHaveBeenLastCalledWith(1);
    expect(screen.getByLabelText('Amount').props.value).toBe('1.');
  });

  it('parses JSON objects and passes other text through', async () => {
    const spy = jest.fn();
    await render(<Harness f={field({ fieldname: 'extra', label: 'Extra', fieldtype: 'JSON' })} spy={spy} />);
    await fireEvent.changeText(screen.getByLabelText('Extra'), '{"a": 1}');
    expect(spy).toHaveBeenLastCalledWith({ a: 1 });
    await fireEvent.changeText(screen.getByLabelText('Extra'), '[1]');
    expect(spy).toHaveBeenLastCalledWith('[1]');
  });
});

describe('check and select fields', () => {
  it('toggles a Check field', async () => {
    const spy = jest.fn();
    await render(<Harness f={field({ fieldname: 'withDescendants', label: 'Includes child organisations', fieldtype: 'Check' })} spy={spy} />);
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Includes child organisations' }));
    expect(spy).toHaveBeenLastCalledWith(true);
  });

  it('chooses a Select option, with None for optional fields', async () => {
    const spy = jest.fn();
    await render(<Harness f={field({ fieldname: 'role', label: 'Role', fieldtype: 'Select', options: ['Member', 'OrgAdmin'] })} spy={spy} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Role' }));
    expect(screen.getByRole('button', { name: 'None' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'OrgAdmin' }));
    expect(spy).toHaveBeenLastCalledWith('OrgAdmin');
  });
});

describe('ChildTable', () => {
  const dues = (editable = true, rowsFixed = false) =>
    field(
      { fieldname: 'dues', label: 'Dues', fieldtype: 'Table', childDocType: 'DuesRow' },
      {
        editable,
        rowsFixed,
        children: [
          field({ fieldname: 'year', label: 'Year', fieldtype: 'Int', reqd: true }, { editable }),
          field({ fieldname: 'amount', label: 'Amount', fieldtype: 'Currency' }, { editable: false }),
        ],
      },
    );

  it('edits, adds and removes rows as whole arrays', async () => {
    const spy = jest.fn();
    await render(<Harness f={dues()} initial={[{ year: 2025, amount: 350 }]} spy={spy} />);
    expect(screen.getByText('Row 1')).toBeTruthy();
    expect(screen.getByTestId('field-dues-0-amount').props.editable).toBe(false);
    await fireEvent.changeText(screen.getByTestId('field-dues-0-year'), '2026');
    expect(spy).toHaveBeenLastCalledWith([{ year: 2026, amount: 350 }]);
    await fireEvent.press(screen.getByRole('button', { name: 'Add row' }));
    expect(spy).toHaveBeenLastCalledWith([{ year: 2026, amount: 350 }, {}]);
    await fireEvent.press(screen.getByRole('button', { name: 'Remove row 1' }));
    expect(spy).toHaveBeenLastCalledWith([{}]);
  });

  it('offers no add or remove when the table is locked', async () => {
    await render(<Harness f={dues(false)} initial={[{ year: 2025 }]} spy={jest.fn()} />);
    expect(screen.queryByRole('button', { name: 'Add row' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove row 1' })).toBeNull();
  });

  it('lets an append-only table add rows but not remove them', async () => {
    await render(<Harness f={dues(true, true)} initial={[{ year: 2025 }]} spy={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Add row' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remove row 1' })).toBeNull();
  });
});

describe('renderField', () => {
  it('lets the app replace a control, and falls back when it returns undefined', async () => {
    const renderField: RenderField = ({ field: f }) => (f.def.fieldtype === 'Link' ? <Text>Custom picker</Text> : undefined);
    await render(<Harness f={field({ fieldname: 'org', label: 'Org', fieldtype: 'Link', link: 'Organization' })} spy={jest.fn()} renderField={renderField} />);
    expect(screen.getByText('Custom picker')).toBeTruthy();
    await render(<Harness f={field({ fieldname: 'title', label: 'Name', fieldtype: 'Data' })} spy={jest.fn()} renderField={renderField} />);
    expect(screen.getByLabelText('Name')).toBeTruthy();
  });
});
