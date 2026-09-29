import type { FormField } from '@jci/core';
import type { ReactNode } from 'react';

export interface FieldControlProps {
  field: FormField;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
  /** Lets the app replace a control, e.g. with a data-backed Link picker. Return undefined to use the default. */
  renderField?: RenderField;
  testID?: string;
}

export type RenderField = (props: FieldControlProps) => ReactNode | undefined;
