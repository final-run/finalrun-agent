// Matches the legacy renderTintedPngIcon() markup exactly:
//   <span class="tinted-png-icon" style="--icon-mask:url('...');" aria-hidden="true"></span>

import type { CSSProperties } from 'react';

export function TintedPngIcon({ src }: { src: string }) {
  const style = { '--icon-mask': `url('${src}')` } as CSSProperties;
  return <span className="tinted-png-icon" style={style} aria-hidden="true" />;
}
