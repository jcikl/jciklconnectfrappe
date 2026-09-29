import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { cn } from '../lib/cn';
import { Text } from '../primitives/Text';
import { FieldMessage } from './FieldMessage';
import { Input } from './Input';
import { ListItem } from './ListItem';
import { PickerSheet } from './PickerSheet';
import { TRIGGER, TRIGGER_BORDER, TRIGGER_ERROR } from './Select';
import { Spinner } from './Spinner';

export interface LinkOption {
  value: string;
  label: string;
  description?: string;
}

export interface LinkPickerProps {
  label: string;
  /** The linked document's id. */
  value: string | null;
  options: readonly LinkOption[];
  onChange: (value: string | null) => void;
  loading?: boolean;
  /** Shown instead of the list when the caller cannot list the target here. */
  unavailable?: string;
  allowClear?: boolean;
  disabled?: boolean;
  hint?: string;
  error?: string;
  testID?: string;
}

export function LinkPicker({
  label,
  value,
  options,
  onChange,
  loading = false,
  unavailable,
  allowClear = false,
  disabled = false,
  hint,
  error,
  testID,
}: LinkPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const current = options.find((o) => o.value === value)?.label ?? value;
  const needle = search.trim().toLowerCase();
  const shown =
    needle === '' ? options : options.filter((o) => [o.label, o.value, o.description ?? ''].some((s) => s.toLowerCase().includes(needle)));
  const close = () => {
    setOpen(false);
    setSearch('');
  };
  const choose = (next: string | null) => {
    close();
    onChange(next);
  };

  return (
    <View className="gap-1">
      <Text variant="label">{label}</Text>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: current ?? 'Choose…' }}
        accessibilityHint="Opens a searchable list"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        className={cn(TRIGGER, error ? TRIGGER_ERROR : TRIGGER_BORDER, disabled && 'opacity-50')}
      >
        <Text tone={current ? 'default' : 'muted'} numberOfLines={1}>
          {current ?? 'Choose…'}
        </Text>
      </Pressable>
      <FieldMessage error={error} hint={hint} />
      <PickerSheet title={label} visible={open} onClose={close}>
        <Input label="Search" value={search} onChangeText={setSearch} autoCapitalize="none" />
        {loading ? (
          <Spinner />
        ) : unavailable ? (
          <Text tone="muted">{unavailable}</Text>
        ) : (
          <ScrollView>
            {allowClear ? <ListItem title="None" selected={value === null} onPress={() => choose(null)} /> : null}
            {shown.length === 0 ? <Text tone="muted">No matches</Text> : null}
            {shown.map((o) => (
              <ListItem
                key={o.value}
                title={o.label}
                subtitle={o.description ?? (o.label === o.value ? undefined : o.value)}
                selected={o.value === value}
                onPress={() => choose(o.value)}
              />
            ))}
          </ScrollView>
        )}
      </PickerSheet>
    </View>
  );
}
