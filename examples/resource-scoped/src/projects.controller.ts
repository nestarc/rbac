import { Controller, Post, UseGuards } from '@nestjs/common';
import { Can, RbacGuard } from '@nestarc/rbac';

@Controller('projects')
export class ProjectsController {
  @UseGuards(RbacGuard)
  @Can('project.member.invite', {
    resource: { type: 'project', idParam: 'projectId' },
    tenant: 'required',
  })
  @Post(':projectId/invitations')
  invite() {
    return { ok: true };
  }
}
