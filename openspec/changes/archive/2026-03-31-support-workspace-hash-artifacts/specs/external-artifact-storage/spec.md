## ADDED Requirements

### Requirement: Workspace artifacts use hashed external storage
The system SHALL resolve the artifacts directory to `~/.finalrun/workspaces/<workspace-hash>/artifacts`.

#### Scenario: Workspace artifacts resolve under the user-level FinalRun root
- **WHEN** a user runs FinalRun in a resolved workspace
- **THEN** the resolved artifacts directory MUST be built under `workspaces/<workspace-hash>/artifacts` within the user-level `.finalrun` root

### Requirement: Workspace hash is stable for a workspace root
The system SHALL derive the workspace hash from the canonical resolved workspace root rather than from the command invocation directory.

#### Scenario: Nested cwd resolves to the same workspace hash
- **WHEN** a user runs FinalRun from different nested directories inside the same workspace
- **THEN** the system MUST compute the same workspace hash and resolve the same external artifacts directory

#### Scenario: Symlinked entrypoints resolve to the canonical workspace
- **WHEN** a user reaches the same workspace through a symlinked path and through its canonical path
- **THEN** the system MUST resolve both invocations to the same workspace hash

### Requirement: Hashed workspaces publish storage metadata
The system SHALL write workspace metadata for hashed artifact storage.

#### Scenario: Metadata is written for hashed storage
- **WHEN** FinalRun initializes the hashed artifacts directory for a workspace
- **THEN** it MUST write metadata that records the canonical workspace root, workspace hash, and resolved artifacts directory

### Requirement: Driver asset storage remains separate from run artifacts
The system SHALL continue to keep native driver assets outside the workspace-hash artifact tree.

#### Scenario: Hashed artifact storage does not reuse the versioned driver cache
- **WHEN** FinalRun resolves the hashed artifact directory for a workspace
- **THEN** run artifacts MUST NOT be written under `assets/<version>`
- **THEN** native driver asset resolution MUST continue to use the existing driver cache behavior
