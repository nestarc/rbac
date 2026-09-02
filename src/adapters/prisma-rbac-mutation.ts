import { randomUUID } from 'node:crypto';
import type { PrismaBindingRecord } from './prisma-rbac.mapper';

export const newPrismaRbacId = (prefix: string): string => `${prefix}_${randomUUID()}`;

export const isActiveBinding = (binding: PrismaBindingRecord, now: Date): boolean =>
  binding.revokedAt === null &&
  (binding.expiresAt === null || binding.expiresAt.getTime() >= now.getTime());

export const sameDate = (left: Date | null, right: Date | null): boolean =>
  left === null ? right === null : right !== null && left.getTime() === right.getTime();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const isPrismaUniqueConstraintError = (error: unknown): boolean =>
  isRecord(error) && error.code === 'P2002';

export const mutationCount = (value: unknown): number =>
  isRecord(value) && typeof value.count === 'number' ? value.count : 0;
