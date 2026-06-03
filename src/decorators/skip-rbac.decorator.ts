import { SetMetadata } from '@nestjs/common';
import { RBAC_SKIP_METADATA } from '../constants';

export const SkipRbac = (reason?: string) => SetMetadata(RBAC_SKIP_METADATA, { reason });
