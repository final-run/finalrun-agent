import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runCheck } from './checkRunner.js';
import {
  ensureWorkspaceDirectories,
  resolveWorkspace,
  validateAppOverride,
} from './workspace.js';

function createTempWorkspace(params?: {
  envYaml?: string;
  envFiles?: Record<string, string>;
  includeEnvDir?: boolean;
  specs?: Record<string, string>;
}): string {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'finalrun-workspace-'));
  const testsDir = path.join(rootDir, '.finalrun', 'tests');
  const envDir = path.join(rootDir, '.finalrun', 'env');
  fs.mkdirSync(testsDir, { recursive: true });
  const includeEnvDir = params?.includeEnvDir ?? true;
  if (includeEnvDir) {
    fs.mkdirSync(envDir, { recursive: true });
  }

  const envFiles = params?.envFiles ?? {
    'dev.yaml': params?.envYaml ?? '{}\n',
  };
  if (includeEnvDir) {
    for (const [fileName, contents] of Object.entries(envFiles)) {
      fs.writeFileSync(path.join(envDir, fileName), contents, 'utf-8');
    }
  }

  const specs = params?.specs ?? {
    'login.yaml': ['name: login', 'steps:', '  - Open the login screen.'].join('\n'),
  };
  for (const [relativePath, contents] of Object.entries(specs)) {
    const targetPath = path.join(testsDir, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, contents, 'utf-8');
  }

  return rootDir;
}

test('runCheck resolves the nearest .finalrun workspace and runtime bindings from a nested cwd', async () => {
  const secretEnvVar = 'FINALRUN_WORKSPACE_EMAIL_SECRET';
  const previousSecret = process.env[secretEnvVar];
  process.env[secretEnvVar] = 'person@example.com';

  const rootDir = createTempWorkspace({
    envYaml: [
      'secrets:',
      `  email: \${${secretEnvVar}}`,
      'variables:',
      '  language: Spanish',
    ].join('\n'),
    specs: {
      'auth/login.yaml': [
        'name: login',
        'steps:',
        '  - Enter ${secrets.email} on the login screen.',
        '  - Verify ${variables.language} is visible after login.',
      ].join('\n'),
    },
  });

  try {
    const nestedCwd = path.join(rootDir, 'packages', 'app');
    fs.mkdirSync(nestedCwd, { recursive: true });

    const result = await runCheck({
      envName: 'dev',
      cwd: nestedCwd,
    });

    assert.equal(result.workspace.rootDir, rootDir);
    assert.equal(result.specs.length, 1);
    assert.equal(result.specs[0]?.relativePath, 'auth/login.yaml');
    assert.equal(result.environment.bindings.variables.language, 'Spanish');
    assert.equal(result.environment.bindings.secrets.email, 'person@example.com');
    assert.equal(result.environment.secretReferences[0]?.envVar, secretEnvVar);
  } finally {
    await fsp.rm(rootDir, { recursive: true, force: true });
    if (previousSecret === undefined) {
      delete process.env[secretEnvVar];
    } else {
      process.env[secretEnvVar] = previousSecret;
    }
  }
});

test('runCheck defaults to dev when envName is omitted and dev.yaml exists', async () => {
  const rootDir = createTempWorkspace({
    envFiles: {
      'dev.yaml': ['variables:', '  language: Spanish'].join('\n'),
      'staging.yaml': ['variables:', '  language: German'].join('\n'),
    },
    specs: {
      'language.yaml': [
        'name: language',
        'steps:',
        '  - Verify ${variables.language} is visible.',
      ].join('\n'),
    },
  });

  try {
    const result = await runCheck({ cwd: rootDir });
    assert.equal(result.environment.envName, 'dev');
    assert.equal(result.environment.bindings.variables.language, 'Spanish');
  } finally {
    await fsp.rm(rootDir, { recursive: true, force: true });
  }
});

test('runCheck succeeds with empty bindings when envName is omitted and .finalrun/env is absent', async () => {
  const rootDir = createTempWorkspace({
    includeEnvDir: false,
    specs: {
      'smoke.yaml': ['name: smoke', 'steps:', '  - Open the app.'].join('\n'),
    },
  });

  try {
    const result = await runCheck({ cwd: rootDir });
    assert.equal(result.environment.envName, 'none');
    assert.deepEqual(result.environment.bindings, { secrets: {}, variables: {} });
  } finally {
    await fsp.rm(rootDir, { recursive: true, force: true });
  }
});

test('runCheck succeeds with empty bindings when envName is omitted and .finalrun/env exists but has no env files', async () => {
  const rootDir = createTempWorkspace({
    envFiles: {},
    specs: {
      'smoke.yaml': ['name: smoke', 'steps:', '  - Open the app.'].join('\n'),
    },
  });

  try {
    const result = await runCheck({ cwd: rootDir });
    assert.equal(result.environment.envName, 'none');
    assert.deepEqual(result.environment.bindings, { secrets: {}, variables: {} });
  } finally {
    await fsp.rm(rootDir, { recursive: true, force: true });
  }
});

test('runCheck falls back to the sole env file when envName is omitted and dev.yaml is absent', async () => {
  const rootDir = createTempWorkspace({
    envFiles: {
      'qa.yaml': ['variables:', '  locale: en-GB'].join('\n'),
    },
    specs: {
      'locale.yaml': [
        'name: locale',
        'steps:',
        '  - Verify ${variables.locale} is selected.',
      ].join('\n'),
    },
  });

  try {
    const result = await runCheck({ cwd: rootDir });
    assert.equal(result.environment.envName, 'qa');
    assert.equal(result.environment.bindings.variables.locale, 'en-GB');
  } finally {
    await fsp.rm(rootDir, { recursive: true, force: true });
  }
});

