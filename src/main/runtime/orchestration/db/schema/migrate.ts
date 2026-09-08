import { resolveOrchestrationMigrationStartVersion } from '../../orchestration-schema-version-skew'
import { SCHEMA_VERSION } from '../contract-constants'
import type { OrchestrationDb } from '../orchestration-db'
import { applySchemaMigrationsV13ToV29 } from './migrate-v13-v29'
import { applySchemaMigrationsV2ToV12 } from './migrate-v2-v12'

// Why: CREATE TABLE IF NOT EXISTS won't alter existing DBs; migrate in a txn that bumps user_version only on success (atomic all-or-nothing).
export function migrate(this: OrchestrationDb): void {
  const storedVersion = this.db.pragma('user_version', { simple: true }) as number
  const current = resolveOrchestrationMigrationStartVersion(this.db, storedVersion, SCHEMA_VERSION)
  if (current >= SCHEMA_VERSION) {
    return
  }

  this.db.exec('BEGIN IMMEDIATE')
  try {
    applySchemaMigrationsV2ToV12.call(this, current)
    applySchemaMigrationsV13ToV29.call(this, current)
    if (current < 30 && !this.hasColumn('runs', 'kernel_config')) {
      this.db.exec('ALTER TABLE runs ADD COLUMN kernel_config TEXT')
    }
    if (current < 31 && !this.hasColumn('runs', 'kernel_default_max_attempts')) {
      this.db.exec('ALTER TABLE runs ADD COLUMN kernel_default_max_attempts INTEGER')
    }
    if (current < 32 && !this.hasColumn('tasks', 'kernel_acceptance')) {
      this.db.exec('ALTER TABLE tasks ADD COLUMN kernel_acceptance TEXT')
    }
    this.db.exec(`CREATE TRIGGER IF NOT EXISTS trg_kernel_acceptance_task_changed
AFTER UPDATE OF status, spec, deps ON tasks
WHEN OLD.status IS NOT NEW.status OR OLD.spec IS NOT NEW.spec OR OLD.deps IS NOT NEW.deps
BEGIN
  UPDATE tasks SET kernel_acceptance = CASE
    WHEN json_valid(kernel_acceptance) AND json_extract(kernel_acceptance, '$.status') = 'checking'
    THEN json_set(kernel_acceptance, '$.invalidated', 1) ELSE NULL END WHERE id = NEW.id;
END;
CREATE TRIGGER IF NOT EXISTS trg_kernel_acceptance_run_changed
AFTER UPDATE OF kernel_config, consumer_generation, coordinator_handle, coordinator_pane_key ON runs
WHEN OLD.kernel_config IS NOT NEW.kernel_config
  OR OLD.consumer_generation IS NOT NEW.consumer_generation
  OR OLD.coordinator_handle IS NOT NEW.coordinator_handle
  OR OLD.coordinator_pane_key IS NOT NEW.coordinator_pane_key
BEGIN
  UPDATE tasks SET kernel_acceptance = CASE
    WHEN json_valid(kernel_acceptance) AND json_extract(kernel_acceptance, '$.status') = 'checking'
    THEN json_set(kernel_acceptance, '$.invalidated', 1) ELSE NULL END WHERE run_id = NEW.id;
END;

`)
    this.db.pragma(`user_version = ${SCHEMA_VERSION}`)
    this.db.exec('COMMIT')
  } catch (err) {
    this.db.exec('ROLLBACK')
    throw err
  }
}

export type SchemaMigrateMethods = {
  migrate: typeof migrate
}

export function attachSchemaMigrate(ctor: { prototype: object }): void {
  Object.assign(ctor.prototype, {
    migrate
  })
}
