import { DynamicModule, Module } from '@nestjs/common';
import { InMemoryRbacStorage } from '../adapters';
import type { RbacModuleOptions, RbacStorage, RbacSubject } from '../interfaces';
import { RbacModule } from '../rbac.module';

export interface TestRbacModuleOptions
  extends Omit<RbacModuleOptions, 'storage' | 'subjectResolver'> {
  storage?: RbacStorage | undefined;
  subject?: RbacSubject | undefined;
  subjectResolver?: RbacModuleOptions['subjectResolver'] | undefined;
}

@Module({})
export class TestRbacModule {
  static forRoot(options: TestRbacModuleOptions = {}): DynamicModule {
    const { storage, subject, subjectResolver, ...rbacOptions } = options;

    return RbacModule.forRoot({
      ...rbacOptions,
      storage: storage ?? new InMemoryRbacStorage(),
      subjectResolver: subjectResolver ?? (subject !== undefined ? () => subject : undefined),
    });
  }
}
