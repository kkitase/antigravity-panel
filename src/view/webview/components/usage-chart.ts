/**
 * UsageChart - 使用量柱状图组件 (Light DOM)
 */

import { LitElement, html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { UsageChartData, WindowWithVsCode } from '../types.js';

@customElement('usage-chart')
export class UsageChart extends LitElement {
  @property({ type: Object })
  data: UsageChartData | null = null;

  // Light DOM 模式
  createRenderRoot() { return this; }

  protected render() {
    if (!this.data || !this.data.buckets || this.data.buckets.length === 0) {
      return nothing;
    }

    const { buckets, maxUsage, interval, prediction } = this.data;
    const t = (window as unknown as WindowWithVsCode).__TRANSLATIONS__;

    const timelineText = `${t?.timeline || 'Timeline'}: ${this.data.displayMinutes} ${t?.min || 'min'} · ${t?.step || 'Step'}: ${interval} ${t?.sec || 'sec'}`;

    return html`
      <div class="usage-chart">
        <div class="usage-chart-title">
          <span>${t?.usageHistory || 'Usage History'}</span>
          <span>${t?.max || 'max'}: ${maxUsage.toFixed(1)}%</span>
        </div>
        <div class="usage-chart-bars">
          ${buckets.map(bucket => {
      const maxHeight = 36;
      let currentHeight = 0;
      const gradientStops: string[] = [];
      const tooltipParts: string[] = [];

      if (bucket.items && bucket.items.length > 0) {
        for (const item of bucket.items) {
          const height = (item.usage / maxUsage) * maxHeight;
          const start = currentHeight;
          const end = currentHeight + height;
          gradientStops.push(`${item.color} ${start}px ${end}px`);

          currentHeight = end;
          tooltipParts.push(`${item.groupId}: ${item.usage.toFixed(1)}%`);
        }
      }

      const totalHeight = Math.max(3, currentHeight);
      const background = gradientStops.length > 0
        ? `linear-gradient(to top, ${gradientStops.join(', ')})`
        : 'rgba(255, 255, 255, 0.15)';

      const tooltip = tooltipParts.length > 0 ? tooltipParts.join('\n') : 'No usage data';

      return html`
              <div class="usage-bar" 
                   style="height: ${totalHeight}px; background: ${background}" 
                   data-tooltip="${tooltip}">
              </div>`;
    })}
        </div>
        <div class="usage-legend">
          <div class="timeline-info">${timelineText}</div>
          <div class="prediction-info" style="display: flex; gap: 6px;">
            ${prediction && prediction.usageRate > 0 ? html`
              <span data-tooltip="${t?.usageRateTooltip || 'Usage Rate: Average percentage of quota consumed per hour'}">
                🔥${prediction.usageRate.toFixed(1)}%/h
              </span>
              <span class="legend-sep">·</span>
              <span data-tooltip="${t?.runwayTooltip || 'Runway: Estimated remaining time before quota is exhausted'}">
                ⏱️${prediction.runway}
              </span>
            ` : (prediction ? html`
              <span data-tooltip="${t?.stableStatusTooltip || 'Quota usage status: Stable'}">
                ⏱️Stable
              </span>
            ` : nothing)}
          </div>
        </div>
      </div>
    `;
  }
}
