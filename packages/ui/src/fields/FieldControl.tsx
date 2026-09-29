import { CheckField } from './CheckField';
import { ChildTable } from './ChildTable';
import { JsonField } from './JsonField';
import { NumberField } from './NumberField';
import { SelectField } from './SelectField';
import { TextField } from './TextField';
import type { FieldControlProps } from './types';

/** The control for one form field, chosen by field type. `renderField` may replace it. */
export function FieldControl(props: FieldControlProps) {
  const replaced = props.renderField?.(props);
  if (replaced !== undefined) return <>{replaced}</>;
  const withId = { ...props, testID: props.testID ?? `field-${props.field.key}` };
  switch (props.field.def.fieldtype) {
    case 'Check':
      return <CheckField {...withId} />;
    case 'Select':
      return <SelectField {...withId} />;
    case 'Table':
      return <ChildTable {...withId} />;
    case 'Int':
    case 'Float':
    case 'Currency':
      return <NumberField {...withId} />;
    case 'JSON':
      return <JsonField {...withId} />;
    default:
      // Data, Text, Date, Datetime, AttachImage, and Link when the app supplies no picker.
      return <TextField {...withId} />;
  }
}
