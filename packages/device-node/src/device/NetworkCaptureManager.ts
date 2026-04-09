// Network capture manager: session-scoped HTTPS proxy with per-test entry slicing.
//
// Session lifecycle (once per run):
//   startSession() → starts mockttp MITM proxy, subscribes to request/response events
//   stopSession()  → stops proxy, clears all state
//
// Per-test lifecycle (called for each test):
//   startTestCapture(runId, testId) → records the current entry count as a marker
//   stopTestCapture(runId, testId)  → slices entries since marker, writes HAR to /tmp/
//
// This follows the same manager pattern as LogCaptureManager but with a
// session-scoped proxy instead of per-test child processes.

import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import path from 'node:path';
import { DeviceNodeResponse, Logger } from '@finalrun/common';

// mockttp is an optional dependency (only in the CLI package).
// Dynamic import so device-node doesn't hard-depend on it.
type Mockttp = import('mockttp').Mockttp;

export interface NetworkCaptureSessionParams {
  cert: string;
  key: string;
}

export interface NetworkCaptureTestParams {
  runId: string;
  testId: string;
}

export interface NetworkCapturedEntry {
  startedAt: Date;
  completedAt: Date;
  method: string;
  url: string;
  statusCode: number;
  statusMessage: string;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  requestBodyText: string | undefined;
  requestBodySize: number;
  responseBodyText: string | undefined;
  responseBodySize: number;
  durationMs: number;
}

export interface NetworkTlsError {
  hostname: string;
  failureCause: string;
  timestamp: Date;
}

export interface DeviceNetworkCaptureController {
  startSession(params: NetworkCaptureSessionParams): Promise<DeviceNodeResponse>;
  stopSession(): Promise<void>;
  startTestCapture(params: NetworkCaptureTestParams): Promise<DeviceNodeResponse>;
  stopTestCapture(runId: string, testId: string): Promise<DeviceNodeResponse>;
  abortTestCapture(runId: string): Promise<void>;
  get proxyPort(): number;
  get entryCount(): number;
  get tlsErrorCount(): number;
}

const MAP_KEY_DELIMITER = '###';
const TEMP_DIR = path.join(os.tmpdir(), 'finalrun-network');
const MAX_TEXT_BODY_BYTES = 512 * 1024; // 512 KB

export class NetworkCaptureManager implements DeviceNetworkCaptureController {
  private _server: Mockttp | null = null;
  private _entries: NetworkCapturedEntry[] = [];
  private _tlsErrors: NetworkTlsError[] = [];
  private _proxyPort = 0;

  // Per-test tracking: maps runId###testId → start index in _entries array.
  private readonly _testStartIndexMap = new Map<string, number>();
  private readonly _testTlsStartIndexMap = new Map<string, number>();
  private readonly _stoppedTests = new Set<string>();

  // Pending requests (waiting for response).
  private readonly _pendingRequests = new Map<
    string,
    { startedAt: Date; method: string; url: string; headers: Record<string, string>; bodyText: string | undefined; bodySize: number }
  >();

  get proxyPort(): number {
    return this._proxyPort;
  }

  get entryCount(): number {
    return this._entries.length;
  }

  get tlsErrorCount(): number {
    return this._tlsErrors.length;
  }

