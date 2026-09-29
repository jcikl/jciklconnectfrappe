import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Box } from '../primitives/Box';
import { Heading } from '../primitives/Heading';
import { Stack } from '../primitives/Stack';
import { Text } from '../primitives/Text';

export interface AuthShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  testID?: string;
}

/** Full-screen, centred card for sign-in screens. */
export function AuthShell({ title, subtitle, children, footer, testID }: AuthShellProps) {
  return (
    <SafeAreaView testID={testID} className="flex-1 bg-background dark:bg-background-dark">
      <ScrollView contentContainerClassName="flex-grow items-center justify-center px-4 py-10" keyboardShouldPersistTaps="handled">
        <View className="w-full max-w-sm gap-6">
          <View className="gap-1">
            <Heading level={1}>{title}</Heading>
            {subtitle ? <Text tone="muted">{subtitle}</Text> : null}
          </View>
          <Box surface="surface" padding="lg" rounded bordered>
            <Stack gap="md">{children}</Stack>
          </Box>
          {footer}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
