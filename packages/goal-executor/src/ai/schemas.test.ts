import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ALL_FEATURES,
  FEATURE_GROUNDER,
  FEATURE_INPUT_FOCUS_GROUNDER,
  FEATURE_LAUNCH_APP_GROUNDER,
  FEATURE_PLANNER,
  FEATURE_SCROLL_INDEX_GROUNDER,
  FEATURE_SET_LOCATION_GROUNDER,
  FEATURE_VISUAL_GROUNDER,
} from '@finalrun/common';
import { PLANNER_SCHEMA, schemaForFeature } from './schemas.js';

// ----------------------------------------------------------------------------
// Planner
// ----------------------------------------------------------------------------

test('planner schema accepts the canonical wait example from planner.md', () => {
  const payload = {
    output: {
      thought: {
        plan: '[→ Wait for app to load]',
        think: 'App is on splash screen; need to wait.',
        act: 'Wait 5 seconds for the app to load.',
      },
      action: { action_type: 'wait', duration: 5 },
      remember: [],
    },
  };
  assert.equal(PLANNER_SCHEMA.safeParse(payload).success, true);
});

test('planner schema accepts each documented action_type', () => {
  const types = [
    'tap',
    'long_press',
    'input_text',
    'swipe',
    'navigate_back',
    'navigate_home',
    'rotate',
    'hide_keyboard',
    'keyboard_enter',
    'wait',
    'deep_link',
    'set_location',
    'launch_app',
    'status',
  ];
  for (const t of types) {
    const payload = {
      output: { action: { action_type: t } },
    };
    assert.equal(
      PLANNER_SCHEMA.safeParse(payload).success,
      true,
      `expected ${t} to be accepted`,
    );
  }
});

test('planner schema accepts passthrough action fields (repeat, delay_between_tap)', () => {
  const payload = {
    output: {
      action: {
        action_type: 'tap',
        repeat: 3,
        delay_between_tap: 1000,
      },
      remember: [],
    },
  };
  assert.equal(PLANNER_SCHEMA.safeParse(payload).success, true);
});

test('planner schema rejects an unknown action_type', () => {
  const payload = {
    output: { action: { action_type: 'click' } },
  };
  const result = PLANNER_SCHEMA.safeParse(payload);
  assert.equal(result.success, false);
});

test('planner schema rejects when the top-level output wrapper is missing', () => {
  const payload = { action: { action_type: 'tap' } };
  assert.equal(PLANNER_SCHEMA.safeParse(payload).success, false);
});

// ----------------------------------------------------------------------------
// Grounder — each feature's success and error shapes
// ----------------------------------------------------------------------------

test('grounder schema accepts index match, needsVisualGrounding, and error variants', () => {
  const schema = schemaForFeature(FEATURE_GROUNDER);
  assert.equal(
    schema.safeParse({ output: { index: 5, reason: 'match' } }).success,
    true,
  );
  assert.equal(
    schema.safeParse({
      output: { needsVisualGrounding: true, reason: 'not in list' },
    }).success,
    true,
  );
  assert.equal(
    schema.safeParse({ output: { isError: true, reason: 'not visible' } })
      .success,
    true,
  );
});

test('input-focus grounder schema accepts index, x/y, null-index, and error', () => {
  const schema = schemaForFeature(FEATURE_INPUT_FOCUS_GROUNDER);
  assert.equal(
    schema.safeParse({ output: { index: 42, reason: 'match' } }).success,
    true,
  );
  assert.equal(
    schema.safeParse({ output: { index: null, reason: 'already focused' } })
      .success,
    true,
  );
  assert.equal(
    schema.safeParse({ output: { x: 100, y: 200, reason: 'derived' } })
      .success,
    true,
  );
  assert.equal(
    schema.safeParse({ output: { isError: true, reason: 'not found' } })
      .success,
    true,
  );
});

test('visual grounder schema accepts coordinates and error', () => {
  const schema = schemaForFeature(FEATURE_VISUAL_GROUNDER);
  assert.equal(
    schema.safeParse({ output: { x: 540, y: 1200, reason: 'center of label' } })
      .success,
    true,
  );
  assert.equal(
    schema.safeParse({ output: { isError: true, reason: 'not visible' } })
      .success,
    true,
  );
});

test('scroll-index grounder schema accepts swipe vector and error', () => {
  const schema = schemaForFeature(FEATURE_SCROLL_INDEX_GROUNDER);
  assert.equal(
    schema.safeParse({
      output: {
        start_x: 540,
        start_y: 1800,
        end_x: 540,
        end_y: 400,
        durationMs: 600,
        reason: 'swipe up',
      },
    }).success,
    true,
  );
  assert.equal(
    schema.safeParse({ output: { isError: true, reason: 'no container' } })
      .success,
    true,
  );
});

test('launch-app grounder schema accepts minimal and full payloads', () => {
  const schema = schemaForFeature(FEATURE_LAUNCH_APP_GROUNDER);
  assert.equal(
    schema.safeParse({
      output: { packageName: 'com.whatsapp', reason: 'exact match' },
    }).success,
    true,
  );
  assert.equal(
    schema.safeParse({
      output: {
        packageName: 'com.example.myapp',
        clearState: true,
        allowAllPermissions: false,
        permissions: { camera: 'allow', photos: 'allow' },
        reason: 'full config',
      },
    }).success,
    true,
  );
  assert.equal(
    schema.safeParse({ output: { isError: true, reason: 'not found' } })
      .success,
    true,
  );
});

test('set-location grounder schema accepts string coords and error', () => {
  const schema = schemaForFeature(FEATURE_SET_LOCATION_GROUNDER);
  assert.equal(
    schema.safeParse({
      output: { lat: '37.7749', long: '-122.4194', reason: 'SF' },
    }).success,
    true,
  );
  assert.equal(
    schema.safeParse({ output: { isError: true, reason: 'unresolved' } })
      .success,
    true,
  );
});

test('set-location grounder schema rejects numeric lat/long (spec requires strings)', () => {
  const schema = schemaForFeature(FEATURE_SET_LOCATION_GROUNDER);
  assert.equal(
    schema.safeParse({
      output: { lat: 37.7749, long: -122.4194, reason: 'numeric' },
    }).success,
    false,
  );
});

// ----------------------------------------------------------------------------
// Lookup
// ----------------------------------------------------------------------------

test('schemaForFeature returns a schema for every known feature', () => {
  for (const feature of ALL_FEATURES) {
    assert.ok(schemaForFeature(feature), `missing schema for ${feature}`);
  }
  // Silence unused-import warnings (these individual constants are tested
  // implicitly through ALL_FEATURES, but kept explicit for readability).
  void FEATURE_PLANNER;
  void FEATURE_GROUNDER;
  void FEATURE_VISUAL_GROUNDER;
  void FEATURE_SCROLL_INDEX_GROUNDER;
  void FEATURE_INPUT_FOCUS_GROUNDER;
  void FEATURE_LAUNCH_APP_GROUNDER;
  void FEATURE_SET_LOCATION_GROUNDER;
});
