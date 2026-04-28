// React-element forms of the inline SVGs used by SummaryCard. Kept as
// ReactElement so the SummaryCard contract can take a typed node instead of
// a string — closing the dangerouslySetInnerHTML XSS boundary at compile
// time.

import type { ReactElement } from 'react';

export const PLAY_CIRCLE_ICON_NODE: ReactElement = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="8" />
    <path d="M10.4 8.8l5.2 3.2-5.2 3.2z" fill="currentColor" stroke="none" />
  </svg>
);

export const CHECK_CIRCLE_ICON_NODE: ReactElement = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="8" />
    <path d="M8.8 12.2l2.1 2.1 4.3-4.6" />
  </svg>
);

export const TIMER_ICON_NODE: ReactElement = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="13" r="7" />
    <path d="M12 13V9.5" />
    <path d="M15 5h-6" />
  </svg>
);
