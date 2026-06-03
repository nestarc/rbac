import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

type ApiKeyContext = {
  keyId: string;
  tenantId: string;
  ownerId: string;
};

type ApiKeyRequest = {
  headers?: Record<string, string | string[] | undefined>;
  apiKeyContext?: ApiKeyContext;
};

const keys = new Map<string, ApiKeyContext>([
  ['secret-report-key', { keyId: 'key_1', tenantId: 'tenant_1', ownerId: 'user_1' }],
]);

@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<ApiKeyRequest>();
    const rawHeader = request.headers?.['x-api-key'];
    const apiKey = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    const apiKeyContext = apiKey ? keys.get(apiKey) : undefined;

    if (!apiKeyContext) {
      throw new UnauthorizedException('Invalid API key');
    }

    request.apiKeyContext = apiKeyContext;

    return true;
  }
}

