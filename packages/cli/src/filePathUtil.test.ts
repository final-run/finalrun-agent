import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { CliFilePathUtil } from './filePathUtil.js';

type ExecResult = { stdout: string; stderr: string };

function createTempResourceDir(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'finalrun-cli-'));
  fs.mkdirSync(path.join(root, 'ios'), { recursive: true });
  fs.writeFileSync(path.join(root, 'ios', 'finalrun-ios.zip'), 'zip');
  fs.writeFileSync(path.join(root, 'ios', 'finalrun-ios-test-Runner.zip'), 'zip');
  return root;
}

test('CliFilePathUtil extracts both iOS driver archives into Debug-iphonesimulator', async () => {
  const resourceDir = createTempResourceDir();
  const unzipCalls: Array<readonly string[]> = [];

  try {
    const filePathUtil = new CliFilePathUtil(
      resourceDir,
      (async (_file: string, args: readonly string[]): Promise<ExecResult> => {
        unzipCalls.push(args);
        const zipPath = args[1] as string;
        const targetDir = args[3] as string;

        if (zipPath.endsWith('finalrun-ios-test-Runner.zip')) {
          fs.mkdirSync(path.join(targetDir, 'finalrun-ios-test-Runner.app'), {
            recursive: true,
          });
        } else if (zipPath.endsWith('finalrun-ios.zip')) {
          fs.mkdirSync(path.join(targetDir, 'finalrun-ios.app'), {
            recursive: true,
          });
        }

        return { stdout: '', stderr: '' };
      }),
    );

    const runnerPath = await filePathUtil.getIOSDriverAppPath();

    assert.equal(
      runnerPath,
      path.join(
        resourceDir,
        'ios',
        'Debug-iphonesimulator',
        'finalrun-ios-test-Runner.app',
      ),
    );
    assert.equal(unzipCalls.length, 2);
    assert.deepEqual(
      unzipCalls.map((args) => path.basename(args[1] as string)),
      ['finalrun-ios.zip', 'finalrun-ios-test-Runner.zip'],
    );
  } finally {
    fs.rmSync(resourceDir, { recursive: true, force: true });
  }
});

test('CliFilePathUtil fails clearly when an iOS archive cannot be unzipped', async () => {
  const resourceDir = createTempResourceDir();

  try {
    const filePathUtil = new CliFilePathUtil(
      resourceDir,
      (async (_file: string, args: readonly string[]): Promise<ExecResult> => {
        throw new Error(`unzip failed for ${path.basename(args[1] as string)}`);
      }),
    );

    await assert.rejects(
      () => filePathUtil.ensureIOSAppsAvailable(),
      /Failed to unzip iOS driver archive/,
    );
  } finally {
    fs.rmSync(resourceDir, { recursive: true, force: true });
  }
});
