import { useEffect } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Button } from '../../components/Button';
import { Text } from '../../primitives/Text';
import { AuthShell } from '../AuthShell';
import { DESK_WIDE_MIN, DeskShell, deskLayout } from '../DeskShell';

describe('AuthShell', () => {
  it('shows the title, subtitle, form content and footer', async () => {
    await render(
      <AuthShell title="JCI Platform" subtitle="Sign in to continue" footer={<Text>Footer</Text>}>
        <Button label="Sign in" onPress={() => {}} />
      </AuthShell>,
    );
    expect(screen.getByRole('header', { name: 'JCI Platform' })).toBeTruthy();
    expect(screen.getByText('Sign in to continue')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
    expect(screen.getByText('Footer')).toBeTruthy();
  });
});

describe('deskLayout', () => {
  it('switches to the sidebar layout at 768 px', () => {
    expect(DESK_WIDE_MIN).toBe(768);
    expect(deskLayout(767)).toBe('narrow');
    expect(deskLayout(768)).toBe('wide');
  });
});

function Probe({ onUnmount }: { onUnmount: () => void }) {
  useEffect(() => onUnmount, [onUnmount]);
  return <Text>Page content</Text>;
}

describe('DeskShell (narrow, the jest default window)', () => {
  const nav = [
    { key: 'Organization', label: 'Organization' },
    { key: 'RoleAssignment', label: 'Role Assignment' },
  ];

  it('shows content with a menu button, and the nav when the menu opens', async () => {
    const onNavigate = jest.fn();
    const onUnmount = jest.fn();
    await render(
      <DeskShell title="JCI Desk" nav={nav} activeKey="Organization" onNavigate={onNavigate} sidebarFooter={<Text>Signed in</Text>}>
        <Probe onUnmount={onUnmount} />
      </DeskShell>,
    );
    expect(screen.getByRole('header', { name: 'JCI Desk' })).toBeTruthy();
    expect(screen.getByText('Page content')).toBeTruthy();
    expect(screen.getByTestId('desk-content').props.className).not.toContain('hidden');
    expect(screen.queryByRole('button', { name: 'Role Assignment' })).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Menu' }));
    // Content stays mounted but is hidden; the nav is shown on top.
    expect(screen.getByText('Page content')).toBeTruthy();
    expect(screen.getByTestId('desk-content').props.className).toContain('hidden');
    expect(screen.getByRole('button', { name: 'Organization' }).props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByText('Signed in')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Role Assignment' }));
    expect(onNavigate).toHaveBeenCalledWith('RoleAssignment');
    expect(screen.queryByRole('button', { name: 'Role Assignment' })).toBeNull();
    expect(screen.getByTestId('desk-content').props.className).not.toContain('hidden');
    expect(onUnmount).not.toHaveBeenCalled();
  });

  it('closes the menu without navigating and without unmounting the content', async () => {
    const onNavigate = jest.fn();
    const onUnmount = jest.fn();
    await render(
      <DeskShell title="JCI Desk" nav={nav} onNavigate={onNavigate}>
        <Probe onUnmount={onUnmount} />
      </DeskShell>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Menu' }));
    expect(screen.getByTestId('desk-content').props.className).toContain('hidden');
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByTestId('desk-content').props.className).not.toContain('hidden');
    expect(screen.getByText('Page content')).toBeTruthy();
    expect(onNavigate).not.toHaveBeenCalled();
    expect(onUnmount).not.toHaveBeenCalled();
  });
});
