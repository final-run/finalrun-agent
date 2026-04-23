import type { ReactNode } from 'react';

// Mirrors renderDetailSectionCard():
//   <div class="detail-section-shell">
//     <div class="detail-section-card {cardClass}">
//       <div class="detail-section-header">
//         <div class="detail-section-copy">
//           <h3 class="detail-section-title">{title}</h3>
//           <p class="detail-section-subtitle">{subtitle}</p>
//         </div>
//         {action}
//       </div>
//       {content}
//     </div>
//   </div>
export function DetailSectionCard({
  title,
  subtitle,
  content,
  action,
  cardClass,
}: {
  title: string;
  subtitle: string;
  content: ReactNode;
  action?: ReactNode;
  cardClass?: string;
}) {
  return (
    <div className="detail-section-shell">
      <div className={`detail-section-card ${cardClass ?? ''}`.trim()}>
        <div className="detail-section-header">
          <div className="detail-section-copy">
            <h3 className="detail-section-title">{title}</h3>
            <p className="detail-section-subtitle">{subtitle}</p>
          </div>
          {action}
        </div>
        {content}
      </div>
    </div>
  );
}
