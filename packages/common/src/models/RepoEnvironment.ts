export type RepoVariableValue = string | number | boolean;

export interface RepoEnvironmentConfig {
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
