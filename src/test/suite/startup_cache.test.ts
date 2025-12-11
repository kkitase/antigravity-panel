/**
 * Startup Cache Rendering Tests
 * 
 * Tests for cache-first startup behavior as specified in refactoring document:
 * 1. With cache: StatusBar shows cached quota immediately (not Loading)
 * 2. With cache: Pie chart shows cached group quotas (not empty)
 * 3. With cache: Tree shows cached task list (not Loading)
 * 4. Without cache: Normal degradation to Loading state
 */

import * as assert from 'assert';
import { QuotaViewModel, QuotaViewState, QuotaGroupState } from '../../core/quota_view_model';
import { QuotaHistoryManager, CachedTreeState, CachedTaskInfo } from '../../core/quota_history';
import { ConfigManager } from '../../core/config_manager';

// Mock VS Code Memento
class MockMemento {
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

  // Test helper: clear all data
  clear(): void {
    this.storage.clear();
  }

  // Test helper: set data directly
  set(key: string, value: any): void {
    this.storage.set(key, value);
  }
}

// Mock ConfigManager
class MockConfigManager {
  private config = {
    pollingInterval: 120,
    historyDisplayMinutes: 60,
    statusBarThresholdWarning: 30,
    statusBarThresholdCritical: 10,
    statusBarShowQuota: true,
    statusBarShowCache: true,
    statusBarStyle: 'percentage' as const,
    showGptQuota: true,  // Enable for testing all groups
    debugMode: false
  };

  getConfig() {
    return this.config;
  }

  get<T>(key: string, defaultValue: T): T {
    return (this.config as any)[key] ?? defaultValue;
  }
}

