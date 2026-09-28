import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export interface ScreenProps {
  children: ReactNode;
  /** Default true. Set false for screens that manage their own scrolling (lists). */
  scroll?: boolean;
  testID?: string;
}

/** Full-screen page container: safe area, background token, 16px side gutter. */
export function Screen({ children, scroll = true, testID }: ScreenProps) {
  return (
    <SafeAreaView testID={testID} className="flex-1 bg-background dark:bg-background-dark">
      {scroll ? (
        <ScrollView contentContainerClassName="gap-4 px-4 py-6">{children}</ScrollView>
      ) : (
        <View className="flex-1 gap-4 px-4 py-6">{children}</View>
      )}
    </SafeAreaView>
  );
}
