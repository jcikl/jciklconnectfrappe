import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '../lib/cn';

const GAP = { none: 'gap-0', xs: 'gap-1', sm: 'gap-2', md: 'gap-4', lg: 'gap-6', xl: 'gap-8' } as const;
const ALIGN = { start: 'items-start', center: 'items-center', end: 'items-end', stretch: 'items-stretch' } as const;
const JUSTIFY = { start: 'justify-start', center: 'justify-center', end: 'justify-end', between: 'justify-between' } as const;

export interface StackProps {
  children?: ReactNode;
  direction?: 'column' | 'row';
  gap?: keyof typeof GAP;
  align?: keyof typeof ALIGN;
  justify?: keyof typeof JUSTIFY;
  wrap?: boolean;
  fill?: boolean;
  testID?: string;
}

export function Stack({
  children,
  direction = 'column',
  gap = 'md',
  align = 'stretch',
  justify = 'start',
  wrap = false,
  fill = false,
  testID,
}: StackProps) {
  return (
    <View
      testID={testID}
      className={cn(
        direction === 'row' ? 'flex-row' : 'flex-col',
        GAP[gap],
        ALIGN[align],
        JUSTIFY[justify],
        wrap && 'flex-wrap',
        fill && 'flex-1',
      )}
    >
      {children}
    </View>
  );
}
