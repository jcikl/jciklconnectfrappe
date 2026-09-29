import { formErrorsFrom, formErrorsFromIssues, type FormErrors, type QueryDoc } from '@jci/client';
import { useClient, useCustomFields, useDocument } from '@jci/client/react';
import {
  CUSTOM_FIELD_DOCTYPE,
  customFieldFromDoc,
  docTypeLabel,
  formFields,
  formPayload,
  formValues,
  resolveDocAccess,
  sectionsOf,
  visibleFormFields,
  type DocAccess,
  type DocTypeMeta,
  type FormField,
  type FormSection,
  type FormValues,
} from '@jci/core';
import { registry } from '@jci/doctypes';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useDesk } from './DeskContext';
import { useScopeOrgPath } from './useScopeOrgPath';

const CUSTOM_FIELDS = registry.get(CUSTOM_FIELD_DOCTYPE).collection;
const resolveChild = (name: string) => registry.get(name);
const NO_ERRORS: FormErrors = { fields: {}, form: null };

export type DocFormState =
  | { status: 'loading' }
  | { status: 'unavailable'; title: string; message: string }
  | {
      status: 'ready';
      isNew: boolean;
      stored: QueryDoc | null;
      fields: FormField[];
      sections: FormSection[];
      values: FormValues;
      errors: FormErrors;
      submitting: boolean;
      setValue: (key: string, value: unknown) => void;
      submit: (() => void) | undefined;
    };

/** Loads a document (or starts a new one), works out what the caller may see and change, and saves it. */
export function useDocForm(meta: DocTypeMeta, id: string | null): DocFormState {
  const { api } = useClient();
  const { user, scope } = useDesk();
  const router = useRouter();
  const isNew = id === null;
  const label = docTypeLabel(meta);

  const doc = useDocument(isNew ? null : meta.collection, id);
  const scopePath = useScopeOrgPath();
  const customDefs = useCustomFields(CUSTOM_FIELDS, meta.name);
  const [values, setValues] = useState<FormValues | null>(null);
  // The stored data the form was filled from. Edits are diffed against this, not the live doc, so another
  // user's change to a field this user did not touch is never sent back as a revert. undefined until filled.
  const [baseline, setBaseline] = useState<Record<string, unknown> | null | undefined>(undefined);
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const [submitting, setSubmitting] = useState(false);

  const stored = doc.status === 'ready' ? doc.doc : null;
  // Where the document sits: the stored orgPath, or the scope org's for a new one. undefined = still loading.
  const orgPath: string[] | null | undefined = !meta.orgScoped
    ? null
    : isNew
      ? scopePath
      : stored
        ? Array.isArray(stored.data.orgPath)
          ? (stored.data.orgPath as string[])
          : []
        : undefined;

  const built = useMemo((): { access: DocAccess } | { error: string } | null => {
    if (orgPath === undefined || customDefs.status !== 'ready' || (!isNew && !stored)) return null;
    // Custom fields defined at an org on this document's path, like the server loads them.
    const customFields = customDefs.docs
      .map((d) => d.data)
      .filter((d) => orgPath === null || (typeof d.org === 'string' && orgPath.includes(d.org)))
      .map(customFieldFromDoc);
    const ownerPersonId = isNew ? user.personId : typeof stored?.data.ownerPersonId === 'string' ? stored.data.ownerPersonId : null;
    try {
      return { access: resolveDocAccess({ meta, customFields, user, doc: { orgPath, ownerPersonId }, resolveChild }) };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }, [meta, user, orgPath, customDefs, stored, isNew]);

  const access = built && 'access' in built ? built.access : null;
  const fields = useMemo(() => (access ? formFields(access, resolveChild, isNew) : []), [access, isNew]);

  useEffect(() => {
    if (values === null && access) {
      setValues(formValues(fields, stored?.data ?? null));
      setBaseline(stored?.data ?? null);
    }
  }, [values, access, fields, stored]);

  if (doc.status === 'error') return { status: 'unavailable', title: `Can't open this ${label}`, message: doc.message };
  if (!isNew && doc.status === 'ready' && !stored) return { status: 'unavailable', title: 'Not found', message: `There is no ${label} "${id}".` };
  if (customDefs.status === 'error') return { status: 'unavailable', title: 'Could not load the form', message: customDefs.message };
  if (built && 'error' in built) return { status: 'unavailable', title: 'Could not load the form', message: built.error };
  if (isNew && meta.orgScoped && scopePath === null) {
    return { status: 'unavailable', title: 'Not available here', message: `Choose an organisation to create ${label} in.` };
  }
  if (!access || values === null || baseline === undefined) return { status: 'loading' };
  if (isNew && !access.canCreate) return { status: 'unavailable', title: 'Not allowed', message: `You can't create ${label} in this organisation.` };
  if (!isNew && !access.canRead) return { status: 'unavailable', title: 'Not allowed', message: `You can't see this ${label}.` };

  const current = values;
  const before = baseline;
  async function save() {
    const patch = formPayload(fields, current, before);
    if (!isNew && Object.keys(patch).length === 0) {
      setErrors({ fields: {}, form: 'There are no changes to save.' });
      return;
    }
    // The same schema the server uses, so users see its messages before the round trip.
    const check = access!.schema(isNew ? 'create' : 'update').safeParse(patch);
    if (!check.success) {
      setErrors(formErrorsFromIssues(check.error.issues.map((i) => ({ path: i.path.map(String).join('.'), message: i.message }))));
      return;
    }
    setSubmitting(true);
    setErrors(NO_ERRORS);
    try {
      if (id === null) {
        const saved = await api.create(meta.name, { orgId: meta.orgScoped ? scope?.orgId : undefined, data: patch });
        // A creator who cannot read what they made (a create-only role) goes back to the list instead.
        if (access!.canRead) {
          router.replace({ pathname: '/desk/[doctype]/[id]', params: { doctype: meta.name, id: String(saved.id) } });
        } else {
          router.replace({ pathname: '/desk/[doctype]', params: { doctype: meta.name } });
        }
      } else {
        await api.update(meta.name, id, patch);
        // What was just saved is the new baseline (custom fields merge; other keys replace).
        const { custom, ...top } = patch;
        setBaseline((prev) => {
          const base = prev ?? {};
          const prevCustom = typeof base.custom === 'object' && base.custom !== null ? (base.custom as Record<string, unknown>) : {};
          return { ...base, ...top, ...(custom ? { custom: { ...prevCustom, ...(custom as Record<string, unknown>) } } : {}) };
        });
      }
    } catch (err) {
      setErrors(formErrorsFrom(err));
    } finally {
      setSubmitting(false);
    }
  }

  const canSave = isNew ? access.canCreate : access.canWrite;
  return {
    status: 'ready',
    isNew,
    stored,
    fields,
    sections: sectionsOf(visibleFormFields(fields, current)),
    values: current,
    errors,
    submitting,
    setValue: (key, value) => {
      setValues((prev) => ({ ...(prev ?? {}), [key]: value }));
      setErrors((prev) => {
        if (!(key in prev.fields)) return prev;
        const rest = { ...prev.fields };
        delete rest[key];
        return { ...prev, fields: rest };
      });
    },
    submit: canSave
      ? () => {
          void save();
        }
      : undefined,
  };
}
