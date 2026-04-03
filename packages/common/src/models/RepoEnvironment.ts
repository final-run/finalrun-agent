export type RepoVariableValue = string | number | boolean;

export interface RepoAndroidAppConfig {
  name?: string;
  packageName: string;
}

export interface RepoIOSAppConfig {
  name?: string;
  bundleId: string;
}

export interface RepoAppConfig {
  android?: RepoAndroidAppConfig;
  ios?: RepoIOSAppConfig;
}

export interface RepoEnvironmentConfig {
  app?: RepoAppConfig;
  secrets: Record<string, string>;
  variables: Record<string, RepoVariableValue>;
}

export interface RuntimeBindings {
  secrets: Record<string, string>;
  variables: Record<string, RepoVariableValue>;
}

export interface SecretReference {
  key: string;
  envVar: string;
}
