/**
 * QuotaViewModel: Unified quota data aggregation layer (MVVM architecture)
 *
 * Responsibilities:
 * - Aggregate server quota data into UI groups
 * - Detect active group based on quota consumption
 * - Provide cache restoration and persistence
 * - Single source of truth for StatusBar and Sidebar
 */

import { QuotaSnapshot } from './quota_manager';
import { QuotaStrategyManager } from './quota_strategy_manager';
import { QuotaHistoryManager, UsageBucket } from './quota_history';
import { ConfigManager } from './config_manager';
import { QuotaDisplayItem, UsageChartData } from '../ui/webview/types';

/** Group quota state for caching */
export interface QuotaGroupState {
  id: string;
  label: string;
  remaining: number;
  resetTime: string;
  themeColor: string;
  hasData: boolean;
}

/** Complete ViewModel state (cacheable) */
export interface QuotaViewState {
  groups: QuotaGroupState[];
  activeGroupId: string;
  chart: UsageChartData;
  lastUpdated: number;
}

/** StatusBar display data */
export interface StatusBarData {
  label: string;
  percentage: number;
  resetTime: string;
  color: string;
}

const ACTIVE_GROUP_THRESHOLD = 0.1; // Minimum consumption to trigger active group change

export class QuotaViewModel {
  private state: QuotaViewState;
  private lastSnapshot: QuotaSnapshot | null = null;  // Store original snapshot for models mode
  private readonly strategyManager: QuotaStrategyManager;
  private readonly historyManager: QuotaHistoryManager;
  private readonly configManager: ConfigManager;

  constructor(historyManager: QuotaHistoryManager, configManager: ConfigManager) {
    this.strategyManager = new QuotaStrategyManager();
    this.historyManager = historyManager;
    this.configManager = configManager;
    this.state = this.createEmptyState();
  }

  private createEmptyState(): QuotaViewState {
    const groups = this.strategyManager.getGroups();
    return {
      groups: groups.map(g => ({
        id: g.id,
        label: g.label,
        remaining: 0,
        resetTime: 'N/A',
        themeColor: g.themeColor,
        hasData: false
      })),
      activeGroupId: groups[0]?.id || 'gemini',
      chart: { buckets: [], maxUsage: 1, displayMinutes: 60, interval: 120 },
      lastUpdated: 0
    };
  }

  /** Aggregate server data into groups (reuses SidebarProvider._aggregateQuotas logic) */
  private aggregateGroups(snapshot: QuotaSnapshot): QuotaGroupState[] {
    const models = snapshot.models || [];
    const groups = this.strategyManager.getGroups();

    return groups.map(group => {
      const groupModels = models.filter(m =>
        this.strategyManager.getGroupForModel(m.modelId, m.label).id === group.id
      );

      if (groupModels.length === 0) {
        return {
          id: group.id,
          label: group.label,
          remaining: 0,
          resetTime: 'N/A',
          themeColor: group.themeColor,
          hasData: false
        };
      }

      // Take minimum remaining percentage (most restrictive)
      const minModel = groupModels.reduce((min, m) =>
        m.remainingPercentage < min.remainingPercentage ? m : min
      );

      return {
        id: group.id,
        label: group.label,
        remaining: minModel.remainingPercentage,
        resetTime: minModel.timeUntilReset,
        themeColor: group.themeColor,
        hasData: true
      };
    });
  }

  /** Detect which group is currently active based on consumption changes */
  private detectActiveGroup(prevState: QuotaViewState, newGroups: QuotaGroupState[]): string {
    let maxDrop = 0;
    let activeId = prevState.activeGroupId;

    for (const group of newGroups) {
      if (!group.hasData) continue;
      
      const prev = prevState.groups.find(g => g.id === group.id);
      if (prev && prev.hasData) {
        const drop = prev.remaining - group.remaining;
        if (drop > maxDrop && drop > ACTIVE_GROUP_THRESHOLD) {
          maxDrop = drop;
          activeId = group.id;
        }
      }
    }

    return activeId;
  }

