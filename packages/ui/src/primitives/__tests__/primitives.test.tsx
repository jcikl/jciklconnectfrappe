import { render, screen } from '@testing-library/react-native';
import { Box } from '../Box';
import { Heading } from '../Heading';
import { Screen } from '../Screen';
import { Stack } from '../Stack';
import { Text } from '../Text';

describe('primitives', () => {
  it('Text maps variant and tone to token classes', async () => {
    await render(<Text tone="muted" variant="caption">Hello</Text>);
    const cls: string = screen.getByText('Hello').props.className;
    expect(cls).toContain('text-sm');
    expect(cls).toContain('text-text-muted');
    expect(cls).toContain('dark:text-text-muted-dark');
  });

  it('Heading exposes the header role', async () => {
    await render(<Heading level={2}>Members</Heading>);
    expect(screen.getByRole('header', { name: 'Members' })).toBeTruthy();
    expect(screen.getByText('Members').props.className).toContain('text-2xl');
  });

  it('Stack maps direction and gap', async () => {
    await render(
      <Stack testID="s" direction="row" gap="lg" justify="between">
        <Text>a</Text>
      </Stack>,
    );
    const cls: string = screen.getByTestId('s').props.className;
    expect(cls).toContain('flex-row');
    expect(cls).toContain('gap-6');
    expect(cls).toContain('justify-between');
  });

  it('Box maps surface, padding and border', async () => {
    await render(<Box testID="b" surface="muted" padding="md" bordered rounded />);
    const cls: string = screen.getByTestId('b').props.className;
    expect(cls).toContain('bg-surface-muted');
    expect(cls).toContain('p-4');
    expect(cls).toContain('border-border');
    expect(cls).toContain('rounded-xl');
  });

  it('Screen renders children on the background token', async () => {
    await render(
      <Screen testID="screen">
        <Text>Inside</Text>
      </Screen>,
    );
    expect(screen.getByText('Inside')).toBeTruthy();
    expect(screen.getByTestId('screen').props.className).toContain('bg-background');
  });
});
