import assert from 'node:assert/strict';
import test from 'node:test';
import { isSafeEnvName, isSafeRelativeSegment } from './submit.js';

test('isSafeRelativeSegment accepts simple relative paths', () => {
  assert.equal(isSafeRelativeSegment('foo.yml'), true);
  assert.equal(isSafeRelativeSegment('subdir/foo.yml'), true);
  assert.equal(isSafeRelativeSegment('a/b/c/d.yaml'), true);
});

test('isSafeRelativeSegment rejects parent traversal', () => {
  assert.equal(isSafeRelativeSegment('../foo.yml'), false);
  assert.equal(isSafeRelativeSegment('../../etc/passwd'), false);
  assert.equal(isSafeRelativeSegment('..'), false);
  assert.equal(isSafeRelativeSegment('subdir/../../escape'), false);
});

test('isSafeRelativeSegment rejects absolute paths across platforms', () => {
  assert.equal(isSafeRelativeSegment('/etc/passwd'), false);
  assert.equal(isSafeRelativeSegment('C:\\Windows\\System32\\drivers\\etc\\hosts'), false);
  assert.equal(isSafeRelativeSegment('c:\\tmp\\a'), false);
  assert.equal(isSafeRelativeSegment('\\\\server\\share\\file.yml'), false);
});

test('isSafeRelativeSegment normalises Windows-style separators before checking', () => {
  assert.equal(isSafeRelativeSegment('..\\foo.yml'), false);
  assert.equal(isSafeRelativeSegment('subdir\\foo.yml'), true);
});

test('isSafeRelativeSegment rejects empty values', () => {
  assert.equal(isSafeRelativeSegment(''), false);
});

test('isSafeEnvName accepts conservative names', () => {
  assert.equal(isSafeEnvName('staging'), true);
  assert.equal(isSafeEnvName('dev_1'), true);
  assert.equal(isSafeEnvName('feature-x.2'), true);
});

test('isSafeEnvName rejects path-like and exotic values', () => {
  assert.equal(isSafeEnvName('../etc'), false);
  assert.equal(isSafeEnvName('/etc'), false);
  assert.equal(isSafeEnvName('a/b'), false);
  assert.equal(isSafeEnvName('with space'), false);
  assert.equal(isSafeEnvName(''), false);
});
