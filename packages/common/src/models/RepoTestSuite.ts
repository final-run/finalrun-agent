export interface RepoTestSuite {
  name: string;
  description?: string;
  tests: string[];
}

export interface LoadedRepoTestSuite extends RepoTestSuite {
  sourcePath: string;
  relativePath: string;
  suiteId: string;
}
