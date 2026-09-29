import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

export interface PageProps {
  children: ReactNode;
  /** Default true. Set false for pages that manage their own scrolling. */
  scroll?: boolean;
  testID?: string;
}

/** Content area inside a layout (DeskShell) that already handles the safe area and background. */
export function Page({ children, scroll = true, testID }: PageProps) {
  if (!scroll) {
    return (
      <View testID={testID} className="flex-1 gap-4 px-4 py-6">
        {children}
      </View>
    );
  }
  return (
    <ScrollView testID={testID} className="flex-1" contentContainerClassName="gap-4 px-4 py-6" keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}
