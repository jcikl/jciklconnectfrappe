import { ApiRequestError } from './api';

export interface FormErrors {
  /** Messages keyed by form field key ('name' or 'custom.name'); child-row issues land on their table. */
  fields: Record<string, string>;
  form: string | null;
}

export interface Issue {
  path: string;
  message: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const isIssue = (v: unknown): v is Issue => isRecord(v) && typeof v.path === 'string' && typeof v.message === 'string';

/** The form field an issue path belongs to: 'custom.x' stays, 'dues.0.year' belongs to 'dues'. */
function fieldOf(path: string): string {
  const parts = path.split('.');
  return parts[0] === 'custom' && parts.length > 1 ? `custom.${parts[1]}` : parts[0]!;
}

function rowPrefix(path: string): string {
  const m = /^[^.]+\.(\d+)(?:\.([^.]+))?/.exec(path);
  if (!m || path.startsWith('custom.')) return '';
  return m[2] ? `Row ${Number(m[1]) + 1}, ${m[2]}: ` : `Row ${Number(m[1]) + 1}: `;
}

export function formErrorsFromIssues(issues: readonly Issue[]): FormErrors {
  const fields: Record<string, string> = Object.create(null) as Record<string, string>;
  let form: string | null = null;
  for (const issue of issues) {
    if (issue.path === '') {
      form ??= issue.message;
      continue;
    }
    fields[fieldOf(issue.path)] ??= `${rowPrefix(issue.path)}${issue.message}`;
  }
  return { fields, form };
}

function markFields(keys: unknown, message: string): Record<string, string> {
  const fields: Record<string, string> = Object.create(null) as Record<string, string>;
  if (Array.isArray(keys)) for (const k of keys) if (typeof k === 'string') fields[fieldOf(k)] = message;
  return fields;
}

/** Messages for a failed save, from the API's error shape. */
export function formErrorsFrom(err: unknown): FormErrors {
  if (!(err instanceof ApiRequestError)) return { fields: {}, form: 'Something went wrong. Please try again.' };
  const details = isRecord(err.details) ? err.details : {};
  if (err.code === 'invalid' && Array.isArray(details.issues)) {
    const mapped = formErrorsFromIssues(details.issues.filter(isIssue));
    const hasFieldErrors = Object.keys(mapped.fields).length > 0;
    return { fields: mapped.fields, form: mapped.form ?? (hasFieldErrors ? null : err.message) };
  }
  if (err.code === 'field_not_writable') return { fields: markFields(details.fields, 'You cannot change this field.'), form: err.message };
  if (err.code === 'duplicate') return { fields: markFields(details.fields, 'Another record already uses this value.'), form: null };
  return { fields: {}, form: err.message };
}
