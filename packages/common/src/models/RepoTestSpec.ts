export interface RepoTestSpec {
  name: string;
  description?: string;
  setup: string[];
  steps: string[];
  assertions: string[];
}

export interface LoadedRepoTestSpec extends RepoTestSpec {
  sourcePath: string;
  relativePath: string;
  specId: string;
}
