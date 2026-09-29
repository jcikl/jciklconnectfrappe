import { describe, expect, it } from 'vitest';
import { ApiRequestError } from './api';
import { formErrorsFrom, formErrorsFromIssues, withVisibleFields } from './formErrors';

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

  it('handles row-level paths and never reads inherited keys', () => {
    expect(formErrorsFromIssues([{ path: 'dues.0', message: 'Required' }]).fields).toEqual({ dues: 'Row 1: Required' });
    const r = formErrorsFromIssues([{ path: 'constructor', message: 'Bad' }, { path: 'constructor', message: 'Worse' }]);
    expect(r.fields.constructor).toBe('Bad');
    expect(formErrorsFromIssues([{ path: 'x', message: 'm' }]).fields.constructor).toBeUndefined();
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

describe('withVisibleFields', () => {
  const visible = new Set(['title', 'custom.motto']);
  const labels = { title: 'Name', secret: 'Secret', 'custom.hiddenOne': 'Hidden one' };

  it('keeps errors on visible fields untouched', () => {
    const errors = { fields: { title: 'Required' }, form: null };
    expect(withVisibleFields(errors, visible, labels)).toEqual(errors);
  });

  it('moves a bare custom issue into the form message', () => {
    const errors = formErrorsFromIssues([{ path: 'custom', message: 'Required' }]);
    const r = withVisibleFields(errors, visible, labels);
    expect(r.fields).toEqual({});
    expect(r.form).toBe('custom: Required');
  });

  it('moves a hidden-field issue, labelled when the label is known', () => {
    const r = withVisibleFields({ fields: { 'custom.hiddenOne': 'Required' }, form: null }, visible, labels);
    expect(r).toEqual({ fields: {}, form: 'Hidden one: Required' });
  });

  it('splits a mix of visible and hidden issues and joins several hidden messages', () => {
    const r = withVisibleFields({ fields: { title: 'Required', secret: 'Bad', other: 'Worse' }, form: null }, visible, labels);
    expect(r.fields).toEqual({ title: 'Required' });
    expect(r.form).toBe('Secret: Bad; other: Worse');
  });

  it('combines with an existing form message', () => {
    const r = withVisibleFields({ fields: { secret: 'Bad' }, form: 'Unrecognized key' }, visible, labels);
    expect(r.form).toBe('Unrecognized key; Secret: Bad');
  });

  it('never reads inherited keys', () => {
    const r = withVisibleFields({ fields: Object.assign(Object.create(null), { constructor: 'Bad' }) as Record<string, string>, form: null }, new Set(), {});
    expect(r.form).toBe('constructor: Bad');
  });
});

describe('formErrorsFrom fallback', () => {
  it('keeps the server message when an invalid response carries no usable issues', () => {
    const err = new ApiRequestError(422, 'invalid', 'Validation failed', { issues: [] });
    expect(formErrorsFrom(err).form).toBe('Validation failed');
  });
});
