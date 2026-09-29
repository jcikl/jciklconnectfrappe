/** Firestore collections the platform owns (not DocType collections). Only the server writes them. */
export const USER_ACCESS_COLLECTION = 'userAccess';
export const VERSIONS_COLLECTION = 'versions';
export const SERIES_COLLECTION = 'series';
export const UNIQUE_KEYS_COLLECTION = 'uniqueKeys';
export const SYSTEM_COLLECTIONS = [USER_ACCESS_COLLECTION, VERSIONS_COLLECTION, SERIES_COLLECTION, UNIQUE_KEYS_COLLECTION] as const;

/** Core DocTypes the save pipeline relies on by name. */
export const ORGANIZATION_DOCTYPE = 'Organization';
export const ROLE_ASSIGNMENT_DOCTYPE = 'RoleAssignment';
export const CUSTOM_FIELD_DOCTYPE = 'CustomField';
