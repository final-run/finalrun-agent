// FinalRun root CA — generate once per host and cache under ~/.finalrun/ca/.
// Used by the mockttp proxy to sign per-host leaf certs on the fly.

import { promises as fsp } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { generateCACertificate } from 'mockttp';

export interface FinalRunCAFiles {
  /** Directory holding the CA files. */
  dir: string;
  /** PEM-encoded certificate (used by mockttp + pushed to the device). */
  certPath: string;
  /** PEM-encoded private key (used by mockttp to sign leaves). */
  keyPath: string;
  /** DER-encoded certificate (what Android's Settings UI expects). */
  certDerPath: string;
}

export interface LoadedCA {
  cert: string;
  key: string;
  files: FinalRunCAFiles;
  generated: boolean;
}

function defaultCaDir(): string {
  return path.join(os.homedir(), '.finalrun', 'ca');
}

function caFiles(dir: string): FinalRunCAFiles {
  return {
    dir,
    certPath: path.join(dir, 'root.pem'),
    keyPath: path.join(dir, 'root.key'),
    certDerPath: path.join(dir, 'root.crt'),
  };
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

function pemToDer(pem: string): Buffer {
  const body = pem
    .replace(/-----BEGIN CERTIFICATE-----/, '')
    .replace(/-----END CERTIFICATE-----/, '')
    .replace(/\s+/g, '');
  return Buffer.from(body, 'base64');
}

/**
 * Load the FinalRun CA from disk, generating it if absent.
 * Returns the PEM-encoded cert + key usable directly by mockttp.
 */
export async function loadOrGenerateCA(dir: string = defaultCaDir()): Promise<LoadedCA> {
  const files = caFiles(dir);
  await fsp.mkdir(files.dir, { recursive: true });

  if ((await fileExists(files.certPath)) && (await fileExists(files.keyPath))) {
    const cert = await fsp.readFile(files.certPath, 'utf8');
    const key = await fsp.readFile(files.keyPath, 'utf8');
    if (!(await fileExists(files.certDerPath))) {
      await fsp.writeFile(files.certDerPath, pemToDer(cert));
    }
    return { cert, key, files, generated: false };
  }

  const { cert, key } = await generateCACertificate({
    subject: {
      commonName: 'FinalRun Local CA',
      organizationName: 'FinalRun',
    },
    bits: 2048,
  });

  await fsp.writeFile(files.certPath, cert, { mode: 0o600 });
  await fsp.writeFile(files.keyPath, key, { mode: 0o600 });
  await fsp.writeFile(files.certDerPath, pemToDer(cert));

  return { cert, key, files, generated: true };
}
