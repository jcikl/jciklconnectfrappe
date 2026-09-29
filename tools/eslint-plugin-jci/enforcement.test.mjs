import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const eslint = new ESLint({ cwd: root });

async function ruleIds(relPath, code) {
  const [result] = await eslint.lintText(code, { filePath: path.join(root, relPath) });
  return result.messages.map((m) => m.ruleId);
}

const APP_FILE = 'apps/app/app/__fixture__.tsx';

describe('UI enforcement in app code', { timeout: 30000 }, () => {
  it('blocks react-native primitives', async () => {
    const ids = await ruleIds(APP_FILE, "import { View } from 'react-native';\nexport default function F() { return <View />; }\n");
    expect(ids).toContain('no-restricted-imports');
  });

  it('blocks UI libraries and nativewind', async () => {
    expect(await ruleIds(APP_FILE, "import { Home } from 'lucide-react-native';\nexport const x = Home;\n")).toContain('no-restricted-imports');
    expect(await ruleIds(APP_FILE, "import { useColorScheme } from 'nativewind';\nexport const x = useColorScheme;\n")).toContain('no-restricted-imports');
  });

  it('blocks className/style props', async () => {
    const ids = await ruleIds(APP_FILE, "import { Box } from '@jci/ui';\nexport default function F() { return <Box className=\"p-4\" />; }\n");
    expect(ids).toContain('jci/no-raw-styling');
  });

  it('blocks hex colours', async () => {
    expect(await ruleIds(APP_FILE, "export const brand = '#1B3A6B';\n")).toContain('jci/no-hex-colors');
  });

  it('allows composing @jci/ui', async () => {
    const code = "import { Button } from '@jci/ui';\nexport default function F() { return <Button label=\"Go\" onPress={() => {}} />; }\n";
    expect(await ruleIds(APP_FILE, code)).toEqual([]);
  });

  it('allows primitives and className inside packages/ui', async () => {
    const code = "import { View } from 'react-native';\nexport function P() { return <View className=\"p-4\" />; }\n";
    expect(await ruleIds('packages/ui/src/primitives/__fixture__.tsx', code)).toEqual([]);
  });

  const VIEW_JSX = "import { View } from 'react-native';\nexport default function F() { return <View />; }\n";

  it.each([
    ['a .js file importing View', 'apps/app/app/__fixture__.js', VIEW_JSX],
    ['a .jsx file importing View', 'apps/app/app/__fixture__.jsx', VIEW_JSX],
    ['a doctypes .mjs file importing Text', 'packages/doctypes/src/__fixture__.mjs', "import { Text } from 'react-native';\nexport const x = Text;\n"],
    ['a default react-native import', APP_FILE, "import RN from 'react-native';\nexport const x = RN;\n"],
    ['a namespace react-native import', APP_FILE, "import * as RN from 'react-native';\nexport const x = RN;\n"],
    ['a non-allowlisted react-native import', APP_FILE, "import { Animated } from 'react-native';\nexport const x = Animated;\n"],
    ['a react-native re-export', APP_FILE, "export { View } from 'react-native';\n"],
    ['expo-image', APP_FILE, "import { Image } from 'expo-image';\nexport const x = Image;\n"],
    ['react-native-web', APP_FILE, "import { View } from 'react-native-web';\nexport const x = View;\n"],
    ['@expo/ui subpaths', APP_FILE, "import { Button } from '@expo/ui/swift-ui';\nexport const x = Button;\n"],
    ['react-native-gesture-handler', APP_FILE, "import { GestureDetector } from 'react-native-gesture-handler';\nexport const x = GestureDetector;\n"],
    ['safe-area-context subpaths', APP_FILE, "import { SafeAreaView } from 'react-native-safe-area-context/lib';\nexport const x = SafeAreaView;\n"],
    ['a react-native deep import', APP_FILE, "import View from 'react-native/Libraries/Components/View/View';\nexport const x = View;\n"],
    ['a nativewind subpath', APP_FILE, "import { cssInterop } from 'nativewind/dist/runtime';\nexport const x = cssInterop;\n"],
  ])('blocks %s', async (_label, file, code) => {
    expect(await ruleIds(file, code)).toContain('no-restricted-imports');
  });

  it.each([
    ['react-native', "export const load = () => import('react-native');\n"],
    ['react-native (template literal)', 'export const load = () => import(`react-native`);\n'],
    ['expo-image', "export const load = () => import('expo-image');\n"],
    ['a pattern-restricted module', "export const load = () => import('@tanstack/react-query');\n"],
    ['a react-native deep path', "export const load = () => import('react-native/Libraries/Components/View/View');\n"],
  ])('blocks dynamic import of %s', async (_label, code) => {
    expect(await ruleIds(APP_FILE, code)).toContain('jci/no-restricted-dynamic-imports');
  });

  it('allows dynamic import of unrestricted modules', async () => {
    expect(await ruleIds(APP_FILE, "export const load = () => import('expo-router');\n")).toEqual([]);
  });

  it('allows allowlisted react-native APIs', async () => {
    const code = "import { Platform, Linking, useWindowDimensions } from 'react-native';\nexport const x = [Platform, Linking, useWindowDimensions];\n";
    expect(await ruleIds(APP_FILE, code)).toEqual([]);
  });

  it('blocks className passed through an object spread', async () => {
    const code = "import { Box } from '@jci/ui';\nexport default function F() { return <Box {...{ className: 'p-4' }} />; }\n";
    expect(await ruleIds(APP_FILE, code)).toContain('jci/no-raw-styling');
  });

  it('checks .jsx files in packages/ui for hex colours', async () => {
    expect(await ruleIds('packages/ui/src/components/__fixture__.jsx', 'export const C = () => <X color="#FFFFFF" />;\n')).toContain('jci/no-hex-colors');
  });

  it('dev UI gallery shows a Box surface sample and lints clean', async () => {
    const file = path.join(root, 'apps/app/app/(dev)/ui-gallery.tsx');
    const source = readFileSync(file, 'utf8');
    expect(source).toMatch(/<Card title="Surfaces">[\s\S]*<Box surface="muted" padding="md" rounded bordered>[\s\S]*<Text/);
    const [result] = await eslint.lintFiles([file]);
    expect(result.messages).toEqual([]);
  });

  it('still blocks hex colours inside packages/ui source', async () => {
    expect(await ruleIds('packages/ui/src/components/__fixture__.tsx', "export const c = '#FFFFFF';\n")).toContain('jci/no-hex-colors');
  });
});
