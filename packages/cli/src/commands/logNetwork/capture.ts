// Network capture proxy using mockttp for HTTPS interception.
// Intercepts all HTTP and HTTPS traffic via MITM using our CA cert.
// Requires the CA to be trusted on the device.

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
  requestBody: Buffer | undefined;
  responseBody: Buffer | undefined;
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

interface PendingRequest {
  startedAt: Date;
  method: string;
  url: string;
  headers: Record<string, string>;
}

export class NetworkCapture {
  private _server: mockttp.Mockttp | null = null;
  private _entries: CapturedEntry[] = [];
  private _tlsErrors: TlsError[] = [];
  private _port = 0;
  private _pendingRequests = new Map<string, PendingRequest>();

  get port(): number { return this._port; }
  get entries(): readonly CapturedEntry[] { return this._entries; }
  get tlsErrors(): readonly TlsError[] { return this._tlsErrors; }

  async start(cert: string, key: string, callbacks: NetworkCaptureCallbacks): Promise<number> {
    this._server = mockttp.getLocal({
      https: { cert, key },
    });

    await this._server.forAnyRequest().thenPassThrough();
    await this._server.start();
    this._port = this._server.port;

    await this._server.on('request', (req) => {
      this._pendingRequests.set(req.id, {
        startedAt: new Date(),
        method: req.method,
        url: req.url,
        headers: flattenHeaders(req.headers),
      });
    });

    await this._server.on('response', (response) => {
      const completedAt = new Date();
      const pending = this._pendingRequests.get(response.id);
      this._pendingRequests.delete(response.id);

      const entry: CapturedEntry = {
        startedAt: pending?.startedAt ?? completedAt,
        completedAt,
        method: pending?.method ?? '???',
        url: pending?.url ?? '',
        statusCode: response.statusCode,
        statusMessage: response.statusMessage ?? '',
        requestHeaders: pending?.headers ?? {},
        responseHeaders: flattenHeaders(response.headers),
        requestBody: undefined,
        responseBody: undefined,
        durationMs: completedAt.getTime() - (pending?.startedAt ?? completedAt).getTime(),
        responseSize: response.body?.buffer?.byteLength ?? 0,
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
            bodySize: e.requestBody?.byteLength ?? -1,
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
            },
            bodySize: e.responseSize,
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
