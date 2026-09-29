import { render, screen } from '@testing-library/react-native';
import { tokens } from '../../tokens';
import { Input } from '../Input';

// The original bug was the dark-mode placeholder colour on web; pin the dark branch.
jest.mock('../../theme/useTheme', () => ({
  useTheme: () => ({ scheme: 'dark', setScheme: jest.fn(), toggle: jest.fn() }),
}));

describe('Input in dark mode', () => {
  it('uses the dark muted text token for the placeholder colour', async () => {
    await render(<Input label="Email" value="" onChangeText={() => {}} placeholder="you@example.com" />);
    const colour = screen.getByLabelText('Email').props.placeholderTextColor;
    expect(colour).toBe(tokens.semantic.dark.textMuted);
    expect(colour).not.toBe(tokens.semantic.light.textMuted);
  });
});
