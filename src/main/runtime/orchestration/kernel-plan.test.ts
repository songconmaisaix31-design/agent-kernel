import assert from 'node:assert/strict';
import { test } from 'vitest';
import { validatePlan } from './kernel-plan';
import type { Plan, PlanTask, PlanErrorCode } from './kernel-plan';

const baseCommit = '14c174adf1b3dd373a83b437467d43f60f2a6073';
const task = (key = 'A', writePaths = ['src/a/'], dependsOn: string[] = []): PlanTask => ({
  key, owner: `worker-${key}`, writePaths, dependsOn,
  acceptance: ['Run the approved candidate tests successfully.'],
  escalateWhen: ['A change outside writePaths is required.'],
});
const plan = (tasks = [task()]): Plan => ({
  schemaVersion: 1, objective: 'Implement the bounded change.',
  nonGoals: ['Do not replace the runtime.'], baseCommit, tasks,
});
function rejects(input: unknown, code: PlanErrorCode, path?: string) {
  const result = validatePlan(input);
  assert.equal(result.ok, false, 'invalid plan must fail');
  assert.ok(result.errors.some(error => error.code === code && (path === undefined || error.path === path)),
    JSON.stringify(result));
  assert.equal('plan' in result, false, 'failed validation must not expose an accepted plan');
  return result.errors;
}
function accepts(input: unknown) {
  const result = validatePlan(input);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.deepEqual(result.errors, []);
  assert.ok(result.ok);
  return result.plan;
}

test('single task is valid and yields a detached typed copy without mutation', () => {
  const input = plan();
  const before = structuredClone(input);
  const result = accepts(input);
  assert.deepEqual(result, before);
  assert.deepEqual(input, before);
  result.tasks[0].writePaths.push('tests/a/');
  result.nonGoals.push('Another non-goal');
  assert.deepEqual(input, before);
});

test('independent tasks accept exact files, directories, root files and consistent mixed case', () => {
  accepts(plan([task('A', ['src/Feature/a.ts', 'README.md']), task('B', ['src/Feature/b.ts', 'tests/'])]));
});

test('required descriptive arrays may be empty; acceptance and writePaths may not', () => {
  const input = plan();
  input.nonGoals = [];
  input.tasks[0].escalateWhen = [];
  accepts(input);
});

for (const value of [null, undefined, 1, true, '', [], () => ({}), new Date()]) {
  test(`reject non-plan input ${String(value)}`, () => rejects(value, 'invalid_field'));
}
for (const key of ['schemaVersion', 'objective', 'nonGoals', 'baseCommit', 'tasks']) {
  test(`reject missing plan field ${key}`, () => {
    const input: Record<string, unknown> = { ...plan() };
    delete input[key];
    rejects(input, 'invalid_field', key);
  });
}
for (const key of ['key', 'owner', 'writePaths', 'dependsOn', 'acceptance', 'escalateWhen']) {
  test(`reject missing task field ${key}`, () => {
    const item: Record<string, unknown> = { ...task() };
    delete item[key];
    rejects({ ...plan(), tasks: [item] }, 'invalid_field', `tasks[0].${key}`);
  });
}
for (const [key, values] of Object.entries({
  schemaVersion: [0, 2, '1', null], objective: ['', '  ', 7, ' padded '],
  nonGoals: [null, 'none', ['']], tasks: [null, {}, [], [null], new Array(1)],
  baseCommit: ['14c174a', 'main', 'g'.repeat(40), '0'.repeat(40), '0'.repeat(64), 'a'.repeat(39), 'a'.repeat(41), 'a'.repeat(63)],
})) {
  values.forEach((value, i) => test(`reject invalid plan ${key} case ${i}`, () =>
    rejects({ ...plan(), [key]: value }, 'invalid_field')));
}
for (const [key, values] of Object.entries({
  key: ['', ' A ', 1], owner: ['', '\n', false], writePaths: [[], null, ['']],
  dependsOn: [null, 'A', [1]], acceptance: [[], ['  '], [true], 'npm test'],
  escalateWhen: [null, [0], ['']],
})) {
  values.forEach((value, i) => test(`reject invalid task ${key} case ${i}`, () =>
    rejects({ ...plan(), tasks: [{ ...task(), [key]: value }] }, 'invalid_field')));
}
test('accept full SHA-1 and SHA-256 syntax; existence is explicitly not checked', () => {
  accepts({ ...plan(), baseCommit: baseCommit.toUpperCase() });
  accepts({ ...plan(), baseCommit: 'abc12345'.repeat(8) });
});
test('inherited required fields and sparse string arrays do not satisfy the contract', () => {
  rejects(Object.create(plan()), 'invalid_field', 'schemaVersion');
  rejects({ ...plan(), nonGoals: new Array(1) }, 'invalid_field', 'nonGoals[0]');
});

for (const path of [
  '/', '/src/a.ts', '//server/share/file', 'C:/src/a.ts', 'C:src/a.ts',
  'src\\a.ts', '\\server\\share', '../a.ts', 'src/../a.ts', './a.ts',
  'src/./a.ts', 'src//a.ts', 'src//', '.', '..', 'src/**', 'src/*.ts',
  'src/a?.ts', 'src/[ab].ts', 'src/{a,b}.ts', 'src/!(a).ts', 'src/@(a).ts',
  'src/a\u0000.ts', 'src/a\nb.ts', 'src/a:b.ts', 'src/a|b.ts', 'src/<a>.ts',
  'src/a"b.ts', 'src/a.', 'src/a /b.ts', 'src/ a.ts', 'src/NUL.txt',
  'src/COM1/file.ts', 'src/lpt9.ts', 'src/PROGRA~1/file.ts', 'src/文件.ts',
]) {
  test(`reject unsupported lexical path ${JSON.stringify(path)}`, () =>
    rejects(plan([task('A', [path])]), 'invalid_path', 'tasks[0].writePaths[0]'));
}
test('portable internal spaces, dotfiles and ordinary punctuation are valid', () => {
  accepts(plan([task('A', ['docs/my file.md', '.github/workflows/', 'src/a+b@2_test-1.ts'])]));
});

