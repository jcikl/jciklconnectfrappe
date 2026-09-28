import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '../lib/cn';

const PADDING = { none: '', sm: 'p-2', md: 'p-4', lg: 'p-6' } as const;
const SURFACE = {
  none: '',
  surface: 'bg-surface dark:bg-surface-dark',
  muted: 'bg-surface-muted dark:bg-surface-muted-dark',
} as const;

export interface BoxProps {
  children?: ReactNode;
  padding?: keyof typeof PADDING;
  surface?: keyof typeof SURFACE;
  rounded?: boolean;
  bordered?: boolean;
  fill?: boolean;
  testID?: string;
}

export function Box({ children, padding = 'none', surface = 'none', rounded = false, bordered = false, fill = false, testID }: BoxProps) {
  return (
    <View
      testID={testID}
      className={cn(
        PADDING[padding],
        SURFACE[surface],
        rounded && 'rounded-xl',
        bordered && 'border border-border dark:border-border-dark',
        fill && 'flex-1',
      )}
    >
      {children}
    </View>
  );
}
