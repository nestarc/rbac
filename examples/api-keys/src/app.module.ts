import { Module } from '@nestjs/common';
import { InMemoryRbacStorage, RbacModule } from '@nestarc/rbac';
import { createApiKeySubjectResolver } from '@nestarc/rbac/integrations/api-keys';
import { ApiKeyAuthGuard } from './api-key-auth.guard';
import { ReportsController } from './reports.controller';

@Module({
  imports: [
    RbacModule.forRoot({
      storage: new InMemoryRbacStorage(),
      subjectResolver: createApiKeySubjectResolver(),
      tenant: { requiredByDefault: true },
    }),
  ],
  controllers: [ReportsController],
  providers: [ApiKeyAuthGuard],
})
export class AppModule {}