test('duplicate task keys identify both locations', () => {
  const errors = rejects(plan([task(), task('A', ['src/b/'])]), 'duplicate_key', 'tasks[1].key');
  assert.equal(errors[0].relatedPath, 'tasks[0].key');
});
test('duplicate dependencies and duplicate write entries are rejected', () => {
  rejects(plan([task(), task('B', ['src/b/'], ['A', 'A'])]), 'duplicate_entry', 'tasks[1].dependsOn[1]');
  rejects(plan([task('A', ['src/a.ts', 'src/a.ts'])]), 'duplicate_entry', 'tasks[0].writePaths[1]');
});
test('unknown dependency reports its exact entry', () => {
  rejects(plan([task('A', ['src/a/'], ['missing'])]), 'unknown_dependency', 'tasks[0].dependsOn[0]');
});
test('self-dependency, multi-node cycles and disconnected cycles all fail', () => {
  rejects(plan([task('A', ['src/a/'], ['A'])]), 'dependency_cycle');
  rejects(plan([task('A', ['a/'], ['C']), task('B', ['b/'], ['A']), task('C', ['c/'], ['B'])]), 'dependency_cycle');
  rejects(plan([task('root', ['root/']), task('A', ['a/'], ['B']), task('B', ['b/'], ['A'])]), 'dependency_cycle');
});
test('prototype-like logical task keys work as ordinary keys', () => {
  accepts(plan([task('__proto__', ['shared.ts']), task('constructor', ['shared.ts'], ['__proto__'])]));
});

for (const [a, b] of [
  ['src/', 'src/a/'], ['src/a/', 'src/'], ['src/', 'src/a.ts'],
  ['package.json', 'package.json'], ['src/a/', 'src/a/'],
]) {
  test(`reject concurrent overlap ${a} with ${b} even with same owner`, () => {
    const items = [task('A', [a]), task('B', [b])];
    items[1].owner = items[0].owner;
    const errors = rejects(plan(items), 'parallel_write_overlap', 'tasks[1].writePaths[0]');
    assert.equal(errors[0].relatedPath, 'tasks[0].writePaths[0]');
  });
}
test('similar prefixes respect path boundaries and exact-file semantics', () => {
  accepts(plan([
    task('A', ['src/a/', 'src/file.ts']),
    task('B', ['src/ab/', 'src/file.tsx']),
    task('C', ['src/a-other/', 'src/file.ts.backup']),
  ]));
});
test('direct and transitive dependencies permit path reuse regardless of task array order', () => {
  accepts(plan([task('B', ['src/a/file.ts'], ['A']), task('A', ['src/a/'])]));
  accepts(plan([
    task('C', ['shared.ts'], ['B']), task('A', ['shared.ts']), task('B', ['other.ts'], ['A']),
  ]));
});
test('common ancestors and common descendants do not serialize sibling tasks', () => {
  const items = [
    task('A', ['root.ts']), task('B', ['shared.ts'], ['A']),
    task('C', ['shared.ts'], ['A']), task('D', ['end.ts'], ['B', 'C']),
  ];
  const errors = rejects(plan(items), 'parallel_write_overlap', 'tasks[2].writePaths[0]');
  assert.equal(errors.length, 1);
  assert.equal(errors[0].relatedPath, 'tasks[1].writePaths[0]');
});
test('an ordered diamond can reuse ancestor and descendant scopes', () => {
  accepts(plan([
    task('D', ['src/'], ['B', 'C']), task('B', ['src/b.ts'], ['A']),
    task('A', ['src/']), task('C', ['src/c.ts'], ['A']),
  ]));
});
test('case ambiguity includes parent segments, serial tasks and paths in one task', () => {
  rejects(plan([task('A', ['src/A.ts']), task('B', ['src/a.ts'], ['A'])]), 'path_case_ambiguity');
  rejects(plan([task('A', ['Src/a.ts']), task('B', ['src/b.ts'])]), 'path_case_ambiguity');
  rejects(plan([task('A', ['Src/a.ts', 'src/b.ts'])]), 'path_case_ambiguity');
});
test('exact files cannot also act as directories, even across serial tasks', () => {
  rejects(plan([task('A', ['src']), task('B', ['src/a.ts'], ['A'])]), 'path_kind_conflict');
  rejects(plan([task('A', ['src/', 'src'])]), 'path_kind_conflict');
});
test('validation is deterministic for frozen data and preserves extra-field policy', () => {
  const input = plan([task('A', ['shared.ts']), task('B', ['shared.ts'])]);
  const freeze = (value: unknown) => {
    if (value && typeof value === 'object') {
      Object.freeze(value);
      Object.values(value).forEach(freeze);
    }
  };
  freeze(input);
  assert.deepEqual(validatePlan(input), validatePlan(input));
  const output = accepts({ ...plan(), extra: 'not part of the contract' });
  assert.equal('extra' in output, false);
});
