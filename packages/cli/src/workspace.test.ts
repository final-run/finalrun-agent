import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runCheck, SUITE_SELECTOR_CONFLICT_ERROR } from './checkRunner.js';
import {
  ensureWorkspaceDirectories,
  resolveWorkspace,
  validateAppOverride,
} from './workspace.js';

function createTempWorkspace(params?: {
  envYaml?: string;
  envFiles?: Record<string, string>;
  includeEnvDir?: boolean;
  includeSuitesDir?: boolean;
  configYaml?: string;
  specs?: Record<string, string>;
  suites?: Record<string, string>;
}): string {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'finalrun-workspace-'));
  const testsDir = path.join(rootDir, '.finalrun', 'tests');
  const envDir = path.join(rootDir, '.finalrun', 'env');
  const suitesDir = path.join(rootDir, '.finalrun', 'suites');
  fs.mkdirSync(testsDir, { recursive: true });
  const includeEnvDir = params?.includeEnvDir ?? true;
  if (includeEnvDir) {
    fs.mkdirSync(envDir, { recursive: true });
  }
  const suites = params?.suites ?? {};
  const includeSuitesDir = params?.includeSuitesDir ?? Object.keys(suites).length > 0;
  if (includeSuitesDir) {
    fs.mkdirSync(suitesDir, { recursive: true });
  }

  if (params?.configYaml !== undefined) {
    fs.writeFileSync(
      path.join(rootDir, '.finalrun', 'config.yaml'),
      params.configYaml,
      'utf-8',
    );
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

  for (const [relativePath, contents] of Object.entries(suites)) {
    const targetPath = path.join(suitesDir, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, contents, 'utf-8');
  }

  return rootDir;
}

async function withTempHome<T>(callback: (homeDir: string) => Promise<T>): Promise<T> {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'finalrun-workspace-home-'));
  const previousHome = process.env.HOME;

  process.env.HOME = homeDir;
  try {
    return await callback(homeDir);
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    await fsp.rm(homeDir, { recursive: true, force: true });
  }
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