  /** Build chart data from history */
  private buildChartData(activeGroupId: string, currentRemaining: number): UsageChartData {
    const config = this.configManager.getConfig();
    const buckets = this.historyManager.calculateUsageBuckets(
      config.historyDisplayMinutes,
      config.pollingInterval / 60
    );

    // Inject colors
    const coloredBuckets = buckets.map(b => ({
      ...b,
      items: b.items.map(item => ({
        ...item,
        color: this.strategyManager.getGroups()
          .find(g => g.id === item.groupId)?.themeColor || '#888'
      }))
    }));

    const maxUsage = this.historyManager.getMaxUsage(buckets);

    // Calculate prediction
    const prediction = this.calculatePrediction(buckets, activeGroupId, currentRemaining, config);

    return {
      buckets: coloredBuckets,
      maxUsage,
      displayMinutes: config.historyDisplayMinutes,
      interval: config.pollingInterval,
      prediction
    };
  }

  private calculatePrediction(
    buckets: UsageBucket[],
    activeGroupId: string,
    currentRemaining: number,
    config: ReturnType<ConfigManager['getConfig']>
  ): UsageChartData['prediction'] {
    let totalUsage = 0;
    for (const bucket of buckets) {
      for (const item of bucket.items) {
        if (item.groupId === activeGroupId) {
          totalUsage += item.usage;
        }
      }
    }

    const displayHours = config.historyDisplayMinutes / 60;
    const usageRate = displayHours > 0 ? totalUsage / displayHours : 0;

    let runway = 'Stable';
    if (usageRate > 0 && currentRemaining > 0) {
      const hoursUntilEmpty = currentRemaining / usageRate;
      if (hoursUntilEmpty > 168) runway = '>7d';
      else if (hoursUntilEmpty > 24) runway = `~${Math.round(hoursUntilEmpty / 24)}d`;
      else if (hoursUntilEmpty > 1) runway = `~${Math.round(hoursUntilEmpty)}h`;
      else runway = `~${Math.round(hoursUntilEmpty * 60)}m`;
    }

    const activeGroup = this.strategyManager.getGroups().find(g => g.id === activeGroupId);

    return {
      groupId: activeGroupId,
      groupLabel: activeGroup?.label || activeGroupId,
      usageRate,
      runway,
      remaining: currentRemaining
    };
  }

  // ==================== Public API ====================

  /** Restore state from cache (for startup) */
  restoreFromCache(): QuotaViewState | null {
    const cached = this.historyManager.getLastViewState<QuotaViewState>();
    if (cached && cached.groups && cached.activeGroupId) {
      this.state = cached;

      // Also restore snapshot for models mode
      const cachedSnapshot = this.historyManager.getLastSnapshot<QuotaSnapshot>();
      if (cachedSnapshot) {
        this.lastSnapshot = cachedSnapshot;
      }

      return cached;
    }
    return null;
  }

  /** Update state from new server snapshot */
  async updateFromSnapshot(snapshot: QuotaSnapshot): Promise<QuotaViewState> {
    // Store original snapshot for models mode
    this.lastSnapshot = snapshot;

    const prevState = this.state;
    const newGroups = this.aggregateGroups(snapshot);
    const activeGroupId = this.detectActiveGroup(prevState, newGroups);

    // Get current remaining for active group
    const activeGroup = newGroups.find(g => g.id === activeGroupId);
    const currentRemaining = activeGroup?.remaining || 0;

    // Record history
    const quotaPoolRecord: Record<string, number> = {};
    for (const group of newGroups) {
      if (group.hasData) {
        quotaPoolRecord[group.id] = group.remaining;
      }
    }
    await this.historyManager.record(quotaPoolRecord);

    // Build chart data
    const chart = this.buildChartData(activeGroupId, currentRemaining);

    // Update state
    this.state = {
      groups: newGroups,
      activeGroupId,
      chart,
      lastUpdated: Date.now()
    };

    // Persist to cache
    await this.historyManager.setLastViewState(this.state);
    await this.historyManager.setLastSnapshot(snapshot);  // Cache snapshot for models mode
    await this.historyManager.setLastDisplayPercentage(Math.round(currentRemaining));
    await this.historyManager.setLastPrediction(
      chart.prediction?.usageRate || 0,
      chart.prediction?.runway || 'Stable',
      activeGroupId
    );

    return this.state;
  }