suite('Startup Cache Rendering', () => {
  let memento: MockMemento;
  let historyManager: QuotaHistoryManager;
  let configManager: MockConfigManager;
  let viewModel: QuotaViewModel;

  setup(() => {
    memento = new MockMemento();
    historyManager = new QuotaHistoryManager(memento as any);
    configManager = new MockConfigManager();
    viewModel = new QuotaViewModel(historyManager, configManager as unknown as ConfigManager);
  });

  suite('StatusBar Cache-First Rendering', () => {
    test('should restore cached quota for StatusBar immediately', async () => {
      // Setup: Pre-populate cache with quota state
      const cachedState: QuotaViewState = {
        groups: [
          { id: 'gemini', label: 'Gemini', remaining: 75.5, resetTime: '2h', themeColor: '#4285F4', hasData: true },
          { id: 'claude', label: 'Claude', remaining: 45.2, resetTime: '3h', themeColor: '#D97706', hasData: true },
          { id: 'gpt', label: 'GPT', remaining: 90.0, resetTime: '1h', themeColor: '#10A37F', hasData: true }
        ],
        activeGroupId: 'claude',
        chart: { buckets: [], maxUsage: 1, displayMinutes: 60, interval: 120 },
        lastUpdated: Date.now() - 5000
      };
      await historyManager.setLastViewState(cachedState);

      // Action: Restore from cache (simulates startup)
      const restored = viewModel.restoreFromCache();

      // Assert: StatusBar data is immediately available
      assert.ok(restored, 'Cache should be restored');
      const statusData = viewModel.getStatusBarData();
      assert.strictEqual(statusData.label, 'Claude', 'Should show active group from cache');
      assert.strictEqual(statusData.percentage, 45, 'Should show cached percentage');
      assert.strictEqual(statusData.color, '#D97706', 'Should show cached theme color');
    });

    test('should return null when no cache exists', () => {
      // Action: Try to restore from empty cache
      const restored = viewModel.restoreFromCache();

      // Assert: No cache available
      assert.strictEqual(restored, null, 'Should return null when no cache');

      // StatusBar should show default/empty state
      const statusData = viewModel.getStatusBarData();
      assert.strictEqual(statusData.percentage, 0, 'Should show 0% when no cache');
    });
  });

  suite('Pie Chart Cache-First Rendering', () => {
    test('should restore all group quotas for pie chart immediately', async () => {
      // Setup: Pre-populate cache
      const cachedState: QuotaViewState = {
        groups: [
          { id: 'gemini', label: 'Gemini', remaining: 80, resetTime: '2h', themeColor: '#4285F4', hasData: true },
          { id: 'claude', label: 'Claude', remaining: 60, resetTime: '3h', themeColor: '#D97706', hasData: true },
          { id: 'gpt', label: 'GPT', remaining: 40, resetTime: '1h', themeColor: '#10A37F', hasData: true }
        ],
        activeGroupId: 'gemini',
        chart: { buckets: [], maxUsage: 1, displayMinutes: 60, interval: 120 },
        lastUpdated: Date.now()
      };
      await historyManager.setLastViewState(cachedState);

      // Action: Restore from cache
      viewModel.restoreFromCache();
      const quotas = viewModel.getSidebarQuotas();

      // Assert: All groups available for pie chart
      assert.strictEqual(quotas.length, 3, 'Should have all 3 groups');
      assert.ok(quotas.every(q => q.hasData), 'All groups should have data');
      
      const gemini = quotas.find(q => q.id === 'gemini');
      const claude = quotas.find(q => q.id === 'claude');
      const gpt = quotas.find(q => q.id === 'gpt');
      
      assert.strictEqual(gemini?.remaining, 80, 'Gemini quota should match cache');
      assert.strictEqual(claude?.remaining, 60, 'Claude quota should match cache');
      assert.strictEqual(gpt?.remaining, 40, 'GPT quota should match cache');
    });

    test('should not render pie chart when cache is empty', () => {
      // Action: No cache setup, try to get quotas
      const restored = viewModel.restoreFromCache();
      const quotas = viewModel.getSidebarQuotas();

      // Assert: Should have groups but no data
      assert.strictEqual(restored, null, 'No cache should be restored');
      assert.ok(quotas.every(q => !q.hasData), 'No groups should have data');
    });
  });

  suite('Tree Cache-First Rendering', () => {
    test('should restore cached task list for tree immediately', async () => {
      // Setup: Pre-populate tree cache
      const cachedTreeState: CachedTreeState = {
        brainTasks: [
          { id: 'task-1', title: 'Implement feature X', size: '1.2 MB', lastModified: Date.now() - 3600000 },
          { id: 'task-2', title: 'Fix bug #123', size: '256 KB', lastModified: Date.now() - 7200000 },
          { id: 'task-3', title: 'Code review', size: '512 KB', lastModified: Date.now() - 1800000 }
        ],
        codeContexts: [
          { id: 'ctx-1', name: 'Main Project', size: '2.5 MB' }
        ],
        lastUpdated: Date.now()
      };
      await historyManager.setLastTreeState(cachedTreeState);

      // Action: Retrieve cached tree state
      const restored = historyManager.getLastTreeState();

      // Assert: Tree data available immediately
      assert.ok(restored, 'Tree cache should be restored');
      assert.strictEqual(restored.brainTasks.length, 3, 'Should have 3 cached tasks');
      assert.strictEqual(restored.codeContexts.length, 1, 'Should have 1 cached context');

      // Verify task details
      const task1 = restored.brainTasks.find(t => t.id === 'task-1');
      assert.strictEqual(task1?.title, 'Implement feature X');
      assert.strictEqual(task1?.size, '1.2 MB');
    });

    test('should return null when no tree cache exists', () => {
      // Action: Try to get tree state from empty cache
      const restored = historyManager.getLastTreeState();

      // Assert: No cache
      assert.strictEqual(restored, null, 'Should return null when no tree cache');
    });
  });

  suite('Cache Degradation', () => {
    test('should handle corrupted cache gracefully', async () => {
      // Setup: Simulate corrupted cache (missing required fields)
      memento.set('gagp.lastViewState', { invalid: 'data' });

      // Action: Try to restore
      const restored = viewModel.restoreFromCache();

      // Assert: Should not crash, return null
      assert.strictEqual(restored, null, 'Should return null for corrupted cache');
    });

    test('should handle partial cache (some groups missing data)', async () => {
      // Setup: Cache with partial data
      const cachedState: QuotaViewState = {
        groups: [
          { id: 'gemini', label: 'Gemini', remaining: 80, resetTime: '2h', themeColor: '#4285F4', hasData: true },
          { id: 'claude', label: 'Claude', remaining: 0, resetTime: 'N/A', themeColor: '#D97706', hasData: false },
          { id: 'gpt', label: 'GPT', remaining: 0, resetTime: 'N/A', themeColor: '#10A37F', hasData: false }
        ],
        activeGroupId: 'gemini',
        chart: { buckets: [], maxUsage: 1, displayMinutes: 60, interval: 120 },
        lastUpdated: Date.now()
      };
      await historyManager.setLastViewState(cachedState);

      // Action: Restore and check
      const restored = viewModel.restoreFromCache();
      const quotas = viewModel.getSidebarQuotas();

      // Assert: Should restore with partial data
      assert.ok(restored, 'Should restore partial cache');
      assert.ok(quotas.some(q => q.hasData), 'At least one group should have data');
      assert.ok(quotas.some(q => !q.hasData), 'Some groups should be missing data');
    });
  });

  suite('Active Group Detection Cache', () => {
    test('should preserve active group from cache on startup', async () => {
      // Setup: Cache with Claude as active
      const cachedState: QuotaViewState = {
        groups: [
          { id: 'gemini', label: 'Gemini', remaining: 100, resetTime: '2h', themeColor: '#4285F4', hasData: true },
          { id: 'claude', label: 'Claude', remaining: 37, resetTime: '3h', themeColor: '#D97706', hasData: true },
          { id: 'gpt', label: 'GPT', remaining: 100, resetTime: '1h', themeColor: '#10A37F', hasData: true }
        ],
        activeGroupId: 'claude',  // Claude was active before
        chart: { buckets: [], maxUsage: 1, displayMinutes: 60, interval: 120 },
        lastUpdated: Date.now()
      };
      await historyManager.setLastViewState(cachedState);

      // Action: Restore from cache
      viewModel.restoreFromCache();

      // Assert: Active group preserved
      assert.strictEqual(viewModel.getActiveGroupId(), 'claude', 'Active group should be Claude from cache');

      const statusData = viewModel.getStatusBarData();
      assert.strictEqual(statusData.label, 'Claude', 'StatusBar should show Claude');
      assert.strictEqual(statusData.percentage, 37, 'StatusBar should show Claude quota');
    });
  });
});

