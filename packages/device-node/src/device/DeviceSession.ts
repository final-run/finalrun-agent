// Minimal session state carried across device actions.
// Restores the subset of Dart's DeviceSession needed for screenshot capture.

export class DeviceSession {
  private _shouldEnsureStability = true;

  get shouldEnsureStability(): boolean {
    return this._shouldEnsureStability;
  }

  setShouldEnsureStability(shouldEnsureStability: boolean | undefined): void {
    this._shouldEnsureStability = shouldEnsureStability ?? true;
  }
}
