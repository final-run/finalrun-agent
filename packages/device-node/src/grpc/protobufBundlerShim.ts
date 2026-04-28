// Side-effect import — must be evaluated BEFORE `@grpc/proto-loader` so the
// proto-loader's transitive `protobufjs/ext/descriptor` import (which calls
// `Root.fromJSON(...)` at module-init time) can resolve int64 fields without
// crashing.
//
// Why: protobufjs lazy-requires `fs` and `long` via the @protobufjs/inquire
// `eval("require")(name)` trick to dodge bundler static analysis. In a
// Bun-compiled standalone binary that eval can't see the bundle's resolver,
// so `util.fs` ends up null (→ "null is not an object (evaluating
// 'util.fs.readFileSync')") and `util.Long` ends up an empty object
// (→ "util.Long.fromNumber is not a function" during `resolveAll`).
// We assign both statically so they're bundled and ready before any proto
// load runs.
import * as Protobuf from 'protobufjs';
import * as fs from 'node:fs';
import Long from 'long';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const protobufUtil = Protobuf.util as any;
if (!protobufUtil.fs || typeof protobufUtil.fs.readFileSync !== 'function') {
  protobufUtil.fs = fs;
}
if (!protobufUtil.Long || typeof protobufUtil.Long.fromNumber !== 'function') {
  protobufUtil.Long = Long;
}
