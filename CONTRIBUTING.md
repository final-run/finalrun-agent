# Contributing

Thanks for contributing to `finalrun-agent`.

## Development Setup

```sh
git clone https://github.com/final-run/finalrun-agent.git
cd finalrun-agent
npm ci
```

Published npm package:

```sh
npm install -g @finalrun/finalrun-agent
```

Build the workspace packages:

```sh
npm run build
```

Run the full test suite:

```sh
npm test
```

Run linting and formatting checks:

```sh
npm run lint
npm run format:check
```

## Monorepo Structure

- `packages/common`: shared models, types, and utilities
- `packages/device-node`: device detection, gRPC communication, and platform-specific device runtime logic
- `packages/goal-executor`: AI planning and action execution
- `packages/cli`: published CLI package
- `packages/report-web`: local report UI
- `drivers/android`: Android driver sources
- `drivers/ios`: iOS simulator driver sources
- `resources/`: generated runtime assets used by local runs
- `proto/`: shared protobuf definitions

## Native Driver Builds

Build both native drivers:

```sh
npm run build:drivers
```

Build a single platform:

```sh
npm run build:drivers:android
npm run build:drivers:ios
```

If your change touches driver setup, installation, or host checks, include the relevant native build and local verification steps in your PR notes.

## Agent-Assisted Contributions

Contributions authored with AI coding agents must follow the [Fab Kit](https://github.com/sahil87/fab-kit) workflow (intake → spec → tasks → apply → review → hydrate → ship → review-PR).

Before opening a PR, the change must clear all four SRAD dimensions — Scope, Reversibility, Alternatives, and Disambiguation — and must reach a **Confident** or **Certain** grade with no Unresolved dimension; any remaining Tentative assumptions must be surfaced in the PR description.

## Pull Requests

- Keep PRs focused and scoped to a single change or release task.
- Update tests and docs when behavior or public usage changes.
- Include the commands you ran to validate the change.
- Call out any platform-specific caveats for Android, iOS, or host tooling.
- Avoid bundling unrelated refactors into release or bug-fix PRs.

## Code Style

- TypeScript is the primary implementation language across the repo.
- Use the repo ESLint and Prettier configuration before opening a PR.
- Prefer small, targeted changes over broad style churn.
