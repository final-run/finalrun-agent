// Port of common/model/Hierarchy.dart — MINIMAL: parse + flatten + node properties
// The Dart file is ~108KB. We port only the subset used by FinalRunAgent and
// HeadlessActionExecutor for AI prompt building and grounding.

import { PLATFORM_ANDROID, PLATFORM_IOS } from '../constants.js';

/**
 * Represents a single node in the UI hierarchy tree.
 *
 * Dart equivalent: HierarchyNode in Hierarchy.dart
 */
export class HierarchyNode {
  readonly index: number;
  readonly text: string | null;
  readonly accessibilityText: string | null;
  readonly id: string | null;
  readonly clazz: string | null;
  readonly bounds: [number, number, number, number] | null; // [left, top, right, bottom]
  readonly isScrollable: boolean;
  readonly isFocused: boolean;
  readonly isEditable: boolean;
  readonly isImage: boolean;
  readonly hintText: string | null;
  readonly error: string | null;
  readonly isSelected: boolean;
  readonly children: HierarchyNode[];

  constructor(params: {
    index: number;
    text?: string | null;
    accessibilityText?: string | null;
    id?: string | null;
    clazz?: string | null;
    bounds?: [number, number, number, number] | null;
    isScrollable?: boolean;
    isFocused?: boolean;
    isEditable?: boolean;
    isImage?: boolean;
    hintText?: string | null;
    error?: string | null;
    isSelected?: boolean;
    children?: HierarchyNode[];
  }) {
    this.index = params.index;
    this.text = params.text ?? null;
    this.accessibilityText = params.accessibilityText ?? null;
    this.id = params.id ?? null;
    this.clazz = params.clazz ?? null;
    this.bounds = params.bounds ?? null;
    this.isScrollable = params.isScrollable ?? false;
    this.isFocused = params.isFocused ?? false;
    this.isEditable = params.isEditable ?? false;
    this.isImage = params.isImage ?? false;
    this.hintText = params.hintText ?? null;
    this.error = params.error ?? null;
    this.isSelected = params.isSelected ?? false;
    this.children = params.children ?? [];
  }

  /**
   * Dart: bool isElementTypeButton()
   * Returns true if the element's class suggests it's a button-like widget.
   */
  isElementTypeButton(): boolean {
    if (!this.clazz) return false;
    return this.classContainsButton();
  }

  /**
   * Dart: bool classContainsButton()
   */
  classContainsButton(): boolean {
    if (!this.clazz) return false;
    const lower = this.clazz.toLowerCase();
    return lower.includes('button') || lower.includes('clickable');
  }

  /**
   * Get the center point of this node's bounds.
   */
  getCenterPoint(): { x: number; y: number } | null {
    if (!this.bounds) return null;
    const [left, top, right, bottom] = this.bounds;
    return {
      x: Math.round((left + right) / 2),
      y: Math.round((top + bottom) / 2),
    };
  }

}

// ============================================================================
// Hierarchy — the full tree with parsing and flattening
// ============================================================================

/**
 * Represents the full UI hierarchy of a screen.
 * Parsed from JSON sent by the on-device driver app via gRPC.
 *
 * Dart equivalent: Hierarchy class in Hierarchy.dart
 */
export class Hierarchy {
  readonly root: HierarchyNode | null;
  private _flattenedCache: HierarchyNode[] | null = null;

  constructor(root: HierarchyNode | null, flattenedNodes?: HierarchyNode[] | null) {
    this.root = root;
    if (flattenedNodes) {
      this._flattenedCache = flattenedNodes;
    }
  }

  /**
   * Parse a hierarchy from the JSON string returned by the driver.
   * Dart: factory Hierarchy.fromJson(Map<String, dynamic> json)
   */
  static fromJson(json: Record<string, unknown>): Hierarchy {
    const root = Hierarchy._parseNode(json, 0);
    return new Hierarchy(root.node);
  }

  /**
   * Parse hierarchy from the raw JSON string.
   */
  static fromJsonString(jsonString: string): Hierarchy {
    try {
      const parsed = JSON.parse(jsonString) as unknown;
      if (Array.isArray(parsed)) {
        return Hierarchy.fromFlatJson(parsed);
      }
      return Hierarchy.fromJson(parsed as Record<string, unknown>);
    } catch {
      return new Hierarchy(null);
    }
  }

