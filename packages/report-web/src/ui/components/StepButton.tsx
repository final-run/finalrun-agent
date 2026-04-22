'use client';

import type { AgentAction } from '@finalrun/common';
import { formatStepDuration } from '../format';
import { resolveStepReasoning } from '../viewModel';
import { selectStep } from '../client/runDetailController';

// Mirrors renderStepButton():
//   <button class="step-button {is-selected?}" data-test-id="..." data-step-index="..." type="button">
//     <div class="step-row">
//       <span class="step-icon {statusClass}">{glyph}</span>
//       <div class="step-copy"><div class="step-title">{naturalLanguage || actionType}</div></div>
//       <div class="duration-chip">{duration}</div>
//     </div>
//     {reasoning && <div class="step-expanded"><div class="step-reasoning-copy">{reasoning}</div></div>}
//   </button>
export function StepButton({
  testId,
  step,
  index,
}: {
  testId: string;
  step: AgentAction;
  index: number;
}) {
  const statusClass: 'success' | 'failure' | 'error' = step.success
    ? 'success'
    : step.actionType === 'run_failure'
      ? 'error'
      : 'failure';
  const reasoning = resolveStepReasoning(step);
  const glyph = statusClass === 'success' ? '✓' : '!';
  const title = step.naturalLanguageAction || step.actionType;
  // Hide the duration chip entirely when the step has no recorded duration
  // (cloud runs don't store per-step timestamps, so they'd otherwise show
  // "0.0s" on every row, which is misleading).
  const durationMs = step.durationMs ?? step.trace?.totalMs ?? 0;
  const duration = durationMs > 0 ? formatStepDuration(durationMs) : null;

  return (
    <button
      className={`step-button${index === 0 ? ' is-selected' : ''}`}
      data-test-id={testId}
      data-step-index={index}
      onClick={() => selectStep(testId, index)}
      type="button"
    >
      <div className="step-row">
        <span className={`step-icon ${statusClass}`}>{glyph}</span>
        <div className="step-copy">
          <div className="step-title">{title}</div>
        </div>
        {duration ? <div className="duration-chip">{duration}</div> : null}
      </div>
      {reasoning ? (
        <div className="step-expanded">
          <div className="step-reasoning-copy">{reasoning}</div>
        </div>
      ) : null}
    </button>
  );
}
