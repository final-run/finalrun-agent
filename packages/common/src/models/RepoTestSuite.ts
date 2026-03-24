export interface RepoTestSuite {
  name: string;
  tests: string[];
}

export interface LoadedRepoTestSuite extends RepoTestSuite {
  sourcePath: string;
  relativePath: string;
  suiteId: string;
}
