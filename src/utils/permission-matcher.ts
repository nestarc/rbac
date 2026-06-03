import { normalizePermission } from './normalize';

export function matchesPermission(granted: string, required: string): boolean {
  const normalizedGranted = normalizePermission(granted);
  const normalizedRequired = normalizePermission(required);

  if (normalizedGranted === '*') return true;
  if (normalizedGranted === normalizedRequired) return true;
  if (normalizedGranted.endsWith('.*')) {
    const prefix = normalizedGranted.slice(0, -1);
    return normalizedRequired.startsWith(prefix);
  }
  return false;
}
