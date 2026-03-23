import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import type { DeviceInventoryEntry } from '@finalrun/common';
import {
  formatDiagnosticsForOutput,
  promptForDeviceSelection,
} from './deviceInventoryPresenter.js';

function createRunnableEntry(params: {
  selectionId: string;
  platform: 'android' | 'ios';
  displayName: string;
}): DeviceInventoryEntry {
  return {
    selectionId: params.selectionId,
    platform: params.platform,
    targetKind: params.platform === 'android' ? 'android-emulator' : 'ios-simulator',
    state: params.platform === 'android' ? 'connected' : 'booted',
    runnable: true,
    startable: false,
    displayName: params.displayName,
    rawId: params.selectionId,
    modelName: params.displayName,
    osVersionLabel: params.platform === 'android' ? 'Android 14' : 'iOS 17.5',
    deviceInfo: null,
    transcripts: [],
  };
}

test('promptForDeviceSelection reprompts until a valid device number is entered', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  let outputText = '';
  output.on('data', (chunk: Buffer | string) => {
    outputText += String(chunk);
  });
  input.write('9\n');
  setImmediate(() => {
    input.end('2\n');
  });

  const selected = await promptForDeviceSelection({
    heading: 'Select a device',
    entries: [
      createRunnableEntry({
        selectionId: 'android:1',
        platform: 'android',
        displayName: 'Pixel 8 - Android 14 - emulator-5554',
      }),
      createRunnableEntry({
        selectionId: 'ios:1',
        platform: 'ios',
        displayName: 'iPhone 15 Pro - iOS 17.5 - BOOTED-DEVICE-1',
      }),
    ],
    io: {
      input,
      output,
      isTTY: true,
    },
  });

  assert.equal(selected.selectionId, 'ios:1');
  assert.match(outputText, /Invalid selection/);
});

test('formatDiagnosticsForOutput includes raw stdout and stderr blocks', () => {
  const rendered = formatDiagnosticsForOutput([
    {
      scope: 'android-connected',
      summary: 'Android device discovery failed.',
      blocking: true,
      transcripts: [
        {
          command: 'adb devices -l',
          stdout: 'List of devices attached\n',
          stderr: 'adb server is out of date\n',
          exitCode: 1,
        },
      ],
    },
  ]);

  assert.match(rendered, /Command: adb devices -l/);
  assert.match(rendered, /stdout:\nList of devices attached/);
  assert.match(rendered, /stderr:\nadb server is out of date/);
  assert.match(rendered, /exitCode: 1/);
});
