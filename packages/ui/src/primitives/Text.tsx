import type { ReactNode } from 'react';
import { Text as RNText } from 'react-native';
import { cn } from '../lib/cn';

const VARIANT = { body: 'text-base', caption: 'text-sm', label: 'text-sm font-medium' } as const;
const TONE = {
  default: 'text-text dark:text-text-dark',
  muted: 'text-text-muted dark:text-text-muted-dark',
  primary: 'text-primary dark:text-primary-dark',
  danger: 'text-danger dark:text-danger-dark',
  success: 'text-success dark:text-success-dark',
  warning: 'text-warning dark:text-warning-dark',
} as const;

export interface TextProps {
  children: ReactNode;
  variant?: keyof typeof VARIANT;
  tone?: keyof typeof TONE;
  numberOfLines?: number;
  accessibilityLabel?: string;
  accessibilityLiveRegion?: 'none' | 'polite' | 'assertive';
  testID?: string;
}

export function Text({ children, variant = 'body', tone = 'default', ...rest }: TextProps) {
  return (
    <RNText {...rest} className={cn(VARIANT[variant], TONE[tone])}>
      {children}
    </RNText>
  );
}
