import { View } from 'react-native';
import { Card } from '../components/Card';
import { Text } from '../primitives/Text';

export interface TimelineItem {
  id: string;
  title: string;
  when: string;
  changes: readonly { label: string; from: string; to: string }[];
}

export interface TimelineProps {
  items: readonly TimelineItem[];
  emptyText?: string;
  testID?: string;
}

/** A document's change history, newest first. */
export function Timeline({ items, emptyText = 'No changes recorded yet.', testID }: TimelineProps) {
  return (
    <Card title="Timeline" testID={testID}>
      {items.length === 0 ? <Text tone="muted">{emptyText}</Text> : null}
      {items.map((item) => (
        <View key={item.id} className="gap-1 border-l-2 border-border pl-3 dark:border-border-dark">
          <Text variant="label">{item.title}</Text>
          {item.when ? (
            <Text variant="caption" tone="muted">
              {item.when}
            </Text>
          ) : null}
          {item.changes.map((c, i) => (
            <Text key={`${item.id}-${i}`} variant="caption">{`${c.label}: ${c.from} → ${c.to}`}</Text>
          ))}
        </View>
      ))}
    </Card>
  );
}
