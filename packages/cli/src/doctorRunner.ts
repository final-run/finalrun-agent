import type { Writable } from 'node:stream';
import {
  formatHostPreflightReport,
  hasBlockingPreflightFailures,
  resolveDoctorRequestedPlatforms,
  runHostPreflight,
  hostPreflightDependencies,
  type HostPreflightDependencies,
  type HostPreflightResult,
} from './hostPreflight.js';

export interface DoctorRunnerOptions {
  platform?: string;
  output?: Writable;
}

export interface DoctorRunnerDependencies {
  runHostPreflight: typeof runHostPreflight;
  hostPreflightDependencies: Pick<HostPreflightDependencies, 'getPlatform'>;
}

export interface DoctorRunnerResult {
  success: boolean;
  report: string;
  preflight: HostPreflightResult;
}

export const doctorRunnerDependencies: DoctorRunnerDependencies = {
  runHostPreflight,
  hostPreflightDependencies,
};

export async function runDoctorCommand(
  options: DoctorRunnerOptions,
  dependencies: DoctorRunnerDependencies = doctorRunnerDependencies,
): Promise<DoctorRunnerResult> {
  const requestedPlatforms = resolveDoctorRequestedPlatforms(
    options.platform,
    dependencies.hostPreflightDependencies.getPlatform(),
  );
  const preflight = await dependencies.runHostPreflight({
    requestedPlatforms,
  });
  const report = formatHostPreflightReport(preflight, 'doctor');
  if (options.output) {
    options.output.write(`${report}\n`);
  }

  return {
    success: !hasBlockingPreflightFailures(preflight),
    report,
    preflight,
  };
}
