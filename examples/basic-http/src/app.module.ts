import { Module } from '@nestjs/common';
import { InMemoryRbacStorage, RbacModule } from '@nestarc/rbac';
import { ReportsController } from './reports.controller';

@Module({
  imports: [
    RbacModule.forRoot({
      storage: new InMemoryRbacStorage(),
      tenant: { requiredByDefault: true },
    }),
  ],
  controllers: [ReportsController],
})
export class AppModule {}

