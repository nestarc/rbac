const PERMISSION_RE = /^(?:\*|[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*(?:\.\*)?)$/;

export function normalizePermission(permission: string): string {
  const normalized = permission.trim();
  if (!PERMISSION_RE.test(normalized)) {
    throw new Error(`Invalid permission: ${permission}`);
  }
  return normalized;
}

export function normalizePermissions(permissions: string[]): string[] {
  return [...new Set(permissions.map(normalizePermission))];
}
