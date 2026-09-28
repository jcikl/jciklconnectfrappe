import { Text as RNText, View } from 'react-native';
import { cn } from '../lib/cn';

const TONE = {
  neutral: { box: 'bg-surface-muted dark:bg-surface-muted-dark', text: 'text-text dark:text-text-dark' },
  primary: { box: 'bg-primary dark:bg-primary-dark', text: 'text-on-primary dark:text-on-primary-dark' },
  accent: { box: 'bg-accent dark:bg-accent-dark', text: 'text-on-accent dark:text-on-accent-dark' },
  success: { box: 'bg-success dark:bg-success-dark', text: 'text-on-success dark:text-on-success-dark' },
  warning: { box: 'bg-warning dark:bg-warning-dark', text: 'text-on-warning dark:text-on-warning-dark' },
  danger: { box: 'bg-danger dark:bg-danger-dark', text: 'text-on-danger dark:text-on-danger-dark' },
} as const;

export interface BadgeProps {
  label: string;
  tone?: keyof typeof TONE;
  testID?: string;
}

export function Badge({ label, tone = 'neutral', testID }: BadgeProps) {
  const t = TONE[tone];
  return (
    <View testID={testID} className={cn('self-start rounded-md px-2 py-0.5', t.box)}>
      <RNText className={cn('text-xs font-semibold', t.text)}>{label}</RNText>
    </View>
  );
}
