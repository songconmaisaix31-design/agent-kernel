/** Version 1 lexical contract, independent of Orca runtime and the filesystem. */
export interface PlanTask {
  key: string;
  owner: string;
  writePaths: string[];
  dependsOn: string[];
  acceptance: string[];
  escalateWhen: string[];
}

export interface Plan {
  schemaVersion: 1;
  objective: string;
  nonGoals: string[];
  baseCommit: string;
  tasks: PlanTask[];
}

export type PlanErrorCode =
  | 'invalid_field' | 'invalid_path' | 'duplicate_key' | 'duplicate_entry'
  | 'unknown_dependency' | 'dependency_cycle' | 'path_case_ambiguity'
  | 'path_kind_conflict' | 'parallel_write_overlap';

export interface PlanValidationError {
  code: PlanErrorCode;
  /** Input location, e.g. tasks[1].writePaths[0]. */
  path: string;
  message: string;
  relatedPath?: string;
}

export type PlanValidationResult =
  | { ok: true; errors: []; plan: Plan }
  | { ok: false; errors: PlanValidationError[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value === value.trim();

/**
 * Portable lexical subset: relative exact files or directory prefixes ending in /.
 * No normalization/expansion: reject empty/dot segments, glob syntax, Windows
 * aliases/devices, non-ASCII names and trailing dots/spaces. ASCII mixed case is
 * allowed only when every reference to the same segment uses identical spelling.
 * Non-ASCII paths need a separately reviewed filesystem case/normalization policy.
 */
function validWritePath(value: string): boolean {
  const body = value.endsWith('/') ? value.slice(0, -1) : value;
  return body.split('/').every(segment =>
    segment.length > 0 && segment !== '.' && segment !== '..' &&
    segment === segment.trim() && !segment.endsWith('.') &&
    !/[^\x20-\x7e]|[\\:*?\[\]{}()!<>"|~]/.test(segment) &&
    !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(segment));
}

/**
 * Validate JSON-like plan data without mutating it; return a detached typed copy.
 * Required arrays may be empty except tasks, writePaths and acceptance.
 * baseCommit checks full nonzero SHA-1/SHA-256 syntax only, NOT commit existence.
 * dependsOn is a declaration of ordering, NOT proof of completed dependencies.
 * This is NOT a dispatch firewall: trusted approval, actual repository/commit,
 * symlinks/junctions/hard links, on-disk case aliases, candidate diffs and executable
 * acceptance checks must be verified at the eventual Orca runtime boundary.
 * Unknown object fields are ignored; no runtime state or authority is created.
 */
export function validatePlan(input: unknown): PlanValidationResult {
  const errors: PlanValidationError[] = [];
  const fail = (code: PlanErrorCode, path: string, message: string, relatedPath?: string) => {
    errors.push({ code, path, message, ...(relatedPath ? { relatedPath } : {}) });
  };
  const field = (record: Record<string, unknown>, key: string): unknown =>
    Object.hasOwn(record, key) ? record[key] : undefined;
  const text = (value: unknown, path: string): string => {
    if (isText(value)) return value;
    fail('invalid_field', path, 'Expected a nonempty string without surrounding whitespace.');
    return '';
  };
  const strings = (value: unknown, path: string, nonempty = false): string[] => {
    if (!Array.isArray(value) || (nonempty && value.length === 0)) {
      fail('invalid_field', path, `Expected ${nonempty ? 'a nonempty' : 'an'} array of nonempty strings.`);
      return [];
    }
    return Array.from(value, (entry, i) => text(entry, `${path}[${i}]`));
  };
  const unique = (values: string[], path: string) => {
    const seen = new Map<string, number>();
    values.forEach((value, i) => {
      if (seen.has(value)) {
        fail('duplicate_entry', `${path}[${i}]`, 'Duplicate entry.', `${path}[${seen.get(value)}]`);
      } else seen.set(value, i);
    });
  };

  if (!isRecord(input)) {
    fail('invalid_field', '$', 'Expected a plan object.');
    return { ok: false, errors };
  }
  if (field(input, 'schemaVersion') !== 1) fail('invalid_field', 'schemaVersion', 'Expected schemaVersion 1.');
  const objective = text(field(input, 'objective'), 'objective');
  const nonGoals = strings(field(input, 'nonGoals'), 'nonGoals');
  const baseCommit = text(field(input, 'baseCommit'), 'baseCommit');
  if (baseCommit && (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(baseCommit) || /^0+$/.test(baseCommit))) {
    fail('invalid_field', 'baseCommit', 'Expected a full nonzero 40- or 64-digit hexadecimal commit SHA.');
  }
  const tasks: PlanTask[] = [];
  const taskInput = field(input, 'tasks');
  if (!Array.isArray(taskInput) || taskInput.length === 0) {
    fail('invalid_field', 'tasks', 'Expected at least one task.');
  } else {
    // Array.from also visits holes instead of silently accepting sparse arrays.
    Array.from(taskInput).forEach((task, i) => {
      const at = `tasks[${i}]`;
      if (!isRecord(task)) {
        fail('invalid_field', at, 'Expected a task object.');
        return;
      }
      tasks.push({
        key: text(field(task, 'key'), `${at}.key`),
        owner: text(field(task, 'owner'), `${at}.owner`),
        writePaths: strings(field(task, 'writePaths'), `${at}.writePaths`, true),
        dependsOn: strings(field(task, 'dependsOn'), `${at}.dependsOn`),
        acceptance: strings(field(task, 'acceptance'), `${at}.acceptance`, true),
        escalateWhen: strings(field(task, 'escalateWhen'), `${at}.escalateWhen`),
      });
    });
  }
  // Never analyze a partially parsed graph (indices and keys may be invalid).
  if (errors.length) return { ok: false, errors };

  const byKey = new Map<string, number>();
  const pathSegments = new Map<string, { spelling: string; directory: boolean; at: string }>();
  tasks.forEach((task, i) => {
    if (byKey.has(task.key)) {
      fail('duplicate_key', `tasks[${i}].key`, 'Task keys must be unique.', `tasks[${byKey.get(task.key)}].key`);
    } else byKey.set(task.key, i);
    unique(task.dependsOn, `tasks[${i}].dependsOn`);
    unique(task.writePaths, `tasks[${i}].writePaths`);
    task.writePaths.forEach((value, j) => {
      const at = `tasks[${i}].writePaths[${j}]`;
      if (!validWritePath(value)) {
        fail('invalid_path', at, 'Expected a portable relative exact file or trailing-slash directory prefix.');
        return;
      }
      const directory = value.endsWith('/');
      const segments = (directory ? value.slice(0, -1) : value).split('/');
      segments.forEach((_, n) => {
        const spelling = segments.slice(0, n + 1).join('/');
        const key = spelling.toLowerCase();
        const isDirectory = n < segments.length - 1 || directory;
        const prior = pathSegments.get(key);
        if (prior && prior.spelling !== spelling) {
          fail('path_case_ambiguity', at, 'Path segments use inconsistent casing.', prior.at);
        }
        if (prior && prior.directory !== isDirectory) {
          fail('path_kind_conflict', at, 'The same path cannot be both an exact file and a directory.', prior.at);
        }
        if (!prior) pathSegments.set(key, { spelling, directory: isDirectory, at });
      });
    });
  });
  tasks.forEach((task, i) => task.dependsOn.forEach((key, j) => {
    if (!byKey.has(key)) fail('unknown_dependency', `tasks[${i}].dependsOn[${j}]`, `Unknown task key: ${key}.`);
  }));
  if (errors.length) return { ok: false, errors };

  // Kahn traversal computes transitive ancestors without recursive stack limits.
  const ancestors = tasks.map(() => new Set<number>());
  const dependents = tasks.map(() => [] as number[]);
  const remaining = tasks.map(task => task.dependsOn.length);
  tasks.forEach((task, i) => task.dependsOn.forEach(key => dependents[byKey.get(key)!].push(i)));
  const ready = tasks.flatMap((_, i) => remaining[i] === 0 ? [i] : []);
  for (let cursor = 0; cursor < ready.length; cursor++) {
    const current = ready[cursor];
    for (const dependent of dependents[current]) {
      ancestors[dependent].add(current);
      for (const ancestor of ancestors[current]) ancestors[dependent].add(ancestor);
      if (--remaining[dependent] === 0) ready.push(dependent);
    }
  }
  if (ready.length !== tasks.length) {
    fail('dependency_cycle', 'tasks', 'Dependencies contain a cycle.');
    return { ok: false, errors };
  }
  const overlaps = (a: string, b: string) => a === b ||
    (a.endsWith('/') && b.startsWith(a)) || (b.endsWith('/') && a.startsWith(b));
  for (let i = 0; i < tasks.length; i++) {
    for (let j = i + 1; j < tasks.length; j++) {
      if (ancestors[i].has(j) || ancestors[j].has(i)) continue;
      tasks[i].writePaths.forEach((a, ai) => tasks[j].writePaths.forEach((b, bi) => {
        if (overlaps(a, b)) fail('parallel_write_overlap', `tasks[${j}].writePaths[${bi}]`,
          `Unordered tasks ${tasks[i].key} and ${tasks[j].key} have overlapping write paths.`,
          `tasks[${i}].writePaths[${ai}]`);
      }));
    }
  }
  return errors.length ? { ok: false, errors } : {
    ok: true, errors: [], plan: { schemaVersion: 1, objective, nonGoals, baseCommit, tasks },
  };
}