test('runCheck fails with an actionable ambiguity error when envName is omitted and multiple non-dev env files exist', async () => {
  const rootDir = createTempWorkspace({
    envFiles: {
      'staging.yaml': '{}\n',
      'prod.yaml': '{}\n',
    },
  });

  try {
    await assert.rejects(
      () => runCheck({ cwd: rootDir }),
      /Pass --env <name>\. Available environments: prod, staging/,
    );
  } finally {
    await fsp.rm(rootDir, { recursive: true, force: true });
  }
});

test('runCheck fails with actionable guidance when a spec references env bindings but .finalrun/env is absent', async () => {
  const rootDir = createTempWorkspace({
    includeEnvDir: false,
    specs: {
      'language.yaml': [
        'name: language',
        'steps:',
        '  - Verify ${variables.language} is visible.',
      ].join('\n'),
    },
  });

  try {
    await assert.rejects(
      () => runCheck({ cwd: rootDir }),
      /no environment configuration was resolved.*\$\{variables\.language\}/,
    );
  } finally {
    await fsp.rm(rootDir, { recursive: true, force: true });
  }
});

test('runCheck fails with actionable guidance when --env is explicit but .finalrun/env is absent', async () => {
  const rootDir = createTempWorkspace({
    includeEnvDir: false,
  });

  try {
    await assert.rejects(
      () => runCheck({ envName: 'dev', cwd: rootDir }),
      /Environment "dev" was requested, but .*\/\.finalrun\/env does not exist/,
    );
  } finally {
    await fsp.rm(rootDir, { recursive: true, force: true });
  }
});

test('runCheck rejects legacy env app keys', async () => {
  const rootDir = createTempWorkspace({
    envYaml: ['app:', '  android:', '    packageName: org.wikipedia'].join('\n'),
  });

  try {
    await assert.rejects(
      () => runCheck({ envName: 'dev', cwd: rootDir }),
      /contains unsupported key "app"/,
    );
  } finally {
    await fsp.rm(rootDir, { recursive: true, force: true });
  }
});

test('runCheck accepts empty-string secret environment values when the variable is present', async () => {
  const secretEnvVar = 'FINALRUN_EMPTY_SECRET';
  const previousSecret = process.env[secretEnvVar];
  process.env[secretEnvVar] = '';

  const rootDir = createTempWorkspace({
    envYaml: ['secrets:', `  otp: \${${secretEnvVar}}`].join('\n'),
    specs: {
      'otp.yaml': ['name: otp', 'steps:', '  - Enter ${secrets.otp}.'].join('\n'),
    },
  });

  try {
    const result = await runCheck({ envName: 'dev', cwd: rootDir });
    assert.equal(result.environment.bindings.secrets.otp, '');
  } finally {
    await fsp.rm(rootDir, { recursive: true, force: true });
    if (previousSecret === undefined) {
      delete process.env[secretEnvVar];
    } else {
      process.env[secretEnvVar] = previousSecret;
    }
  }
});

test('runCheck rejects selectors that escape .finalrun/tests', async () => {
  const rootDir = createTempWorkspace();

  try {
    await assert.rejects(
      () =>
        runCheck({
          envName: 'dev',
          cwd: rootDir,
          selector: '../outside.yaml',
        }),
      /Spec selector must stay inside/,
    );
  } finally {
    await fsp.rm(rootDir, { recursive: true, force: true });
  }
});

test('runCheck rejects specs with empty steps arrays', async () => {
  const rootDir = createTempWorkspace({
    specs: {
      'broken.yaml': ['name: broken', 'steps: []'].join('\n'),
    },
  });

  try {
    await assert.rejects(
      () => runCheck({ envName: 'dev', cwd: rootDir }),
      /must define a non-empty steps array/,
    );
  } finally {
    await fsp.rm(rootDir, { recursive: true, force: true });
  }
});

test('validateAppOverride accepts .apk and .app bundles and rejects unsupported paths', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'finalrun-app-override-'));
  const apkPath = path.join(tempDir, 'app.apk');
  const apkDirPath = path.join(tempDir, 'fake.apk');
  const iosAppPath = path.join(tempDir, 'My.app');
  const zipPath = path.join(tempDir, 'archive.zip');

  fs.writeFileSync(apkPath, 'apk', 'utf-8');
  fs.mkdirSync(apkDirPath, { recursive: true });
  fs.mkdirSync(iosAppPath, { recursive: true });
  fs.writeFileSync(zipPath, 'zip', 'utf-8');

  try {
    const androidOverride = await validateAppOverride(apkPath, 'android');
    const iosOverride = await validateAppOverride(iosAppPath, 'ios');

    assert.equal(androidOverride.inferredPlatform, 'android');
    assert.equal(iosOverride.inferredPlatform, 'ios');

    await assert.rejects(
      () => validateAppOverride(zipPath),
      /Unsupported --app override/,
    );
    await assert.rejects(
      () => validateAppOverride(apkDirPath, 'android'),
      /must point to an APK file/,
    );
  } finally {
    await fsp.rm(tempDir, { recursive: true, force: true });
  }
});

test('ensureWorkspaceDirectories creates .finalrun/artifacts after resolving the workspace', async () => {
  const rootDir = createTempWorkspace();

  try {
    const nestedCwd = path.join(rootDir, 'apps', 'mobile');
    fs.mkdirSync(nestedCwd, { recursive: true });

    const workspace = await resolveWorkspace(nestedCwd);
    await ensureWorkspaceDirectories(workspace);

    const artifactsStat = await fsp.stat(workspace.artifactsDir);
    assert.equal(artifactsStat.isDirectory(), true);
  } finally {
    await fsp.rm(rootDir, { recursive: true, force: true });
  }
});
