# Spec Delta: dev-environment (add-project-foundation)

## ADDED Requirements

### Requirement: One-command local environment
The project SHALL provide a local development environment started with a single command (`tilt up`) that brings up the web app, API, PostgreSQL, S3-compatible storage (MinIO), and a local SMTP catcher.

#### Scenario: Fresh developer setup
- **WHEN** a developer clones the repository, installs dependencies, and runs `tilt up`
- **THEN** the web app responds on port 3000, the API health check on port 4000 reports `ok` including database connectivity, and MinIO/Mailpit consoles are reachable

#### Scenario: Live reload
- **WHEN** a developer edits source code in `apps/web` or `apps/api`
- **THEN** the corresponding service reloads automatically without restarting the whole environment

### Requirement: Monorepo structure
The codebase SHALL be organized as a pnpm/Turborepo monorepo with `apps/web` (Next.js), `apps/api` (NestJS), and shared packages for types and tooling configuration.

#### Scenario: Shared types
- **WHEN** a type or enum in `packages/shared` changes
- **THEN** both web and api consume the updated definition through the workspace dependency and typecheck catches mismatches

### Requirement: Database migration workflow
The API SHALL manage the PostgreSQL schema exclusively through committed Prisma migrations.

#### Scenario: Schema change
- **WHEN** the Prisma schema is modified and a migration is generated
- **THEN** the migration file is committed and applying it on a fresh database reproduces the schema exactly

### Requirement: Continuous integration
The repository SHALL run lint, typecheck, tests, and builds for all workspace packages on every pull request and on the main branch.

#### Scenario: Failing check blocks merge
- **WHEN** a pull request introduces a lint, type, test, or build failure
- **THEN** the CI workflow reports failure and the pull request is not mergeable

### Requirement: Environment configuration
All service configuration SHALL be provided via environment variables documented in `.env.example`; secrets SHALL never be committed.

#### Scenario: Missing required variable
- **WHEN** the API starts without a required environment variable
- **THEN** it fails fast at boot with a validation error naming the missing variable
