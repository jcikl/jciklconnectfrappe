import { fireEvent, render, screen } from '@testing-library/react-native';
import { Page } from '../../primitives/Page';
import { Text } from '../../primitives/Text';
import { ErrorState } from '../ErrorState';
import { ListItem } from '../ListItem';
import { Spinner } from '../Spinner';

describe('Spinner', () => {
  it('announces what is loading', async () => {
    await render(<Spinner label="Loading members" />);
    expect(screen.getByRole('progressbar', { name: 'Loading members' })).toBeTruthy();
  });

  it('defaults its label to Loading', async () => {
    await render(<Spinner />);
    expect(screen.getByRole('progressbar', { name: 'Loading' })).toBeTruthy();
  });
});

describe('ErrorState', () => {
  it('shows the title, the message and a retry button', async () => {
    const onRetry = jest.fn();
    await render(<ErrorState message="Permission denied" onRetry={onRetry} />);
    expect(screen.getByRole('header', { name: 'Something went wrong' })).toBeTruthy();
    expect(screen.getByText('Permission denied')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('has no button without onRetry', async () => {
    await render(<ErrorState title="No access" message="Ask an administrator." />);
    expect(screen.getByRole('header', { name: 'No access' })).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('ListItem', () => {
  it('is a button labelled with its title and subtitle', async () => {
    const onPress = jest.fn();
    await render(<ListItem title="JCI Kuala Lumpur" subtitle="Includes child organisations" selected onPress={onPress} />);
    const item = screen.getByRole('button', { name: 'JCI Kuala Lumpur, Includes child organisations' });
    expect(item.props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent.press(item);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is plain content without onPress', async () => {
    await render(<ListItem title="Read only" />);
    expect(screen.getByText('Read only')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('Page', () => {
  it('renders its children, scrolling or not', async () => {
    await render(
      <Page testID="page">
        <Text>Scrolling</Text>
      </Page>,
    );
    expect(screen.getByText('Scrolling')).toBeTruthy();
    await render(
      <Page scroll={false}>
        <Text>Fixed</Text>
      </Page>,
    );
    expect(screen.getByText('Fixed')).toBeTruthy();
  });
});
