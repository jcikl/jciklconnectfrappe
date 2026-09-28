import type { ReactNode } from 'react';
import { Box } from '../primitives/Box';
import { Heading } from '../primitives/Heading';
import { Stack } from '../primitives/Stack';

export interface CardProps {
  title?: string;
  children: ReactNode;
  testID?: string;
}

export function Card({ title, children, testID }: CardProps) {
  return (
    <Box testID={testID} surface="surface" padding="md" rounded bordered>
      <Stack gap="sm">
        {title ? <Heading level={3}>{title}</Heading> : null}
        {children}
      </Stack>
    </Box>
  );
}
