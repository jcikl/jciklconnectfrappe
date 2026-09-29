import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { cn } from '../lib/cn';
import { Text } from '../primitives/Text';
import { FieldMessage } from './FieldMessage';
import { ListItem } from './ListItem';
import { PickerSheet } from './PickerSheet';
import { TRIGGER, TRIGGER_BORDER, TRIGGER_ERROR } from './triggerStyles';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  label: string;
  value: string | null;
  options: readonly SelectOption[];
  onChange: (value: string | null) => void;
  placeholder?: string;
  /** Offer a "None" choice that clears the value. */
  allowClear?: boolean;
  disabled?: boolean;
  hint?: string;
  error?: string;
  testID?: string;
}

export function Select({ label, value, options, onChange, placeholder = 'Choose…', allowClear = false, disabled = false, hint, error, testID }: SelectProps) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value)?.label ?? value;
  const choose = (next: string | null) => {
    setOpen(false);
    onChange(next);
  };
  return (
    <View className="gap-1">
      <Text variant="label">{label}</Text>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: current ?? placeholder }}
        accessibilityHint="Opens the list of choices"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        className={cn(TRIGGER, error ? TRIGGER_ERROR : TRIGGER_BORDER, disabled && 'opacity-50')}
      >
        <Text tone={current ? 'default' : 'muted'} numberOfLines={1}>
          {current ?? placeholder}
        </Text>
      </Pressable>
      <FieldMessage error={error} hint={hint} />
      <PickerSheet title={label} visible={open} onClose={() => setOpen(false)}>
        <ScrollView>
          {allowClear ? <ListItem title="None" selected={value === null} onPress={() => choose(null)} /> : null}
          {options.map((o) => (
            <ListItem
              key={o.value}
              testID={testID ? `${testID}-${o.value}` : undefined}
              title={o.label}
              selected={o.value === value}
              onPress={() => choose(o.value)}
            />
          ))}
        </ScrollView>
      </PickerSheet>
    </View>
  );
}
