import { Controller, Get, UseGuards } from '@nestjs/common';
import { Can, CurrentRbacSubject, RbacGuard, type RbacSubject } from '@nestarc/rbac';

@Controller('reports')
export class ReportsController {
  @UseGuards(RbacGuard)
  @Can('reports.read', { tenant: 'required' })
  @Get()
  list(@CurrentRbacSubject() subject: RbacSubject) {
    return { reports: [], viewedBy: subject.id };
  }
}

