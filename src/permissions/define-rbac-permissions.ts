import { RbacConfigError } from '../errors';

export interface RbacPermissionMetadata {
  description?: string | undefined;
  owner?: string | undefined;
  risk?: string | undefined;
}

export interface DefineRbacPermissionsOptions {
  validateDuplicates?: boolean | undefined;
}

type PermissionMetadataKeys = keyof RbacPermissionMetadata;

type IsPermissionMetadata<T> = T extends object
  ? Extract<keyof T, PermissionMetadataKeys> extends never
    ? false
    : true
  : false;

type PermissionValueUnion<T> = T extends string
  ? T
  : T extends object
    ? {
        [K in keyof T]: IsPermissionMetadata<T[K]> extends true
          ? Extract<K, string>
          : PermissionValueUnion<T[K]>;
      }[keyof T]
    : never;

type PermissionShape<T> = {
  readonly [K in keyof T]: T[K] extends string
    ? T[K]
    : IsPermissionMetadata<T[K]> extends true
      ? Extract<K, string>
      : PermissionShape<T[K]>;
};

type PermissionMetadataMap<T> = {
  readonly [K in Extract<keyof T, string> as IsPermissionMetadata<T[K]> extends true
    ? K
    : never]: T[K] extends RbacPermissionMetadata ? T[K] : never;
};

export type RbacPermissionContract<T> = PermissionShape<T> & {
  readonly $permission: PermissionValueUnion<T>;
  readonly $permissions: PermissionValueUnion<T>[];
  readonly $metadata: PermissionMetadataMap<T>;
};

type PermissionDefinition = Record<string, unknown>;

const metadataKeys = new Set<string>(['description', 'owner', 'risk']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPermissionMetadata(value: unknown): value is RbacPermissionMetadata {
  return isRecord(value) && Object.keys(value).some((key) => metadataKeys.has(key));
}

function addHiddenProperty<T extends object, K extends PropertyKey, V>(
  target: T,
  key: K,
  value: V,
): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: false,
    configurable: false,
    writable: false,
  });
}

export function defineRbacPermissions<const T extends PermissionDefinition>(
  definition: T,
  options: DefineRbacPermissionsOptions = {},
): RbacPermissionContract<T> {
  const permissions: string[] = [];
  const metadata: Record<string, RbacPermissionMetadata> = {};

  const visit = (node: PermissionDefinition): Record<string, unknown> => {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(node)) {
      if (typeof value === 'string') {
        result[key] = value;
        permissions.push(value);
        continue;
      }

      if (isPermissionMetadata(value)) {
        result[key] = key;
        permissions.push(key);
        metadata[key] = { ...value };
        continue;
      }

      if (isRecord(value)) {
        result[key] = visit(value);
        continue;
      }

      throw new RbacConfigError({
        reason: 'Permission contract values must be strings, metadata objects, or nested objects',
        key,
      });
    }

    return result;
  };

  const contract = visit(definition) as RbacPermissionContract<T>;

  if (options.validateDuplicates === true) {
    const seen = new Set<string>();
    const duplicate = permissions.find((permission) => {
      if (seen.has(permission)) return true;
      seen.add(permission);
      return false;
    });

    if (duplicate !== undefined) {
      throw new RbacConfigError({
        reason: 'Duplicate RBAC permission value',
        permission: duplicate,
      });
    }
  }

  addHiddenProperty(contract, '$permission', undefined as PermissionValueUnion<T>);
  addHiddenProperty(contract, '$permissions', [...permissions] as PermissionValueUnion<T>[]);
  addHiddenProperty(contract, '$metadata', metadata as PermissionMetadataMap<T>);

  return contract;
}