  async startSession(params: NetworkCaptureSessionParams): Promise<DeviceNodeResponse> {
    if (this._server) {
      return new DeviceNodeResponse({
        success: false,
        message: 'Network capture session already active',
      });
    }

    try {
      const mockttp = await import('mockttp');
      this._server = mockttp.getLocal({
        https: { cert: params.cert, key: params.key },
      });

      await this._server.forAnyRequest().thenPassThrough();
      await this._server.start();
      this._proxyPort = this._server.port;

      // Subscribe to request events — store full request data.
      await this._server.on('request', (req) => {
        const bodyBuffer = req.body?.buffer;
        const contentType = flattenHeaderValue(req.headers['content-type']);
        const isText = isTextContentType(contentType);

        this._pendingRequests.set(req.id, {
          startedAt: new Date(),
          method: req.method,
          url: req.url,
          headers: flattenHeaders(req.headers),
          bodyText: isText && bodyBuffer ? truncateBody(Buffer.from(bodyBuffer).toString('utf8')) : undefined,
          bodySize: bodyBuffer?.byteLength ?? 0,
        });
      });

      // Subscribe to response events — correlate with request, store entry.
      await this._server.on('response', (response) => {
        const completedAt = new Date();
        const pending = this._pendingRequests.get(response.id);
        this._pendingRequests.delete(response.id);

        const responseBuffer = response.body?.buffer;
        const responseContentType = flattenHeaderValue(response.headers['content-type']);
        const isText = isTextContentType(responseContentType);

        const entry: NetworkCapturedEntry = {
          startedAt: pending?.startedAt ?? completedAt,
          completedAt,
          method: pending?.method ?? '???',
          url: pending?.url ?? '',
          statusCode: response.statusCode,
          statusMessage: response.statusMessage ?? '',
          requestHeaders: pending?.headers ?? {},
          responseHeaders: flattenHeaders(response.headers),
          requestBodyText: pending?.bodyText,
          requestBodySize: pending?.bodySize ?? 0,
          responseBodyText: isText && responseBuffer ? truncateBody(Buffer.from(responseBuffer).toString('utf8')) : undefined,
          responseBodySize: responseBuffer?.byteLength ?? 0,
          durationMs: completedAt.getTime() - (pending?.startedAt ?? completedAt).getTime(),
        };
        this._entries.push(entry);
      });

      // Subscribe to TLS errors.
      await this._server.on('tls-client-error', (failure) => {
        const f = failure as unknown as {
          failureCause?: string;
          tlsMetadata?: { sniHostname?: string };
        };
        this._tlsErrors.push({
          hostname: f.tlsMetadata?.sniHostname ?? 'unknown',
          failureCause: f.failureCause ?? 'unknown',
          timestamp: new Date(),
        });
      });

      Logger.d(`Network capture proxy started on port ${this._proxyPort}`);
      return new DeviceNodeResponse({
        success: true,
        message: `Network capture proxy started on port ${this._proxyPort}`,
        data: { proxyPort: this._proxyPort },
      });
    } catch (error) {
      Logger.e('Failed to start network capture session', error);
      return new DeviceNodeResponse({
        success: false,
        message: `Failed to start network capture: ${formatError(error)}`,
      });
    }
  }

  async stopSession(): Promise<void> {
    if (this._server) {
      try {
        await this._server.stop();
      } catch (error) {
        Logger.w('Failed to stop network capture proxy cleanly', error);
      }
      this._server = null;
    }
    this._entries = [];
    this._tlsErrors = [];
    this._pendingRequests.clear();
    this._testStartIndexMap.clear();
    this._testTlsStartIndexMap.clear();
    this._stoppedTests.clear();
    this._proxyPort = 0;
  }

  async startTestCapture(params: NetworkCaptureTestParams): Promise<DeviceNodeResponse> {
    const mapKey = this._mapKey(params.runId, params.testId);

    if (this._testStartIndexMap.has(mapKey)) {
      return new DeviceNodeResponse({
        success: false,
        message: 'Network capture already in progress for this test',
      });
    }

    // Record the current position — entries from here onward belong to this test.
    this._testStartIndexMap.set(mapKey, this._entries.length);
    this._testTlsStartIndexMap.set(mapKey, this._tlsErrors.length);
    this._stoppedTests.delete(mapKey);

    return new DeviceNodeResponse({
      success: true,
      message: `Network capture started for test: ${params.testId}`,
      data: { startedAt: new Date().toISOString() },
    });
  }

  async stopTestCapture(runId: string, testId: string): Promise<DeviceNodeResponse> {
    const mapKey = this._mapKey(runId, testId);

    if (this._stoppedTests.has(mapKey)) {
      return new DeviceNodeResponse({
        success: true,
        message: 'Network capture already stopped for this test',
      });
    }

    const startIndex = this._testStartIndexMap.get(mapKey);
    if (startIndex === undefined) {
      return new DeviceNodeResponse({
        success: false,
        message: 'No active network capture for this test',
      });
    }

    const tlsStartIndex = this._testTlsStartIndexMap.get(mapKey) ?? 0;
    const completedAt = new Date();

    // Slice entries and TLS errors for this test.
    const testEntries = this._entries.slice(startIndex);
    const testTlsErrors = this._tlsErrors.slice(tlsStartIndex);
    const startedAt = testEntries.length > 0
      ? testEntries[0]!.startedAt
      : (this._testStartIndexMap.get(mapKey) !== undefined ? new Date() : completedAt);

    // Write HAR to temp file.
    try {
      await fsp.mkdir(TEMP_DIR, { recursive: true });
      const sanitizedRunId = sanitizeForFilename(runId);
      const sanitizedTestId = sanitizeForFilename(testId);
      const filePath = path.join(TEMP_DIR, `${sanitizedRunId}_${sanitizedTestId}.har`);

      const har = buildHar(testEntries, testTlsErrors);
      await fsp.writeFile(filePath, JSON.stringify(har, null, 2), 'utf8');

      this._testStartIndexMap.delete(mapKey);
      this._testTlsStartIndexMap.delete(mapKey);
      this._stoppedTests.add(mapKey);

      return new DeviceNodeResponse({
        success: true,
        message: `Network capture stopped for test: ${testId} (${testEntries.length} requests)`,
        data: {
          filePath,
          startedAt: startedAt.toISOString(),
          completedAt: completedAt.toISOString(),
          requestCount: testEntries.length,
          tlsErrorCount: testTlsErrors.length,
        },
      });
    } catch (error) {
      Logger.e(`Failed to write network HAR for test: ${testId}`, error);
      return new DeviceNodeResponse({
        success: false,
        message: `Failed to write network capture: ${formatError(error)}`,
      });
    }
  }

