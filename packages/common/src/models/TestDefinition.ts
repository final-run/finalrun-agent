/** A single test authored as a YAML file under .finalrun/tests/ */
export interface TestDefinition {
  // --- Always present (authored in YAML) ---
  name: string;
  description?: string;
  steps: string[];
  expected_state: string[];

  // --- Populated after loading from disk ---
  /** Absolute path to the source YAML file. Set by the test loader. */
  sourcePath?: string;
  /** Path relative to .finalrun/tests/. Set by the test loader. */
  relativePath?: string;
  /** Sanitized unique ID derived from the file path. Set by the test loader. */
  testId?: string;

  // --- Populated at run time for run manifest input ---
  /** Absolute path within the workspace. Set at run time. */
  workspaceSourcePath?: string;
  /** Path to the YAML snapshot taken at run time. */
  snapshotYamlPath?: string;
  /** Path to the JSON snapshot taken at run time. */
  snapshotJsonPath?: string;
  /** Variables and secrets referenced by this test. Set at run time. */
  bindingReferences?: BindingReference;
}

export interface BindingReference {
  variables: string[];
  secrets: string[];
}
