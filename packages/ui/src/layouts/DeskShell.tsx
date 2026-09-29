import { useState, type ReactNode } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { ListItem } from '../components/ListItem';
import { Heading } from '../primitives/Heading';

export interface DeskNavItem {
  key: string;
  label: string;
}

export interface DeskShellProps {
  title: string;
  nav: readonly DeskNavItem[];
  activeKey?: string;
  onNavigate: (key: string) => void;
  /** Shown under the navigation, e.g. the organisation picker and sign-out. */
  sidebarFooter?: ReactNode;
  children: ReactNode;
  testID?: string;
}

/** Windows at least this wide get the sidebar layout. */
export const DESK_WIDE_MIN = 768;

export function deskLayout(width: number): 'wide' | 'narrow' {
  return width >= DESK_WIDE_MIN ? 'wide' : 'narrow';
}

/** Admin layout: sidebar navigation on wide screens, a top bar with a menu on narrow ones. */
export function DeskShell({ title, nav, activeKey, onNavigate, sidebarFooter, children, testID }: DeskShellProps) {
  const { width } = useWindowDimensions();
  const [menuOpen, setMenuOpen] = useState(false);

  const navigate = (key: string) => {
    setMenuOpen(false);
    onNavigate(key);
  };

  const navigation = (
    <ScrollView className="flex-1" contentContainerClassName="gap-1 p-3" accessibilityLabel="Main navigation">
      {nav.map((item) => (
        <ListItem key={item.key} testID={`nav-${item.key}`} title={item.label} selected={item.key === activeKey} onPress={() => navigate(item.key)} />
      ))}
      {sidebarFooter ? <View className="mt-4 gap-2 border-t border-border pt-4 dark:border-border-dark">{sidebarFooter}</View> : null}
    </ScrollView>
  );

  if (deskLayout(width) === 'wide') {
    return (
      <SafeAreaView testID={testID} className="flex-1 flex-row bg-background dark:bg-background-dark">
        <View className="w-64 border-r border-border bg-surface dark:border-border-dark dark:bg-surface-dark">
          <View className="px-4 pb-2 pt-4">
            <Heading level={3}>{title}</Heading>
          </View>
          {navigation}
        </View>
        <View className="flex-1">{children}</View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView testID={testID} className="flex-1 bg-background dark:bg-background-dark">
      <View className="min-h-12 flex-row items-center justify-between border-b border-border bg-surface px-4 dark:border-border-dark dark:bg-surface-dark">
        <Heading level={3}>{title}</Heading>
        <Button
          label={menuOpen ? 'Close' : 'Menu'}
          variant="ghost"
          size="sm"
          accessibilityHint={menuOpen ? 'Hides the navigation' : 'Shows the navigation'}
          onPress={() => setMenuOpen((open) => !open)}
        />
      </View>
      {menuOpen ? <View className="flex-1 bg-surface dark:bg-surface-dark">{navigation}</View> : <View className="flex-1">{children}</View>}
    </SafeAreaView>
  );
}