  /** Get current state (for cache-first rendering) */
  getState(): QuotaViewState {
    return this.state;
  }

  /** Get StatusBar display data */
  getStatusBarData(): StatusBarData {
    const activeGroup = this.state.groups.find(g => g.id === this.state.activeGroupId);
    return {
      label: activeGroup?.label || 'Unknown',
      percentage: Math.round(activeGroup?.remaining || 0),
      resetTime: activeGroup?.resetTime || 'N/A',
      color: activeGroup?.themeColor || '#888'
    };
  }

  /** Get Sidebar quota display items (filtered by config, supports both groups and models mode) */
  getSidebarQuotas(): QuotaDisplayItem[] {
    const config = this.configManager.getConfig();
    const hiddenGroupId = config.showGptQuota ? null : 'gpt';
    const mode = config.visualizationMode;

    if (mode === 'models' && this.lastSnapshot) {
      // Models mode: return individual models
      const models = this.lastSnapshot.models || [];

      // Filter out GPT models if showGptQuota is disabled
      const filteredModels = hiddenGroupId
        ? models.filter(m => this.strategyManager.getGroupForModel(m.modelId, m.label).id !== hiddenGroupId)
        : models;

      // Get all config models for sorting
      const allConfigModels: { id: string }[] = [];
      this.strategyManager.getGroups().forEach(g => allConfigModels.push(...g.models));

      // Sort by config order
      const sortedModels = [...filteredModels].sort((a, b) => {
        const defA = this.strategyManager.getModelDefinition(a.modelId, a.label);
        const defB = this.strategyManager.getModelDefinition(b.modelId, b.label);
        const indexA = defA ? allConfigModels.findIndex(m => m.id === defA.id) : 9999;
        const indexB = defB ? allConfigModels.findIndex(m => m.id === defB.id) : 9999;
        return indexA - indexB;
      });

      return sortedModels.map(m => {
        const group = this.strategyManager.getGroupForModel(m.modelId, m.label);
        const configuredName = this.strategyManager.getModelDisplayName(m.modelId, m.label);
        const displayName = configuredName || m.label || m.modelId;

        return {
          id: m.modelId,
          label: displayName,
          type: 'model' as const,
          remaining: m.remainingPercentage,
          resetTime: m.timeUntilReset,
          hasData: true,
          themeColor: group.themeColor,
          subLabel: config.debugMode ? m.modelId : undefined
        };
      });
    }

    // Groups mode (default)
    return this.state.groups
      .filter(g => g.id !== hiddenGroupId)
      .map(g => ({
        id: g.id,
        label: g.label,
        type: 'group' as const,
        remaining: g.remaining,
        resetTime: g.resetTime,
        hasData: g.hasData,
        themeColor: g.themeColor
      }));
  }

  /** Get chart data (filtered by config) */
  getChartData(): UsageChartData {
    const config = this.configManager.getConfig();
    const hiddenGroupId = config.showGptQuota ? null : 'gpt';

    if (!hiddenGroupId) {
      return this.state.chart;
    }

    // Filter out hidden group from chart buckets
    const filteredBuckets = this.state.chart.buckets.map(bucket => ({
      ...bucket,
      items: bucket.items.filter(item => item.groupId !== hiddenGroupId)
    }));

    return {
      ...this.state.chart,
      buckets: filteredBuckets
    };
  }

  /** Get active group ID */
  getActiveGroupId(): string {
    return this.state.activeGroupId;
  }
}
