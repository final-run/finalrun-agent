export type RepoVariableValue = string | number | boolean;

export interface RepoAppConfig {
  name?: string;
  packageName?: string;
  bundleId?: string;
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
