import { describe, expect, it } from 'vitest';
import { controllers, registry } from './index';

describe('@jci/doctypes', () => {
  it('registers the core DocTypes, each with a controller', () => {
    expect(registry.all().map((m) => m.name)).toEqual(['Organization', 'RoleAssignment', 'CustomField']);
    for (const m of registry.all()) expect(controllers[m.name], m.name).toBeDefined();
  });
});
