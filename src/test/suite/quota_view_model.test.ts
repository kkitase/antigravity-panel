import * as assert from 'assert';
import { QuotaViewModel } from '../../core/quota_view_model';
import { QuotaHistoryManager } from '../../core/quota_history';
import { ConfigManager } from '../../core/config_manager';
import { QuotaSnapshot, ModelQuotaInfo } from '../../core/quota_manager';

// Helper to create model quota info with default values
function createModel(
  modelId: string,
  label: string,
  remainingPercentage: number,
  timeUntilReset = '2h'
): ModelQuotaInfo {
  return {
    modelId,
    label,
    remainingPercentage,
    timeUntilReset,
    isExhausted: remainingPercentage <= 0,
    resetTime: new Date(Date.now() + 2 * 60 * 60 * 1000)
  };
}

// Helper to create quota snapshot
function createSnapshot(models: ModelQuotaInfo[]): QuotaSnapshot {
  return {
    models,
    timestamp: new Date()
  };
}

// Mock VS Code Memento interface
interface Memento {
  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  update(key: string, value: any): Thenable<void>;
}

class MockMemento implements Memento {
  private storage = new Map<string, any>();

  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  get(key: string, defaultValue?: any) {
    return this.storage.has(key) ? this.storage.get(key) : defaultValue;
  }

  update(key: string, value: any): Thenable<void> {
    this.storage.set(key, value);
    return Promise.resolve();
  }

  keys(): readonly string[] {
    return Array.from(this.storage.keys());
  }
}

// Mock ConfigManager
class MockConfigManager {
  private config = {
    pollingInterval: 120,
    historyDisplayMinutes: 60,
    showQuota: true,
    showCacheSize: true,
    debugMode: false,
    quotaWarningThreshold: 30,
    quotaCriticalThreshold: 10,
    visualizationMode: 'groups' as const
  };

  getConfig() {
    return this.config;
  }

  get<T>(key: string, defaultValue: T): T {
    return (this.config as any)[key] ?? defaultValue;
  }
}

