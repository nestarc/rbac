import { RBAC_REQUIREMENTS_METADATA } from '../constants';
import type { RbacRequirement } from '../interfaces';

export const appendRbacRequirementMetadata = (
  requirement: RbacRequirement,
): ClassDecorator & MethodDecorator => {
  const decorator: ClassDecorator & MethodDecorator = (
    target: object,
    _propertyKey?: string | symbol,
    descriptor?: PropertyDescriptor,
  ) => {
    const metadataTarget = (descriptor?.value ?? target) as object;
    const existingRequirements =
      (Reflect.getMetadata(RBAC_REQUIREMENTS_METADATA, metadataTarget) as
        | RbacRequirement[]
        | undefined) ?? [];

    Reflect.defineMetadata(
      RBAC_REQUIREMENTS_METADATA,
      [...existingRequirements, requirement],
      metadataTarget,
    );
  };

  return decorator;
};
