import { Controller, Get, UseGuards } from '@nestjs/common';
import { Can, CurrentRbacSubject, RbacGuard, type RbacSubject } from '@nestarc/rbac';
import { ApiKeyAuthGuard } from './api-key-auth.guard';

@Controller('reports')
export class ReportsController {
  @UseGuards(ApiKeyAuthGuard, RbacGuard)
  @Can('reports.read', { tenant: 'required' })
  @Get()
  list(@CurrentRbacSubject() subject: RbacSubject) {
    return { reports: [], apiKeyId: subject.id };
  }
}

