import { fireEvent, render, screen } from '@testing-library/react-native';
import { PickerSheet } from '../PickerSheet';
import { Checkbox } from '../Checkbox';
import { LinkPicker } from '../LinkPicker';
import { Select } from '../Select';

const LEVELS = [
  { value: 'area', label: 'Area' },
  { value: 'local', label: 'Local' },
];
const ORGS = [
  { value: 'jci-kl', label: 'JCI Kuala Lumpur' },
  { value: 'jci-pj', label: 'JCI Petaling Jaya', description: 'Selangor' },
];

describe('Checkbox', () => {
  it('toggles and reports its state', async () => {
    const onChange = jest.fn();
    await render(<Checkbox label="Includes child organisations" checked={false} onChange={onChange} />);
    const box = screen.getByRole('checkbox', { name: 'Includes child organisations' });
    expect(box.props.accessibilityState).toMatchObject({ checked: false });
    await fireEvent.press(box);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('does nothing when disabled', async () => {
    const onChange = jest.fn();
    await render(<Checkbox label="Active" checked onChange={onChange} disabled error="Not allowed" />);
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Active' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('Not allowed')).toBeTruthy();
  });
});

describe('Checkbox accessibility and error', () => {
  it('draws a danger border on error and leaves the hint visible only', async () => {
    await render(<Checkbox label="Active" checked={false} onChange={() => {}} error="Required" hint="Some hint" testID="cb" />);
    expect(screen.getByTestId('cb-box').props.className).toContain('border-danger');
    expect(screen.getByRole('checkbox', { name: 'Active' }).props.accessibilityHint).toBeUndefined();
  });

  it('shows the hint as visible text', async () => {
    await render(<Checkbox label="Active" checked onChange={() => {}} hint="Some hint" />);
    expect(screen.getByText('Some hint')).toBeTruthy();
  });
});

describe('PickerSheet', () => {
  it('has a non-accessible backdrop and closes on a tap outside', async () => {
    const onClose = jest.fn();
    await render(
      <PickerSheet title="Pick" visible onClose={onClose}>
        <></>
      </PickerSheet>,
    );
    const backdrop = screen.getByTestId('picker-backdrop');
    expect(backdrop.props.accessible).toBe(false);
    await fireEvent.press(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a tap outside a Select closes it without a change', async () => {
    const onChange = jest.fn();
    await render(<Select label="Level" value={null} options={LEVELS} onChange={onChange} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Level' }));
    await fireEvent.press(screen.getByTestId('picker-backdrop'));
    expect(screen.queryByRole('button', { name: 'Area' })).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('Select', () => {
  it('shows the raw value when it is not among the options', async () => {
    await render(<Select label="Level" value="zone" options={LEVELS} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Level' }).props.accessibilityValue).toEqual({ text: 'zone' });
  });

  it('opens its options and reports the choice', async () => {
    const onChange = jest.fn();
    await render(<Select label="Level" value={null} options={LEVELS} onChange={onChange} testID="level" />);
    const trigger = screen.getByRole('button', { name: 'Level' });
    expect(trigger.props.accessibilityValue).toEqual({ text: 'Choose…' });
    await fireEvent.press(trigger);
    await fireEvent.press(screen.getByRole('button', { name: 'Local' }));
    expect(onChange).toHaveBeenCalledWith('local');
    expect(screen.queryByRole('button', { name: 'Area' })).toBeNull();
  });

  it('shows the current label and offers None when clearable', async () => {
    const onChange = jest.fn();
    await render(<Select label="Level" value="area" options={LEVELS} onChange={onChange} allowClear />);
    expect(screen.getByRole('button', { name: 'Level' }).props.accessibilityValue).toEqual({ text: 'Area' });
    await fireEvent.press(screen.getByRole('button', { name: 'Level' }));
    await fireEvent.press(screen.getByRole('button', { name: 'None' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('closes on Cancel without a change, and stays shut when disabled', async () => {
    const onChange = jest.fn();
    await render(<Select label="Level" value={null} options={LEVELS} onChange={onChange} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Level' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('button', { name: 'Area' })).toBeNull();
    expect(onChange).not.toHaveBeenCalled();

    await render(<Select label="Kind" value={null} options={LEVELS} onChange={onChange} disabled />);
    await fireEvent.press(screen.getByRole('button', { name: 'Kind' }));
    expect(screen.queryByRole('button', { name: 'Area' })).toBeNull();
  });
});

describe('LinkPicker', () => {
  it('allowClear chooses null', async () => {
    const onChange = jest.fn();
    await render(<LinkPicker label="Organisation" value="jci-kl" options={ORGS} onChange={onChange} allowClear />);
    await fireEvent.press(screen.getByRole('button', { name: 'Organisation' }));
    await fireEvent.press(screen.getByRole('button', { name: 'None' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('does not open when disabled', async () => {
    await render(<LinkPicker label="Organisation" value={null} options={ORGS} onChange={() => {}} disabled />);
    await fireEvent.press(screen.getByRole('button', { name: 'Organisation' }));
    expect(screen.queryByLabelText('Search')).toBeNull();
  });

  it('searches the options and reports the chosen id', async () => {
    const onChange = jest.fn();
    await render(<LinkPicker label="Organisation" value="jci-kl" options={ORGS} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Organisation' }).props.accessibilityValue).toEqual({ text: 'JCI Kuala Lumpur' });
    await fireEvent.press(screen.getByRole('button', { name: 'Organisation' }));
    await fireEvent.changeText(screen.getByLabelText('Search'), 'selangor');
    expect(screen.queryByRole('button', { name: 'JCI Kuala Lumpur, jci-kl' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'JCI Petaling Jaya, Selangor' }));
    expect(onChange).toHaveBeenCalledWith('jci-pj');
  });

  it('shows the raw id when the value is not among the options', async () => {
    await render(<LinkPicker label="Organisation" value="jci-far" options={ORGS} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Organisation' }).props.accessibilityValue).toEqual({ text: 'jci-far' });
  });

  it('shows loading, unavailable and empty states', async () => {
    await render(<LinkPicker label="Org" value={null} options={[]} onChange={() => {}} loading />);
    await fireEvent.press(screen.getByRole('button', { name: 'Org' }));
    expect(screen.getByRole('progressbar')).toBeTruthy();

    await render(<LinkPicker label="Org" value={null} options={[]} onChange={() => {}} unavailable="You can't list these here." />);
    await fireEvent.press(screen.getByRole('button', { name: 'Org' }));
    expect(screen.getByText("You can't list these here.")).toBeTruthy();

    await render(<LinkPicker label="Org" value={null} options={ORGS} onChange={() => {}} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Org' }));
    await fireEvent.changeText(screen.getByLabelText('Search'), 'zzz');
    expect(screen.getByText('No matches')).toBeTruthy();
  });
});
