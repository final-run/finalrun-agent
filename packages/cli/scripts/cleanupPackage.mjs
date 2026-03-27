import { rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const cliDir = resolve(currentDir, '..');

rmSync(resolve(cliDir, 'proto'), { recursive: true, force: true });
rmSync(resolve(cliDir, 'node_modules/@finalrun'), { recursive: true, force: true });