suite('QuotaViewModel Test Suite', () => {
  let globalState: MockMemento;
  let historyManager: QuotaHistoryManager;
  let configManager: MockConfigManager;
  let viewModel: QuotaViewModel;

  setup(() => {
    globalState = new MockMemento();
    historyManager = new QuotaHistoryManager(globalState);
    configManager = new MockConfigManager();
    viewModel = new QuotaViewModel(historyManager, configManager as unknown as ConfigManager);
  });

  test('should initialize with empty state', () => {
    const state = viewModel.getState();
    assert.ok(state.groups.length > 0, 'Should have groups from strategy config');
    assert.ok(state.activeGroupId, 'Should have an active group ID');
    assert.strictEqual(state.lastUpdated, 0, 'Last updated should be 0 initially');
  });

  test('should aggregate quota snapshot into groups', async () => {
    const snapshot = createSnapshot([
      createModel('gemini-3-pro-high', 'Gemini 3 Pro', 80),
      createModel('gemini-3-pro-low', 'Gemini 3 Pro Low', 85),
      createModel('claude-4-5-sonnet', 'Claude Sonnet', 37, '3h')
    ]);

    await viewModel.updateFromSnapshot(snapshot);
    const state = viewModel.getState();

    // Find Gemini and Claude groups
    const geminiGroup = state.groups.find(g => g.id === 'gemini');
    const claudeGroup = state.groups.find(g => g.id === 'claude');

    assert.ok(geminiGroup, 'Should have Gemini group');
    assert.ok(claudeGroup, 'Should have Claude group');

    // Gemini should use minimum (80%)
    assert.strictEqual(geminiGroup.remaining, 80, 'Gemini should use minimum remaining');
    assert.ok(geminiGroup.hasData, 'Gemini should have data');

    // Claude should be 37%
    assert.strictEqual(claudeGroup.remaining, 37, 'Claude should be 37%');
    assert.ok(claudeGroup.hasData, 'Claude should have data');
  });

  test('should detect active group based on consumption', async () => {
    // First snapshot: both groups at 100%
    const snapshot1 = createSnapshot([
      createModel('gemini-3-pro-high', 'Gemini', 100),
      createModel('claude-4-5-sonnet', 'Claude', 100, '3h')
    ]);

    await viewModel.updateFromSnapshot(snapshot1);

    // Second snapshot: Claude drops by 5% (should trigger active group change)
    const snapshot2 = createSnapshot([
      createModel('gemini-3-pro-high', 'Gemini', 100),
      createModel('claude-4-5-sonnet', 'Claude', 95, '3h')
    ]);

    await viewModel.updateFromSnapshot(snapshot2);
    const state2 = viewModel.getState();

    // Active group should now be Claude (it had the biggest drop > 0.1%)
    assert.strictEqual(state2.activeGroupId, 'claude', 'Active group should be Claude after consumption');
  });

  test('should not change active group for small consumption', async () => {
    // First snapshot
    const snapshot1 = createSnapshot([
      createModel('gemini-3-pro-high', 'Gemini', 100)
    ]);
    await viewModel.updateFromSnapshot(snapshot1);

    // Second snapshot: tiny drop (0.05% < 0.1% threshold)
    const snapshot2 = createSnapshot([
      createModel('gemini-3-pro-high', 'Gemini', 99.95)
    ]);
    await viewModel.updateFromSnapshot(snapshot2);

    // Active group should remain gemini (default)
    const state = viewModel.getState();
    assert.strictEqual(state.activeGroupId, 'gemini');
  });

  test('should provide correct StatusBar data', async () => {
    // Simulate Claude being active by consuming quota
    await viewModel.updateFromSnapshot(createSnapshot([
      createModel('gemini-3-pro-high', 'Gemini', 80),
      createModel('claude-4-5-sonnet', 'Claude', 50, '3h')
    ]));
    await viewModel.updateFromSnapshot(createSnapshot([
      createModel('gemini-3-pro-high', 'Gemini', 80),
      createModel('claude-4-5-sonnet', 'Claude', 37, '3h')
    ]));

    const statusData = viewModel.getStatusBarData();

    assert.strictEqual(statusData.label, 'Claude', 'StatusBar should show Claude as active');
    assert.strictEqual(statusData.percentage, 37, 'StatusBar should show Claude percentage');
    assert.ok(statusData.color.startsWith('#'), 'StatusBar should have valid color');
  });

  test('should provide correct Sidebar quotas', async () => {
    const snapshot = createSnapshot([
      createModel('gemini-3-pro-high', 'Gemini', 80),
      createModel('claude-4-5-sonnet', 'Claude', 37, '3h')
    ]);

    await viewModel.updateFromSnapshot(snapshot);
    const quotas = viewModel.getSidebarQuotas();

    assert.ok(quotas.length > 0, 'Should have quotas');

    const gemini = quotas.find(q => q.id === 'gemini');
    const claude = quotas.find(q => q.id === 'claude');

    assert.ok(gemini, 'Should have Gemini quota');
    assert.ok(claude, 'Should have Claude quota');
    assert.strictEqual(gemini.type, 'group', 'Should be group type');
    assert.strictEqual(gemini.remaining, 80);
    assert.strictEqual(claude.remaining, 37);
  });

  test('should restore state from cache', async () => {
    // First, update with some data
    const snapshot = createSnapshot([
      createModel('claude-4-5-sonnet', 'Claude', 42, '3h')
    ]);
    await viewModel.updateFromSnapshot(snapshot);

    // Create new ViewModel instance (simulating restart)
    const newViewModel = new QuotaViewModel(historyManager, configManager as unknown as ConfigManager);

    // Restore from cache
    const cachedState = newViewModel.restoreFromCache();

    assert.ok(cachedState, 'Should restore cached state');

    const claudeGroup = cachedState!.groups.find(g => g.id === 'claude');
    assert.ok(claudeGroup, 'Should have Claude group in cached state');
    assert.strictEqual(claudeGroup.remaining, 42, 'Should restore correct remaining percentage');
  });

  test('should return null when no cache exists', () => {
    // Fresh ViewModel with no prior state
    const cachedState = viewModel.restoreFromCache();
    assert.strictEqual(cachedState, null, 'Should return null when no cache');
  });

  test('should update lastUpdated timestamp', async () => {
    const snapshot = createSnapshot([
      createModel('gemini-3-pro-high', 'Gemini', 80)
    ]);

    const beforeUpdate = Date.now();
    await viewModel.updateFromSnapshot(snapshot);
    const afterUpdate = Date.now();

    const state = viewModel.getState();
    assert.ok(state.lastUpdated >= beforeUpdate, 'lastUpdated should be after beforeUpdate');
    assert.ok(state.lastUpdated <= afterUpdate, 'lastUpdated should be before afterUpdate');
  });

  test('should handle empty models array', async () => {
    const snapshot = createSnapshot([]);

    await viewModel.updateFromSnapshot(snapshot);
    const state = viewModel.getState();

    // Groups should exist but with no data
    assert.ok(state.groups.length > 0, 'Should still have groups');
    state.groups.forEach(g => {
      assert.strictEqual(g.hasData, false, `Group ${g.id} should have hasData=false`);
    });
  });

  test('should generate chart data with prediction', async () => {
    const snapshot = createSnapshot([
      createModel('gemini-3-pro-high', 'Gemini', 80)
    ]);

    await viewModel.updateFromSnapshot(snapshot);
    const chartData = viewModel.getChartData();

    assert.ok(chartData, 'Should have chart data');
    assert.ok(chartData.buckets, 'Should have buckets');
    assert.ok(chartData.displayMinutes > 0, 'Should have display minutes');
    assert.ok(chartData.interval > 0, 'Should have interval');

    if (chartData.prediction) {
      assert.ok(chartData.prediction.groupId, 'Prediction should have groupId');
      assert.ok(chartData.prediction.groupLabel, 'Prediction should have groupLabel');
      assert.ok(typeof chartData.prediction.usageRate === 'number', 'Prediction should have usageRate');
      assert.ok(chartData.prediction.runway, 'Prediction should have runway');
    }
  });

  test('should get active group ID', async () => {
    const snapshot = createSnapshot([
      createModel('gemini-3-pro-high', 'Gemini', 100),
      createModel('claude-4-5-sonnet', 'Claude', 100, '3h')
    ]);

    await viewModel.updateFromSnapshot(snapshot);

    // Simulate Claude consumption
    await viewModel.updateFromSnapshot(createSnapshot([
      createModel('gemini-3-pro-high', 'Gemini', 100),
      createModel('claude-4-5-sonnet', 'Claude', 90, '3h')
    ]));

    const activeGroupId = viewModel.getActiveGroupId();
    assert.strictEqual(activeGroupId, 'claude', 'Active group should be Claude');
  });
});

