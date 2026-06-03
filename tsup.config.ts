import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    prisma: 'src/prisma.ts',
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
  ],
});
