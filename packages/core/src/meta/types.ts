export const FIELD_TYPES = [
  'Data',
  'Text',
  'Int',
  'Float',
  'Currency',
  'Date',
  'Datetime',
  'Check',
  'Select',
  'Link',
  'Table',
  'AttachImage',
  'JSON',
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const ROLES = [
  'SystemManager',
  'OrgAdmin',
  'MembershipOfficer',
  'Treasurer',
  'BoardMember',
  'Member',
  'Guest',
] as const;
export type RoleName = (typeof ROLES)[number];

/** Server-managed fields present on every stored document. Never declared as DocType fields. */
export const SYSTEM_FIELDS = [
  'id',
  'orgId',
  'orgPath',
  'ownerPersonId',
  'createdAt',
  'createdBy',
  'updatedAt',
  'updatedBy',
] as const;

export interface FieldDef {
  fieldname: string;
  label: string;
  fieldtype: FieldType;
  reqd?: boolean;
  unique?: boolean;
  readOnly?: boolean;
  hidden?: boolean;
  /** Permission level; 0 = normal, higher levels need an explicit DocPerm row. Default 0. */
  permlevel?: number;
  /** Select only. */
  options?: readonly string[];
  /** Link only: target DocType name. */
  link?: string;
  /** Table only: child DocType name (must have isChild: true). */
  childDocType?: string;
  /** Show the field only when another field is truthy / equals a value. */
  dependsOn?: { field: string; equals?: unknown };
  section?: string;
  tab?: string;
  /** Set by mergeCustomFields; value is stored under doc.custom[fieldname]. */
  isCustom?: boolean;
}

export interface DocPerm {
  role: RoleName;
  permlevel?: number;
  read?: boolean;
  write?: boolean;
  create?: boolean;
  delete?: boolean;
  /** Row applies only when doc.ownerPersonId === user.personId. */
  ifOwner?: boolean;
}

export type Naming =
  | { kind: 'autoId' }
  | { kind: 'series'; pattern: string }
  | { kind: 'field'; field: string }
  /** Id = the values of several reqd Data/Select fields joined with '.'. */
  | { kind: 'fields'; fields: readonly string[] };

export interface DocTypeInput {
  name: string;
  module: string;
  /** Firestore collection; required unless isChild. */
  collection?: string;
  naming?: Naming;
  fields: readonly FieldDef[];
  permissions?: readonly DocPerm[];
  titleField?: string;
  searchFields?: readonly string[];
  listFields?: readonly string[];
  isChild?: boolean;
  trackChanges?: boolean;
  orgScoped?: boolean;
}

export interface DocTypeMeta {
  readonly name: string;
  readonly module: string;
  readonly collection: string;
  readonly naming: Naming;
  readonly fields: readonly FieldDef[];
  readonly permissions: readonly DocPerm[];
  readonly titleField: string | null;
  readonly searchFields: readonly string[];
  readonly listFields: readonly string[];
  readonly isChild: boolean;
  readonly trackChanges: boolean;
  readonly orgScoped: boolean;
}