test('runCheck uses .finalrun/config.yaml env when --env is omitted', async () => {
  const rootDir = createTempWorkspace({
    configYaml: 'env: staging\n',
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
    assert.equal(result.environment.envName, 'staging');
    assert.equal(result.environment.bindings.variables.language, 'German');
  } finally {
    await fsp.rm(rootDir, { recursive: true, force: true });
  }
});

test('runCheck prefers explicit envName over .finalrun/config.yaml env', async () => {
  const rootDir = createTempWorkspace({
    configYaml: 'env: staging\n',
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
    const result = await runCheck({ cwd: rootDir, envName: 'dev' });
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

test('runCheck preserves the missing-env error when .finalrun/config.yaml points to a missing env file', async () => {
  const rootDir = createTempWorkspace({
    configYaml: 'env: staging\n',
    envFiles: {
      'dev.yaml': '{}\n',
    },
  });

  try {
    await assert.rejects(
      () => runCheck({ cwd: rootDir }),
      /Environment "staging" was not found .* Available environments: dev/,
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

test('runCheck rejects specs with preconditions keys', async () => {
  const rootDir = createTempWorkspace({
    specs: {
      'login.yaml': [
        'name: login',
        'preconditions:',
        '  - App is installed.',
        'steps:',
        '  - Open the login screen.',
      ].join('\n'),
    },
  });

  try {
    await assert.rejects(
      () => runCheck({ envName: 'dev', cwd: rootDir }),
      /contains unsupported key "preconditions"/,
    );
  } finally {
    await fsp.rm(rootDir, { recursive: true, force: true });
  }
});

test('runCheck ignores invalid model formats in .finalrun/config.yaml', async () => {
  const rootDir = createTempWorkspace({
    configYaml: 'model: "not-a-provider-model"\n',
  });

  try {
    const result = await runCheck({ cwd: rootDir });
    assert.equal(result.environment.envName, 'dev');
    assert.equal(result.specs.length, 1);
  } finally {
    await fsp.rm(rootDir, { recursive: true, force: true });
  }
});

test('runCheck ignores unsupported model providers in .finalrun/config.yaml', async () => {
  const rootDir = createTempWorkspace({
    configYaml: 'model: "bedrock/claude"\n',
  });

  try {
    const result = await runCheck({ cwd: rootDir });
    assert.equal(result.environment.envName, 'dev');
    assert.equal(result.specs.length, 1);
  } finally {
    await fsp.rm(rootDir, { recursive: true, force: true });
  }
});

test('runCheck rejects invalid YAML in .finalrun/config.yaml', async () => {
  const rootDir = createTempWorkspace({
    configYaml: 'env: [dev\n',
  });

  try {
    await assert.rejects(
      () => runCheck({ cwd: rootDir }),
      /Invalid YAML in .*\/\.finalrun\/config\.yaml:/,
    );
  } finally {
    await fsp.rm(rootDir, { recursive: true, force: true });
  }
});

test('runCheck rejects unknown keys in .finalrun/config.yaml', async () => {
  const rootDir = createTempWorkspace({
    configYaml: ['env: dev', 'region: us-west-2'].join('\n'),
  });

  try {
    await assert.rejects(
      () => runCheck({ cwd: rootDir }),
      /config\.yaml contains unsupported key "region"\. Supported keys: env, model\./,
    );
  } finally {
    await fsp.rm(rootDir, { recursive: true, force: true });
  }
});

test('runCheck rejects non-string env values in .finalrun/config.yaml', async () => {
  const rootDir = createTempWorkspace({
    configYaml: 'env: 123\n',
  });

  try {
    await assert.rejects(
      () => runCheck({ cwd: rootDir }),
      /config\.yaml env must be a string\./,
    );
  } finally {
    await fsp.rm(rootDir, { recursive: true, force: true });
  }
});

test('runCheck rejects non-string model values in .finalrun/config.yaml', async () => {
  const rootDir = createTempWorkspace({
    configYaml: 'model: 123\n',
  });

  try {
    await assert.rejects(
      () => runCheck({ cwd: rootDir }),
      /config\.yaml model must be a string\./,
    );
  } finally {
    await fsp.rm(rootDir, { recursive: true, force: true });
  }
});

test('runCheck rejects empty env values in .finalrun/config.yaml', async () => {
  const rootDir = createTempWorkspace({
    configYaml: 'env: "   "\n',
  });

  try {
    await assert.rejects(
      () => runCheck({ cwd: rootDir }),
      /config\.yaml env must not be empty\./,
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
          selectors: ['../outside.yaml'],
        }),
      /Spec selector must stay inside/,
    );
  } finally {
    await fsp.rm(rootDir, { recursive: true, force: true });
  }
});

test('runCheck expands multiple selectors with comma splitting and de-duplicates first-seen matches', async () => {
  const rootDir = createTempWorkspace({
    specs: {
      'smoke.yaml': ['name: smoke', 'steps:', '  - Open the app.'].join('\n'),
      'auth/login.yaml': ['name: login', 'steps:', '  - Open login.'].join('\n'),
      'auth/settings.yaml': ['name: settings', 'steps:', '  - Open settings.'].join('\n'),
      'auth/profile/edit.yaml': ['name: edit', 'steps:', '  - Edit profile.'].join('\n'),
      'auth/profile/view.yaml': ['name: view', 'steps:', '  - View profile.'].join('\n'),
    },
  });

  try {
    const result = await runCheck({
      envName: 'dev',
      cwd: rootDir,
      selectors: ['smoke.yaml,auth/login.yaml', 'auth/profile', 'auth/**'],
    });

    assert.deepEqual(
      result.specs.map((spec) => spec.relativePath),
      [
        'smoke.yaml',
        'auth/login.yaml',
        'auth/profile/edit.yaml',
        'auth/profile/view.yaml',
        'auth/settings.yaml',
      ],
    );
  } finally {
    await fsp.rm(rootDir, { recursive: true, force: true });
  }
});

test('runCheck treats raw directory selectors as recursive and * as shallow while ** is recursive', async () => {
  const rootDir = createTempWorkspace({
    specs: {
      'auth/login.yaml': ['name: login', 'steps:', '  - Open login.'].join('\n'),
      'auth/profile/edit.yaml': ['name: edit', 'steps:', '  - Edit profile.'].join('\n'),
      'auth/profile/view.yaml': ['name: view', 'steps:', '  - View profile.'].join('\n'),
      'auth/settings.yaml': ['name: settings', 'steps:', '  - Open settings.'].join('\n'),
    },
  });

  try {
    const recursiveDirectory = await runCheck({
      envName: 'dev',
      cwd: rootDir,
      selectors: ['auth'],
    });
    const shallowGlob = await runCheck({
      envName: 'dev',
      cwd: rootDir,
      selectors: ['auth/*'],
    });
    const recursiveGlob = await runCheck({
      envName: 'dev',
      cwd: rootDir,
      selectors: ['auth/**'],
    });

    assert.deepEqual(
      recursiveDirectory.specs.map((spec) => spec.relativePath),
      [
        'auth/login.yaml',
        'auth/profile/edit.yaml',
        'auth/profile/view.yaml',
        'auth/settings.yaml',
      ],
    );
    assert.deepEqual(
      shallowGlob.specs.map((spec) => spec.relativePath),
      ['auth/login.yaml', 'auth/settings.yaml'],
    );
    assert.deepEqual(
      recursiveGlob.specs.map((spec) => spec.relativePath),
      [
        'auth/login.yaml',
        'auth/profile/edit.yaml',
        'auth/profile/view.yaml',
        'auth/settings.yaml',
      ],
    );
  } finally {
    await fsp.rm(rootDir, { recursive: true, force: true });
  }
});

test('runCheck resolves suite manifests into an ordered shared spec list', async () => {
  const rootDir = createTempWorkspace({
    specs: {
      'smoke.yaml': ['name: smoke', 'steps:', '  - Open the app.'].join('\n'),
      'auth/login.yaml': ['name: login', 'steps:', '  - Open login.'].join('\n'),
      'auth/settings.yaml': ['name: settings', 'steps:', '  - Open settings.'].join('\n'),
    },
    suites: {
      'login_suite.yaml': [
        'name: login suite',
        'description: Covers login entry points.',
        'tests:',
        '  - smoke.yaml',
        '  - auth/**',
      ].join('\n'),
    },
  });

  try {
    const result = await runCheck({
      envName: 'dev',
      cwd: rootDir,
      suitePath: 'login_suite.yaml',
    });

    assert.deepEqual(result.target, {
      type: 'suite',
      suiteId: 'login_suite',
      suiteName: 'login suite',
      suitePath: 'login_suite.yaml',
    });
    assert.equal(result.suite?.name, 'login suite');
    assert.equal(result.suite?.description, 'Covers login entry points.');
    assert.deepEqual(
      result.specs.map((spec) => spec.relativePath),
      ['smoke.yaml', 'auth/login.yaml', 'auth/settings.yaml'],
    );
  } finally {
    await fsp.rm(rootDir, { recursive: true, force: true });
  }
});

test('runCheck rejects mixing --suite with positional selectors', async () => {
  const rootDir = createTempWorkspace({
    suites: {
      'login_suite.yaml': ['name: login suite', 'tests:', '  - login.yaml'].join('\n'),
    },
  });

  try {
    await assert.rejects(
      () =>
        runCheck({
          envName: 'dev',
          cwd: rootDir,
          suitePath: 'login_suite.yaml',
          selectors: ['login.yaml'],
        }),
      new RegExp(SUITE_SELECTOR_CONFLICT_ERROR.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    );
  } finally {
    await fsp.rm(rootDir, { recursive: true, force: true });
  }
});

test('runCheck rejects suite manifests with empty tests arrays', async () => {
  const rootDir = createTempWorkspace({
    suites: {
      'empty_suite.yaml': ['name: empty suite', 'tests: []'].join('\n'),
    },
  });

  try {
    await assert.rejects(
      () =>
        runCheck({
          envName: 'dev',
          cwd: rootDir,
          suitePath: 'empty_suite.yaml',
        }),
      /must define a non-empty tests array/,
    );
  } finally {
    await fsp.rm(rootDir, { recursive: true, force: true });
  }
});

test('runCheck rejects suite manifests with non-string descriptions', async () => {
  const rootDir = createTempWorkspace({
    suites: {
      'invalid_suite.yaml': [
        'name: invalid suite',
        'description: 42',
        'tests:',
        '  - login.yaml',
      ].join('\n'),
    },
  });

  try {
    await assert.rejects(
      () =>
        runCheck({
          envName: 'dev',
          cwd: rootDir,
          suitePath: 'invalid_suite.yaml',
        }),
      /description must be a string when provided/,
    );
  } finally {
    await fsp.rm(rootDir, { recursive: true, force: true });
  }
});

test('runCheck requires at least one selector when requireSelection is enabled', async () => {
  const rootDir = createTempWorkspace();

  try {
    await assert.rejects(
      () =>
        runCheck({
          envName: 'dev',
          cwd: rootDir,
          requireSelection: true,
        }),
      /At least one test selector is required/,
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

test('ensureWorkspaceDirectories creates a hashed external artifacts directory and metadata', async () => {
  await withTempHome(async (homeDir) => {
    const rootDir = createTempWorkspace();

    try {
      const nestedCwd = path.join(rootDir, 'apps', 'mobile');
      fs.mkdirSync(nestedCwd, { recursive: true });

      const workspace = await resolveWorkspace(nestedCwd);
      const rootWorkspace = await resolveWorkspace(rootDir);
      await ensureWorkspaceDirectories(workspace);

      assert.equal(workspace.artifactsDir, rootWorkspace.artifactsDir);
      assert.equal(
        workspace.artifactsDir.startsWith(path.join(homeDir, '.finalrun', 'workspaces') + path.sep),
        true,
      );

      const artifactsStat = await fsp.stat(workspace.artifactsDir);
      assert.equal(artifactsStat.isDirectory(), true);

      const metadataPath = path.join(workspace.artifactsDir, '..', 'workspace.json');
      const metadata = JSON.parse(await fsp.readFile(metadataPath, 'utf-8')) as {
        workspaceRoot: string;
        canonicalWorkspaceRoot: string;
        workspaceHash: string;
        artifactsDir: string;
      };
      const canonicalRootDir = await fsp.realpath(rootDir);
      assert.equal(metadata.workspaceRoot, rootDir);
      assert.equal(metadata.canonicalWorkspaceRoot, canonicalRootDir);
      assert.equal(metadata.artifactsDir, workspace.artifactsDir);
      assert.equal(metadata.workspaceHash.length, 16);
    } finally {
      await fsp.rm(rootDir, { recursive: true, force: true });
    }
  });
});
