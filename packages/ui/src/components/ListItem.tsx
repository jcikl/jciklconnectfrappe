import { Pressable, View } from 'react-native';
import { cn } from '../lib/cn';
import { Text } from '../primitives/Text';

export interface ListItemProps {
  title: string;
  subtitle?: string;
  selected?: boolean;
  onPress?: () => void;
  testID?: string;
}

const ROW = 'min-h-11 flex-row items-center gap-3 rounded-lg px-3 py-2';
const SELECTED = 'bg-surface-muted dark:bg-surface-muted-dark';
const INTERACTIVE =
  'active:opacity-80 web:hover:bg-surface-muted dark:web:hover:bg-surface-muted-dark web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-focus dark:web:focus-visible:ring-focus-dark';

export function ListItem({ title, subtitle, selected = false, onPress, testID }: ListItemProps) {
  const body = (
    <View className="flex-1 gap-0.5">
      <Text variant="label" tone={selected ? 'primary' : 'default'} numberOfLines={1}>
        {title}
      </Text>
      {subtitle ? (
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
  if (!onPress) {
    return (
      <View testID={testID} className={cn(ROW, selected && SELECTED)}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      accessibilityState={{ selected }}
      onPress={onPress}
      className={cn(ROW, INTERACTIVE, selected && SELECTED)}
    >
      {body}
    </Pressable>
  );
}
