import { DynamicModule, Module, type Provider } from '@nestjs/common';
import { RBAC_OPTIONS, RBAC_STORAGE } from './constants';
import { RbacGuard } from './rbac.guard';
import { RbacService } from './rbac.service';
import type { RbacModuleAsyncOptions, RbacModuleOptions } from './interfaces';

const rbacStorageProvider: Provider = {
  provide: RBAC_STORAGE,
  useFactory: (options: RbacModuleOptions) => options.storage,
  inject: [RBAC_OPTIONS],
};

const rbacExports = [RBAC_OPTIONS, RBAC_STORAGE, RbacService, RbacGuard];

@Module({})
export class RbacModule {
  static forRoot(options: RbacModuleOptions): DynamicModule {
    return {
      module: RbacModule,
      providers: [
        { provide: RBAC_OPTIONS, useValue: options },
        rbacStorageProvider,
        RbacService,
        RbacGuard,
      ],
      exports: rbacExports,
    };
  }

  static forRootAsync(options: RbacModuleAsyncOptions): DynamicModule {
    return {
      module: RbacModule,
      ...(options.imports !== undefined ? { imports: options.imports } : {}),
      providers: [
        {
          provide: RBAC_OPTIONS,
          useFactory: options.useFactory,
          inject: options.inject ?? [],
        },
        rbacStorageProvider,
        RbacService,
        RbacGuard,
      ],
      exports: rbacExports,
    };
  }
}
