import type { FieldDef } from '@jci/core';

/** The helper line shown under a field when it has no error. */
export function fieldHint(def: FieldDef): string | undefined {
  const parts: string[] = [];
  if (def.reqd) parts.push('Required');
  switch (def.fieldtype) {
    case 'Date':
      parts.push('YYYY-MM-DD');
      break;
    case 'Datetime':
      parts.push('e.g. 2026-09-29T10:00:00+08:00');
      break;
    case 'AttachImage':
      parts.push('Image URL');
      break;
    case 'JSON':
      parts.push('A JSON object');
      break;
    case 'Currency':
      parts.push('Up to 2 decimal places');
      break;
    case 'Link':
      parts.push(`${def.link} id`);
      break;
    default:
      break;
  }
  return parts.length > 0 ? parts.join(' · ') : undefined;
}
