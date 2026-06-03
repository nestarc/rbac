export function assertNonEmptyString(value: string | null | undefined, name: string): string {
  if (!value || value.trim() === '') {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value.trim();
}
