// Standalone network capture for `finalrun log-network` command.
// Uses mockttp directly for interactive live-streaming capture.
//
// The test pipeline uses NetworkCaptureManager in @finalrun/device-node
// instead — same mockttp patterns but with session/test lifecycle.

import * as mockttp from 'mockttp';

export interface CapturedEntry {
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
  responseSize: number;
}

export interface TlsError {
  hostname: string;
  remoteIpAddress?: string;
  failureCause?: string;
}

export type OnEntry = (entry: CapturedEntry) => void;
export type OnTlsError = (err: TlsError) => void;

export interface NetworkCaptureCallbacks {
  onEntry: OnEntry;
  onTlsError?: OnTlsError;
}

export class NetworkCapture {
  private _server: mockttp.Mockttp | null = null;
  private _entries: CapturedEntry[] = [];
  private _tlsErrors: TlsError[] = [];
  private _port = 0;
  private _pendingRequests = new Map<string, { startedAt: Date; method: string; url: string; headers: Record<string, string>; bodyText: string | undefined; bodySize: number }>();

  get port(): number { return this._port; }
  get entries(): readonly CapturedEntry[] { return this._entries; }
  get tlsErrors(): readonly TlsError[] { return this._tlsErrors; }

  async start(cert: string, key: string, callbacks: NetworkCaptureCallbacks): Promise<number> {
    this._server = mockttp.getLocal({ https: { cert, key } });
    await this._server.forAnyRequest().thenPassThrough();
    await this._server.start();
    this._port = this._server.port;

    await this._server.on('request', (req) => {
      const bodyBuffer = req.body?.buffer;
      const contentType = flattenHeaderValue(req.headers['content-type']);
      const isText = isTextMime(contentType);
      this._pendingRequests.set(req.id, {
        startedAt: new Date(),
        method: req.method,
        url: req.url,
        headers: flattenHeaders(req.headers),
        bodyText: isText && bodyBuffer ? Buffer.from(bodyBuffer).toString('utf8').slice(0, 512 * 1024) : undefined,
        bodySize: bodyBuffer?.byteLength ?? 0,
      });
    });

    await this._server.on('response', (response) => {
      const completedAt = new Date();
      const pending = this._pendingRequests.get(response.id);
      this._pendingRequests.delete(response.id);

      const respBuffer = response.body?.buffer;
      const respContentType = flattenHeaderValue(response.headers['content-type']);
      const isText = isTextMime(respContentType);

      const entry: CapturedEntry = {
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
        responseBodyText: isText && respBuffer ? Buffer.from(respBuffer).toString('utf8').slice(0, 512 * 1024) : undefined,
        responseBodySize: respBuffer?.byteLength ?? 0,
        durationMs: completedAt.getTime() - (pending?.startedAt ?? completedAt).getTime(),
        responseSize: respBuffer?.byteLength ?? 0,
      };
      this._entries.push(entry);
      callbacks.onEntry(entry);
    });

    await this._server.on('tls-client-error', (failure) => {
      const f = failure as unknown as {
        remoteIpAddress?: string;
        failureCause?: string;
        tlsMetadata?: { sniHostname?: string };
      };
      const tlsErr: TlsError = {
        hostname: f.tlsMetadata?.sniHostname ?? 'unknown',
        remoteIpAddress: f.remoteIpAddress,
        failureCause: f.failureCause,
      };
      this._tlsErrors.push(tlsErr);
      callbacks.onTlsError?.(tlsErr);
    });

    return this._port;
  }

  async stop(): Promise<void> {
    if (this._server) {
      await this._server.stop();
      this._server = null;
    }
  }

  toHar(): object {
    return {
      log: {
        version: '1.2',
        creator: { name: 'FinalRun', version: '0.1.0' },
        entries: this._entries.map((e) => ({
          startedDateTime: e.startedAt.toISOString(),
          time: e.durationMs,
          request: {
            method: e.method,
            url: e.url,
            httpVersion: 'HTTP/1.1',
            headers: headersToHar(e.requestHeaders),
            queryString: parseQueryString(e.url),
            ...(e.requestBodyText !== undefined
              ? { postData: { mimeType: e.requestHeaders['content-type'] ?? 'application/octet-stream', text: e.requestBodyText } }
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
              size: e.responseSize,
              mimeType: e.responseHeaders['content-type'] ?? 'application/octet-stream',
              ...(e.responseBodyText !== undefined ? { text: e.responseBodyText } : {}),
            },
            bodySize: e.responseSize,
            headersSize: -1,
            redirectURL: '',
          },
          cache: {},
          timings: { send: 0, wait: e.durationMs, receive: 0 },
        })),
      },
    };
  }
}

function flattenHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v === undefined) continue;
    flat[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : v;
  }
  return flat;
}

function flattenHeaderValue(v: string | string[] | undefined): string {
  if (!v) return '';
  return Array.isArray(v) ? v[0] ?? '' : v;
}

function isTextMime(ct: string): boolean {
  if (!ct) return false;
  const l = ct.toLowerCase();
  return l.includes('json') || l.includes('text') || l.includes('xml') || l.includes('html') || l.includes('javascript') || l.includes('css') || l.includes('form-urlencoded');
}

function headersToHar(headers: Record<string, string>): Array<{ name: string; value: string }> {
  return Object.entries(headers).map(([name, value]) => ({ name, value }));
}

function parseQueryString(url: string): Array<{ name: string; value: string }> {
  try {
    return [...new URL(url).searchParams].map(([name, value]) => ({ name, value }));
  } catch {
    return [];
  }
}
