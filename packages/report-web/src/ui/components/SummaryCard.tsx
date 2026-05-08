import type { CSSProperties, ReactNode } from 'react';
import { summaryIconStyle, type SummaryTone } from '../format';

export function SummaryCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone: SummaryTone;
  icon: ReactNode;
}) {
  return (
    <div className="summary-card">
      <span className="summary-card-icon" style={inlineStyleFromString(summaryIconStyle(tone))}>
        {icon}
      </span>
      <span>
        <div className="summary-card-label">{label}</div>
        <div className="summary-card-value">{value}</div>
      </span>
    </div>
  );
}

// Helper: the legacy renderer emitted raw `style="color: x; background: y;"`
// strings. React wants a camelCased object. This parses a CSS declaration list
// back into the object form so the rendered HTML is byte-identical in effect.
function inlineStyleFromString(css: string): CSSProperties {
  const result: Record<string, string> = {};
  for (const rule of css.split(';')) {
    const [rawProp, ...rest] = rule.split(':');
    if (!rawProp || rest.length === 0) continue;
    const prop = rawProp.trim();
    const value = rest.join(':').trim();
    if (!prop || !value) continue;
    const camel = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    result[camel] = value;
  }
  return result as CSSProperties;
}
