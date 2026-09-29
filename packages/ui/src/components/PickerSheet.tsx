import type { ReactNode } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { Heading } from '../primitives/Heading';
import { Button } from './Button';

export interface PickerSheetProps {
  title: string;
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}

/** A centred modal panel for choosing a value. Cancel or a tap outside closes it. */
export function PickerSheet({ title, visible, onClose, children }: PickerSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        className="flex-1 items-center justify-center bg-scrim/60 px-4 dark:bg-scrim-dark/60"
        accessibilityLabel="Close the list"
        onPress={onClose}
      >
        <View
          className="max-h-[80%] w-full max-w-md gap-2 rounded-xl border border-border bg-surface p-4 dark:border-border-dark dark:bg-surface-dark"
          onStartShouldSetResponder={() => true}
        >
          <Heading level={3}>{title}</Heading>
          {children}
          <Button label="Cancel" variant="ghost" onPress={onClose} />
        </View>
      </Pressable>
    </Modal>
  );
}