  async abortTestCapture(runId: string): Promise<void> {
    const keysToAbort = [...this._testStartIndexMap.keys()].filter((k) =>
      k.startsWith(`${runId}${MAP_KEY_DELIMITER}`),
    );
    for (const key of keysToAbort) {
      this._testStartIndexMap.delete(key);
      this._testTlsStartIndexMap.delete(key);
      this._stoppedTests.add(key);
    }
  }

  private _mapKey(runId: string, testId: string): string {
    return `${runId}${MAP_KEY_DELIMITER}${testId}`;
  }
}

// ── HAR builder ─────────────────────────────────────────────────────────────

function buildHar(entries: NetworkCapturedEntry[], tlsErrors: NetworkTlsError[]): object {
  return {
    log: {
      version: '1.2',
      creator: { name: 'FinalRun', version: '0.1.0' },
      entries: entries.map((e) => ({
        startedDateTime: e.startedAt.toISOString(),
        time: e.durationMs,
        request: {
          method: e.method,
          url: e.url,
          httpVersion: 'HTTP/1.1',
          headers: headersToHar(e.requestHeaders),
          queryString: parseQueryString(e.url),
          ...(e.requestBodyText !== undefined
            ? {
                postData: {
                  mimeType: e.requestHeaders['content-type'] ?? 'application/octet-stream',
                  text: e.requestBodyText,
                },
              }
            : {}),
          bodySize: e.requestBodySize,
          headersSize: -1,
        },
        response: {
          status: e.statusCode,
          statusText: e.statusMessage,
          httpVersion: 'HTTP/1.1',
          headers: headersToHar(e.responseHeaders),
          content: {
            size: e.responseBodySize,
            mimeType: e.responseHeaders['content-type'] ?? 'application/octet-stream',
            ...(e.responseBodyText !== undefined ? { text: e.responseBodyText } : {}),
          },
          bodySize: e.responseBodySize,
          headersSize: -1,
          redirectURL: '',
        },
        cache: {},
        timings: {
          send: 0,
          wait: e.durationMs,
          receive: 0,
        },
      })),
      ...(tlsErrors.length > 0
        ? {
            _tlsErrors: tlsErrors.map((e) => ({
              hostname: e.hostname,
              cause: e.failureCause,
              timestamp: e.timestamp.toISOString(),
            })),
          }
        : {}),
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function flattenHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v === undefined) continue;
    flat[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : v;
  }
  return flat;
}

function flattenHeaderValue(value: string | string[] | undefined): string {
  if (value === undefined) return '';
  return Array.isArray(value) ? value[0] ?? '' : value;
}

function headersToHar(headers: Record<string, string>): Array<{ name: string; value: string }> {
  return Object.entries(headers).map(([name, value]) => ({ name, value }));
}

function parseQueryString(url: string): Array<{ name: string; value: string }> {
  try {
    const u = new URL(url);
    return [...u.searchParams].map(([name, value]) => ({ name, value }));
  } catch {
    return [];
  }
}

function isTextContentType(contentType: string): boolean {
  if (!contentType) return false;
  const ct = contentType.toLowerCase();
  return (
    ct.includes('json') ||
    ct.includes('text') ||
    ct.includes('xml') ||
    ct.includes('html') ||
    ct.includes('javascript') ||
    ct.includes('css') ||
    ct.includes('form-urlencoded')
  );
}

function truncateBody(text: string): string {
  if (text.length <= MAX_TEXT_BODY_BYTES) return text;
  return text.slice(0, MAX_TEXT_BODY_BYTES);
}

function sanitizeForFilename(value: string): string {
  return value
    .replaceAll(/[/\\:*?"<>|]/g, '_')
    .replaceAll(/\s+/g, '_')
    .replaceAll(/_+/g, '_');
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
