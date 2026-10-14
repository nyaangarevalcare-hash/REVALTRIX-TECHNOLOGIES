import { cp, mkdir, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const databaseRequire = createRequire(import.meta.url);
const apiRequire = createRequire(new URL('../../apps/api/package.json', import.meta.url));

function generatedClientPath(packageRequire) {
  const packagePath = packageRequire.resolve('@prisma/client');
  return resolve(dirname(packagePath), '../../.prisma/client');
}

const source = await realpath(generatedClientPath(databaseRequire));
const destination = generatedClientPath(apiRequire);

if (source !== destination) {
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true, force: true });
  console.log(`Synced generated Prisma Client to ${destination}`);
}
