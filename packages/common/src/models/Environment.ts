export type VariableValue = string | number | boolean;

export interface AppConfig {
  name?: string;
  packageName?: string;
  bundleId?: string;
}

export interface EnvironmentConfig {
  app?: AppConfig;
  secrets: Record<string, string>;
  variables: Record<string, VariableValue>;
}

export interface RuntimeBindings {
  secrets: Record<string, string>;
  variables: Record<string, VariableValue>;
}

export interface SecretReference {
  key: string;
  envVar: string;
}
