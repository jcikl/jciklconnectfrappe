import { useColorScheme } from 'nativewind';

export function useTheme() {
  const { colorScheme, setColorScheme, toggleColorScheme } = useColorScheme();
  return {
    scheme: (colorScheme ?? 'light') as 'light' | 'dark',
    setScheme: setColorScheme as (scheme: 'light' | 'dark' | 'system') => void,
    toggle: toggleColorScheme,
  };
}
