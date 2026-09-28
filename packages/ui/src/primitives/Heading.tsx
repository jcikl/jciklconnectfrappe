import type { ReactNode } from 'react';
import { Text as RNText } from 'react-native';
import { cn } from '../lib/cn';

const LEVEL = { 1: 'text-3xl font-bold', 2: 'text-2xl font-semibold', 3: 'text-xl font-semibold' } as const;

export interface HeadingProps {
  children: ReactNode;
  level?: 1 | 2 | 3;
  testID?: string;
}

export function Heading({ children, level = 1, testID }: HeadingProps) {
  return (
    <RNText accessibilityRole="header" testID={testID} className={cn(LEVEL[level], 'text-text dark:text-text-dark')}>
      {children}
    </RNText>
  );
}
