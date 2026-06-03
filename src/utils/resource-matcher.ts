import type { RbacResourceRef } from '../interfaces';

export interface RbacStoredResourceRef {
  resourceType?: string | null | undefined;
  resourceId?: string | null | undefined;
}

function storedResource(resource: RbacResourceRef | RbacStoredResourceRef | undefined): {
  type: string | null;
  id: string | null;
} {
  if (!resource) return { type: null, id: null };
  if ('type' in resource) return { type: resource.type, id: resource.id };

  return {
    type: resource.resourceType ?? null,
    id: resource.resourceId ?? null,
  };
}

export function matchesResource(
  granted: RbacResourceRef | RbacStoredResourceRef | undefined,
  required: RbacResourceRef | undefined,
): boolean {
  const grantedResource = storedResource(granted);

  if (!required) {
    return grantedResource.type === null && grantedResource.id === null;
  }

  return (
    (grantedResource.type === null && grantedResource.id === null) ||
    (grantedResource.type === required.type && grantedResource.id === required.id)
  );
}