  /**
   * Parse the flat array payload returned by the native driver.
   * Dart: Hierarchy.fromJSON(List<dynamic> jsonArray, ...)
   */
  static fromFlatJson(jsonArray: unknown[]): Hierarchy {
    const flattenedNodes = jsonArray.map((item, index) =>
      Hierarchy._parseFlatNode(item as Record<string, unknown>, index),
    );
    return new Hierarchy(null, flattenedNodes);
  }

  /**
   * Flatten the hierarchy tree into a linear list of nodes.
   * Each node gets a sequential 0-based index.
   * Dart: List<HierarchyNode> get flattenedHierarchy
   */
  get flattenedHierarchy(): HierarchyNode[] {
    if (this._flattenedCache !== null) return this._flattenedCache;

    const result: HierarchyNode[] = [];
    if (this.root) {
      Hierarchy._flattenNode(this.root, result);
    }
    this._flattenedCache = result;
    return result;
  }

  /**
   * Hierarchy subset for the PLANNER — minimal, tappable/image elements only.
   *
   * Filter: a node is kept only if it has accessibility text AND is either an
   * image, an iOS button, or an Android button-class node.
   * Fields: index, contentDesc, class (Android class name shortened), bounds.
   *
   * The planner treats the screenshot as the source of truth and uses the
   * hierarchy only to disambiguate interactive targets, so the slim payload
   * is sufficient and keeps token cost low.
   */
  toPromptElementsForPlanner(platform?: string): Record<string, unknown>[] {
    const isAndroid = platform === PLATFORM_ANDROID;
    const isIOS = platform === PLATFORM_IOS;
    return this.flattenedHierarchy
      .filter((node) => {
        const hasAccText = !!node.accessibilityText;
        if (!hasAccText) return false;
        if (node.isImage) return true;
        if (isIOS && node.isElementTypeButton()) return true;
        if (isAndroid && node.classContainsButton()) return true;
        return false;
      })
      .map((node) => {
        const out: Record<string, unknown> = { index: node.index };
        if (node.accessibilityText) out['contentDesc'] = node.accessibilityText;
        const simpleClass = Hierarchy._shortenAndroidClass(node.clazz, platform);
        if (simpleClass) out['class'] = simpleClass;
        if (node.bounds) out['bounds'] = node.bounds;
        return out;
      });
  }

  /**
   * Hierarchy subset for the GROUNDER — every flattened node with a rich
   * field set.
   *
   * Filter: none (all flattened nodes are included).
   * Fields: index, text, contentDesc, id, class (Android class name shortened),
   * bounds, isScrollable, isFocused, isEditable, hintText, error, isSelected.
   *
   * The grounder needs maximum context to map a natural-language target
   * description to an element index reliably.
   */
  toPromptElementsForGrounder(platform?: string): Record<string, unknown>[] {
    return this.flattenedHierarchy.map((node) => {
      const out: Record<string, unknown> = { index: node.index };
      if (node.text) out['text'] = node.text;
      if (node.accessibilityText) out['contentDesc'] = node.accessibilityText;
      if (node.id) out['id'] = node.id;
      const simpleClass = Hierarchy._shortenAndroidClass(node.clazz, platform);
      if (simpleClass) out['class'] = simpleClass;
      if (node.bounds) out['bounds'] = node.bounds;
      if (node.isScrollable) out['isScrollable'] = true;
      if (node.isFocused) out['isFocused'] = true;
      if (node.isEditable) out['isEditable'] = true;
      if (node.hintText) out['hintText'] = node.hintText;
      if (node.error) out['error'] = node.error;
      if (node.isSelected) out['isSelected'] = true;
      return out;
    });
  }

  // ---------- private helpers ----------

  /**
   * Android classes come through fully qualified (e.g. `android.widget.Button`).
   * Shorten to the last `.`-separated segment so prompts stay terse.
   * iOS classes are left alone.
   */
  private static _shortenAndroidClass(
    clazz: string | null,
    platform: string | undefined,
  ): string | null {
    if (!clazz) return null;
    if (platform !== PLATFORM_ANDROID) return clazz;
    const parts = clazz.split('.');
    return parts[parts.length - 1] ?? clazz;
  }

