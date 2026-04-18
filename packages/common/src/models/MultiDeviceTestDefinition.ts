/** A device role within a multi-device test. */
export interface MultiDeviceTestDevice {
  /** User-defined role name, e.g., "sender" or "receiver". */
  role: string;
  /** App package identifier (Android packageName or iOS bundleId). */
  app: string;
}

/** A single step scoped to a device role. */
export interface MultiDeviceStep {
  /** Device role name this step targets. */
  device: string;
  /** Natural language instruction for this step. */
  action: string;
}

/**
 * A parallel block — multiple per-device lanes that run concurrently.
 * Within each lane, steps execute sequentially. Between lanes, execution
 * is concurrent until all lanes finish.
 */
export interface MultiDeviceParallelBlock {
  readonly kind: 'parallel';
  /** Ordered lanes; each lane targets one device and holds its sequential steps. */
  lanes: Array<{ device: string; actions: string[] }>;
}

/**
 * One entry inside a phase (setup / steps / expected_state).
 * Either a single sequential step, or a parallel block that holds several lanes.
 */
export type MultiDevicePhaseItem = MultiDeviceStep | MultiDeviceParallelBlock;

/** Type guard — distinguishes parallel blocks from plain sequential steps. */
export function isParallelBlock(
  item: MultiDevicePhaseItem,
): item is MultiDeviceParallelBlock {
  return (item as MultiDeviceParallelBlock).kind === 'parallel';
}

/** A multi-device test authored as a YAML file under .finalrun/multi-device/tests/ */
export interface MultiDeviceTestDefinition {
  // --- Always present (authored in YAML) ---
  name: string;
  description?: string;
  /** Exactly 2 devices. */
  devices: MultiDeviceTestDevice[];
  setup: MultiDevicePhaseItem[];
  steps: MultiDevicePhaseItem[];
  expected_state: MultiDevicePhaseItem[];

  // --- Populated after loading from disk ---
  /** Absolute path to the source YAML file. Set by the test loader. */
  sourcePath?: string;
  /** Path relative to .finalrun/multi-device/tests/. Set by the test loader. */
  relativePath?: string;
  /** Sanitized unique ID derived from the file path. Set by the test loader. */
  testId?: string;
}
