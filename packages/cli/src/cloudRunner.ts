import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import AdmZip from 'adm-zip';
import { Logger } from '@finalrun/common';
import { runCheck } from './checkRunner.js';

const FINALRUN_CLOUD_URL = process.env['FINALRUN_CLOUD_URL'] || 'https://cloud.finalrun.io';

export interface CloudRunnerOptions {
  selectors: string[];
  suitePath?: string;
  envName?: string;
  platform?: string;
  appPath?: string;
}

export async function runCloud(options: CloudRunnerOptions): Promise<void> {
  Logger.i('Preparing cloud run...');

  // 1. Validate specs locally (fast fail before upload)
  const checked = await runCheck({
    selectors: options.selectors,
    suitePath: options.suitePath,
    envName: options.envName,
    platform: options.platform,
    requireSelection: true,
  });

  // 2. Collect resolved file paths
  const filesToZip: Array<{ absolutePath: string; relativePath: string }> = [];

  // Add suite file if present
  if (checked.suite) {
    filesToZip.push({
      absolutePath: checked.suite.sourcePath,
      relativePath: path.join('suites', checked.suite.relativePath),
    });
  }

  // Add test files
  for (const spec of checked.specs) {
    filesToZip.push({
      absolutePath: spec.sourcePath,
      relativePath: path.join('tests', spec.relativePath),
    });
  }

  // Add config.yaml if present
  const configPath = path.join(process.cwd(), '.finalrun', 'config.yaml');
  if (fs.existsSync(configPath)) {
    filesToZip.push({
      absolutePath: configPath,
      relativePath: 'config.yaml',
    });
  }

  // Add env files if present
  const envDir = path.join(process.cwd(), '.finalrun', 'env');
  if (fs.existsSync(envDir)) {
    const envFiles = fs.readdirSync(envDir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
    for (const envFile of envFiles) {
      filesToZip.push({
        absolutePath: path.join(envDir, envFile),
        relativePath: path.join('env', envFile),
      });
    }
  }

  // 3. Create zip with only selected files
  Logger.i(`Zipping ${filesToZip.length} file(s)...`);
  const zip = new AdmZip();
  for (const file of filesToZip) {
    const dir = path.dirname(file.relativePath);
    zip.addLocalFile(file.absolutePath, dir);
  }

  const zipPath = path.join(os.tmpdir(), `finalrun-cloud-${Date.now()}.zip`);
  zip.writeZip(zipPath);

  try {
    // 4. Upload to cloud service
    const command = `finalrun cloud ${options.selectors.join(' ')}`;
    Logger.i(`Submitting ${checked.specs.length} test(s) to cloud...`);

    const formData = new FormData();
    const zipBuffer = fs.readFileSync(zipPath);
    formData.append('file', new Blob([zipBuffer]), 'specs.zip');
    formData.append('command', command);
    formData.append('selectors', JSON.stringify(options.selectors));
    if (options.suitePath) {
      formData.append('suitePath', options.suitePath);
    }
    if (options.envName) {
      formData.append('envName', options.envName);
    }
    if (options.platform) {
      formData.append('platform', options.platform);
    }
    if (options.appPath) {
      const appBuffer = fs.readFileSync(options.appPath);
      const appFileName = path.basename(options.appPath);
      formData.append('appFile', new Blob([appBuffer]), appFileName);
      Logger.i(`Uploading app: ${appFileName}`);
    }

    const url = `${FINALRUN_CLOUD_URL}/api/v1/execute`;
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Cloud service returned ${response.status}: ${body}`);
    }

    const result = (await response.json()) as { success: boolean; results?: unknown[] };
    if (result.success) {
      console.log(`\n\x1b[32m✔ Cloud run completed successfully\x1b[0m`);
    } else {
      console.log(`\n\x1b[31m✖ Cloud run failed\x1b[0m`);
    }

    console.log(JSON.stringify(result, null, 2));
  } finally {
    // Clean up temp zip
    try {
      fs.unlinkSync(zipPath);
    } catch {
      // ignore cleanup errors
    }
  }
}
