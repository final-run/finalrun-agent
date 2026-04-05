export type VariableValue = string | number | boolean;

export interface AppConfig {
  name?: string;
  packageName?: string;
  bundleId?: string;
}

export interface WebViewportConfig {
  width: number;
  height: number;
}

export interface WebConfig {
  baseUrl: string;
  browser?: 'chromium' | 'firefox' | 'webkit';
  viewport?: WebViewportConfig;
}

export interface EnvironmentConfig {
  app?: AppConfig;
  web?: WebConfig;
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
