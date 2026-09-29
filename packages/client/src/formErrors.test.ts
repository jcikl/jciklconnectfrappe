import { describe, expect, it } from 'vitest';
import { ApiRequestError } from './api';
import { formErrorsFrom, formErrorsFromIssues } from './formErrors';

describe('formErrorsFromIssues', () => {
  it('maps issue paths to field keys, keeping the first message per field', () => {
    expect(
      formErrorsFromIssues([
        { path: 'fullName', message: 'Required' },
        { path: 'fullName', message: 'Too long' },
        { path: 'custom.shirtSize', message: 'Invalid option' },
        { path: 'dues.0.year', message: 'Expected number' },
        { path: '', message: 'Unrecognized key: "x"' },
      ]),
    ).toEqual({
      fields: { fullName: 'Required', 'custom.shirtSize': 'Invalid option', dues: 'Row 1, year: Expected number' },
      form: 'Unrecognized key: "x"',
    });
  });
});

describe('formErrorsFrom', () => {
  it('maps a 422 from the API', () => {
    const err = new ApiRequestError(422, 'invalid', 'The level cannot change', { issues: [{ path: 'level', message: 'The level cannot change' }] });
    expect(formErrorsFrom(err)).toEqual({ fields: { level: 'The level cannot change' }, form: null });
  });

  it('falls back to the message when a 422 has no usable issues', () => {
    expect(formErrorsFrom(new ApiRequestError(422, 'invalid', 'Validation failed', { issues: 'nope' }))).toEqual({
      fields: {},
      form: 'Validation failed',
    });
  });

  it('marks locked and duplicate fields', () => {
    const locked = new ApiRequestError(403, 'field_not_writable', 'You cannot change some of these fields', { fields: ['membershipType', 'dues.amount'] });
    expect(formErrorsFrom(locked)).toEqual({
      fields: { membershipType: 'You cannot change this field.', dues: 'You cannot change this field.' },
      form: 'You cannot change some of these fields',
    });
    const dup = new ApiRequestError(409, 'duplicate', 'Another document already uses this value', { fields: ['email'] });
    expect(formErrorsFrom(dup)).toEqual({ fields: { email: 'Another record already uses this value.' }, form: null });
  });

  it('shows other failures on the form', () => {
    expect(formErrorsFrom(new ApiRequestError(403, 'forbidden', 'You cannot edit this Person'))).toEqual({ fields: {}, form: 'You cannot edit this Person' });
    expect(formErrorsFrom(new Error('boom'))).toEqual({ fields: {}, form: 'Something went wrong. Please try again.' });
  });
});
