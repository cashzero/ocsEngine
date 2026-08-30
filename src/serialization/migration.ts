import { err, ok, type Result, type ValidationIssue } from '../core/index.js';

export type PersistentAggregateKind =
  | 'SCENARIO_DEFINITION'
  | 'MAP_DEFINITION'
  | 'MAP_STATE'
  | 'PIECE_DEFINITION_CATALOG'
  | 'PIECE_RUNTIME_STATE';

export interface SchemaMigration {
  readonly aggregate: PersistentAggregateKind;
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly migrate: (input: unknown) => Result<unknown, readonly ValidationIssue[]>;
}

export const FOUNDATION_MIGRATIONS: readonly SchemaMigration[] = Object.freeze([]);

const migrationIssue = (
  aggregate: PersistentAggregateKind,
  version: number,
): ValidationIssue => ({
  code: 'MISSING_SCHEMA_MIGRATION',
  path: ['schemaVersion'],
  severity: 'ERROR',
  message: `No ${aggregate} migration starts at schema version ${version}.`,
});

/** Applies only explicitly registered one-step migrations; Foundation registers none. */
export const migratePersistentAggregate = (
  aggregate: PersistentAggregateKind,
  input: unknown,
  fromVersion: number,
  targetVersion: number,
  migrations: readonly SchemaMigration[] = FOUNDATION_MIGRATIONS,
): Result<unknown, readonly ValidationIssue[]> => {
  let current = input;
  let version = fromVersion;
  while (version < targetVersion) {
    const migration = migrations.find((candidate) => candidate.aggregate === aggregate
      && candidate.fromVersion === version
      && candidate.toVersion === version + 1);
    if (!migration) return err([migrationIssue(aggregate, version)]);
    const migrated = migration.migrate(current);
    if (!migrated.ok) return migrated;
    current = migrated.value;
    version += 1;
  }
  return version === targetVersion
    ? ok(current)
    : err([migrationIssue(aggregate, version)]);
};
