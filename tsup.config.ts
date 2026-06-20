import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    prisma: 'src/prisma.ts',
    testing: 'src/testing.ts',
    'integrations/tenancy': 'src/integrations/tenancy.ts',
    'integrations/api-keys': 'src/integrations/api-keys.ts',
    'integrations/audit-log': 'src/integrations/audit-log.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  external: [
    '@nestjs/common',
    '@nestjs/core',
    'reflect-metadata',
    'rxjs',
    '@prisma/client',
    'prisma',
    '@nestarc/tenancy',
    '@nestarc/api-keys',
    '@nestarc/audit-log',
  ],
});
