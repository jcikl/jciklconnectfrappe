import { createRegistry, type ControllerMap } from '@jci/core';
import { CustomField, customFieldController } from './core/customField';
import { Organization, organizationController } from './core/organization';
import { RoleAssignment, roleAssignmentController } from './core/roleAssignment';

export * from './core/customField';
export * from './core/organization';
export * from './core/roleAssignment';
export * from './core/seed';

/** Every DocType in the platform. M4 appends the membership module. */
export const DOCTYPES = [Organization, RoleAssignment, CustomField] as const;
export const registry = createRegistry(DOCTYPES);
export const controllers: ControllerMap = {
  [Organization.name]: organizationController,
  [RoleAssignment.name]: roleAssignmentController,
  [CustomField.name]: customFieldController,
};
