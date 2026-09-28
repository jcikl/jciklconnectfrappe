import { fireEvent, render, screen } from '@testing-library/react-native';
import { Badge } from '../Badge';
import { Button } from '../Button';
import { Card } from '../Card';
import { EmptyState } from '../EmptyState';
import { Input } from '../Input';
import { Text } from '../../primitives/Text';
import { tokens } from '../../tokens';

describe('Button', () => {
  it('is an accessible button that fires onPress', async () => {
    const onPress = jest.fn();
    await render(<Button label="Save" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('meets the 44px touch target in every size', async () => {
    for (const size of ['sm', 'md', 'lg'] as const) {
      const { unmount } = await render(<Button label={`B-${size}`} size={size} onPress={() => {}} />);
      expect(screen.getByRole('button', { name: `B-${size}` }).props.className).toMatch(/min-h-1[12]/);
      await unmount();
    }
  });

  it('does not fire when disabled and reports the state', async () => {
    const onPress = jest.fn();
    await render(<Button label="Save" onPress={onPress} disabled />);
    const btn = screen.getByRole('button', { name: 'Save' });
    await fireEvent.press(btn);
    expect(onPress).not.toHaveBeenCalled();
    expect(btn.props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('is busy and inactive while loading', async () => {
    const onPress = jest.fn();
    await render(<Button label="Pay" onPress={onPress} loading />);
    const btn = screen.getByRole('button', { name: 'Pay' });
    await fireEvent.press(btn);
    expect(onPress).not.toHaveBeenCalled();
    expect(btn.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
  });

  it('maps variants to token classes', async () => {
    await render(<Button label="Delete" variant="danger" onPress={() => {}} />);
    expect(screen.getByRole('button', { name: 'Delete' }).props.className).toContain('bg-danger');
  });
});

describe('Input', () => {
  it('is labelled, forwards text and shows errors politely', async () => {
    const onChangeText = jest.fn();
    await render(<Input label="Email" value="" onChangeText={onChangeText} error="Required" />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'a@b.co');
    expect(onChangeText).toHaveBeenCalledWith('a@b.co');
    const err = screen.getByText('Required');
    expect(err.props.accessibilityLiveRegion).toBe('polite');
    expect(screen.getByLabelText('Email').props.className).toContain('border-danger');
  });

  it('shows the hint when there is no error', async () => {
    await render(<Input label="Phone" value="" onChangeText={() => {}} hint="Include country code" />);
    expect(screen.getByText('Include country code')).toBeTruthy();
  });

  it('keeps its own className and a11y props when a spread tries to override them', async () => {
    const override = { className: 'text-red-500', accessibilityLabel: 'Hijacked' } as object;
    await render(<Input label="Email" value="" onChangeText={() => {}} {...override} />);
    const cls: string = screen.getByLabelText('Email').props.className;
    expect(cls).toContain('min-h-11');
    expect(cls).not.toContain('text-red-500');
    expect(screen.queryByLabelText('Hijacked')).toBeNull();
  });

  it('uses the muted text token for the placeholder colour', async () => {
    await render(<Input label="Email" value="" onChangeText={() => {}} placeholder="you@example.com" />);
    expect(screen.getByLabelText('Email').props.placeholderTextColor).toBe(tokens.semantic.light.textMuted);
  });
});

describe('Card, Badge, EmptyState', () => {
  it('Card renders an optional title and children', async () => {
    await render(
      <Card title="Membership">
        <Text>Official</Text>
      </Card>,
    );
    expect(screen.getByRole('header', { name: 'Membership' })).toBeTruthy();
    expect(screen.getByText('Official')).toBeTruthy();
  });

  it('Badge maps tone to token classes', async () => {
    await render(<Badge label="Paid" tone="success" testID="badge" />);
    expect(screen.getByTestId('badge').props.className).toContain('bg-success');
    expect(screen.getByText('Paid').props.className).toContain('text-on-success');
  });

  it('EmptyState shows the action only when both label and handler are given', async () => {
    const onAction = jest.fn();
    const { rerender } = await render(
      <EmptyState title="No members" description="Add the first one" actionLabel="Add member" onAction={onAction} />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Add member' }));
    expect(onAction).toHaveBeenCalled();
    await rerender(<EmptyState title="No members" actionLabel="Add member" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
