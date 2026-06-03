import { createParamDecorator } from '@nestjs/common';
import { RBAC_SUBJECT_REQUEST_KEY } from '../constants';
import type { ExecutionContext } from '@nestjs/common';
import type { RbacSubject } from '../interfaces';

export const CurrentRbacSubject = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RbacSubject | undefined => {
    const request = context
      .switchToHttp()
      .getRequest<Record<typeof RBAC_SUBJECT_REQUEST_KEY, RbacSubject | undefined>>();

    return request[RBAC_SUBJECT_REQUEST_KEY];
  },
);