  /**
   * Recursively parse a JSON node into a HierarchyNode.
   * Returns the node and a counter tracking the next available index.
   */
  private static _parseNode(
    json: Record<string, unknown>,
    startIndex: number,
  ): { node: HierarchyNode; nextIndex: number } {
    let currentIndex = startIndex;

    const childrenJson = (json['children'] as unknown[]) ?? [];
    const parsedChildren: HierarchyNode[] = [];

    for (const childJson of childrenJson) {
      const result = Hierarchy._parseNode(
        childJson as Record<string, unknown>,
        currentIndex + 1,
      );
      parsedChildren.push(result.node);
      currentIndex = result.nextIndex;
    }

    // Parse bounds: either array [l,t,r,b] or object {left,top,right,bottom}
    const bounds = Hierarchy._parseBounds(json['bounds']);

    const node = new HierarchyNode({
      index: startIndex,
      text: (json['text'] as string) ?? null,
      accessibilityText: (json['contentDesc'] as string) ?? (json['accessibilityText'] as string) ?? null,
      id: (json['id'] as string) ?? null,
      clazz: (json['class'] as string) ?? (json['clazz'] as string) ?? null,
      bounds,
      isScrollable: (json['isScrollable'] as boolean) ?? false,
      isFocused: (json['isFocused'] as boolean) ?? false,
      isEditable: (json['isEditable'] as boolean) ?? false,
      isImage: (json['isImage'] as boolean) ?? false,
      hintText: (json['hintText'] as string) ?? null,
      error: (json['error'] as string) ?? null,
      isSelected: (json['isSelected'] as boolean) ?? false,
      children: parsedChildren,
    });

    return { node, nextIndex: currentIndex };
  }

  /**
   * Flatten a node and all its descendants into a list.
   */
  private static _flattenNode(
    node: HierarchyNode,
    result: HierarchyNode[],
  ): void {
    result.push(node);
    for (const child of node.children) {
      Hierarchy._flattenNode(child, result);
    }
  }

  private static _parseFlatNode(
    json: Record<string, unknown>,
    index: number,
  ): HierarchyNode {
    let id =
      (json['id'] as string) ??
      (json['identifier'] as string) ??
      null;
    if (id && id.includes(':id/')) {
      id = id.split(':id/').at(-1) ?? id;
    }

    const clazz =
      (json['class'] as string) ??
      (json['clazz'] as string) ??
      null;

    return new HierarchyNode({
      index,
      text:
        (json['text'] as string) ??
        (json['title'] as string) ??
        (json['value'] as string) ??
        null,
      accessibilityText:
        (json['content_desc'] as string) ??
        (json['contentDesc'] as string) ??
        (json['accessibilityText'] as string) ??
        (json['label'] as string) ??
        null,
      id,
      clazz,
      bounds: Hierarchy._parseBounds(json['bounds']),
      isScrollable:
        (json['isScrollable'] as boolean) ??
        (json['is_scrollable'] as boolean) ??
        false,
      isFocused:
        (json['isFocused'] as boolean) ??
        (json['is_focused'] as boolean) ??
        false,
      isEditable:
        (json['isEditable'] as boolean) ??
        (json['is_editable'] as boolean) ??
        false,
      isImage: (
        (json['isImage'] as boolean) ??
        false
      ) || (
        (clazz?.includes('ImageView') ?? false) ||
        (clazz?.includes('ImageButton') ?? false) ||
        (clazz?.includes('SvgView') ?? false)
      ),
      hintText: (json['hintText'] as string) ?? null,
      error: (json['error'] as string) ?? null,
      isSelected:
        (json['isSelected'] as boolean) ??
        (json['is_selected'] as boolean) ??
        (json['is_checked'] as boolean) ??
        false,
      children: [],
    });
  }

  private static _parseBounds(
    rawBounds: unknown,
  ): [number, number, number, number] | null {
    if (Array.isArray(rawBounds) && rawBounds.length === 4) {
      return [
        Number(rawBounds[0]),
        Number(rawBounds[1]),
        Number(rawBounds[2]),
        Number(rawBounds[3]),
      ];
    }

    if (
      rawBounds &&
      typeof rawBounds === 'object' &&
      'left' in rawBounds &&
      'top' in rawBounds &&
      'right' in rawBounds &&
      'bottom' in rawBounds
    ) {
      const bounds = rawBounds as Record<string, unknown>;
      return [
        Number(bounds['left']),
        Number(bounds['top']),
        Number(bounds['right']),
        Number(bounds['bottom']),
      ];
    }

    return null;
  }
}
