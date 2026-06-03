import { Module } from '@nestjs/common';
import { InMemoryRbacStorage, RbacModule } from '@nestarc/rbac';
import { ProjectsController } from './projects.controller';

@Module({
  imports: [
    RbacModule.forRoot({
      storage: new InMemoryRbacStorage(),
      tenant: { requiredByDefault: true },
    }),
  ],
  controllers: [ProjectsController],
})
export class AppModule {}

