# QuotaViewModel 重构方案

## 问题概述

### 当前症状
- 状态栏显示 `Active: Gemini, Quota: 100%`，而实际使用的是 Claude (37%)
- 饼图和柱状图正确显示所有模型的配额
- 启动时状态栏显示 "Loading..."，没有使用缓存数据
- 启动时饼图无数据（quota=null）
- 启动时目录树显示 "Loading..." 直到文件扫描完成

### 启动体验目标

**所有 UI 组件启动时必须先从缓存渲染，然后异步刷新！**

| 组件 | 当前启动行为 | 目标启动行为 |
|------|-------------|-------------|
| StatusBar | 显示 "Loading..." | 立即显示缓存的配额和活跃分组 |
| 饼图 | 无数据（quota=null） | 立即显示缓存的各分组配额 |
| 柱状图 | ✅ 从缓存渲染 | 保持现有行为 |
| 目录树 (Brain) | 显示 "Loading..." | 立即显示缓存的任务列表和大小 |
| 目录树 (Code Tracker) | 显示 "Loading..." | 立即显示缓存的上下文列表 |

### 根本原因

1. **数据源不统一**
   - 状态栏使用 `label.includes("gemini")` 字符串匹配
   - 饼图使用 `strategyManager.getGroupForModel()` 分组
   - 两种方式可能产生不同结果

2. **activeCategory 从未更新**
   - `setActiveCategory()` 只在测试代码中调用
   - 业务逻辑中从未调用，永远返回默认值 `'gemini'`

3. **缓存未充分利用**
   - 缓存了 `lastDisplayPercentage`、`lastActiveCategory` 但启动时未使用
   - 没有缓存所有分组的独立配额数据
   - 饼图启动时无法从缓存渲染
   - 目录树没有缓存任务列表和大小信息

4. **缺少统一的 ViewModel**
   - StatusBarManager 是纯 View，没有数据聚合层
   - 数据处理逻辑散落在 extension.ts

5. **启动时缓存使用不完整**
   - StatusBar: 只调用 `showLoading()`，未使用 `lastDisplayPercentage`
   - 饼图: `sidebarProvider.update(null, cache, ...)` 传入 quota=null
   - 柱状图: ✅ 正确使用 `calculateUsageBuckets()` 缓存
   - 目录树: 等待 `cacheManager.getCacheInfo()` 异步完成才渲染

## 架构设计

### 目标架构

```
┌─────────────────────────────────────────────────────────────┐
│                    QuotaSnapshot (服务器数据)                 │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    QuotaViewModel (单一数据聚合层)            │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ State:                                               │    │
│  │   - groups: QuotaGroupState[]  // 所有分组配额       │    │
│  │   - activeGroupId: string      // 活跃分组（自动检测）│    │
│  │   - chart: UsageChartData      // 图表数据           │    │
│  │   - isLoading: boolean                               │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Methods:                                             │    │
│  │   - updateFromSnapshot(snapshot)  // 更新数据        │    │
│  │   - restoreFromCache()            // 从缓存恢复      │    │
│  │   - persistToCache()              // 持久化到缓存    │    │
│  │   - getStatusBarData()            // 状态栏数据      │    │
│  │   - getSidebarData()              // 侧边栏数据      │    │
│  └─────────────────────────────────────────────────────┘    │
└──────────────────────────┬──────────────────────────────────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
    ┌────────────┐  ┌────────────┐  ┌────────────┐
    │ StatusBar  │  │  Sidebar   │  │  Webview   │
    │ (活跃分组)  │  │ (所有分组)  │  │ (饼图柱状图)│
    └────────────┘  └────────────┘  └────────────┘
```

### 核心数据结构

```typescript
// 分组配额状态
interface QuotaGroupState {
  id: string;           // 分组ID: 'gemini' | 'claude' | 'gpt'
  label: string;        // 显示名称
  remaining: number;    // 剩余百分比 0-100
  resetTime: string;    // 重置时间描述
  themeColor: string;   // 主题色
  hasData: boolean;     // 是否有数据
}

// ViewModel 完整状态（可缓存）
interface QuotaViewState {
  groups: QuotaGroupState[];
  activeGroupId: string;
  chart: UsageChartData;
  lastUpdated: number;  // 时间戳
}
```

### 活跃分组检测逻辑

基于配额消耗变化自动检测当前活跃的模型分组：

```typescript
detectActiveGroup(prevState: QuotaViewState, newGroups: QuotaGroupState[]): string {
  // 找出配额下降最多的分组
  let maxDrop = 0;
  let activeId = prevState.activeGroupId;
  
  for (const group of newGroups) {
    const prev = prevState.groups.find(g => g.id === group.id);
    if (prev) {
      const drop = prev.remaining - group.remaining;
      if (drop > maxDrop && drop > 0.1) {  // 阈值 0.1% 避免噪声
        maxDrop = drop;
        activeId = group.id;
      }
    }
  }
  
  return activeId;
}
```

## 缓存结构设计

### 需要缓存的完整状态

为实现"启动时先渲染缓存"的目标，需要缓存以下完整状态：

```typescript
interface CachedAppState {
  // 配额相关
  quotaGroups: QuotaGroupState[];       // 所有分组的配额数据
  activeGroupId: string;                 // 活跃分组 ID

  // 图表相关（已有）
  quotaHistory: QuotaHistoryPoint[];     // 历史记录

  // 目录树相关（新增）
  brainTasks: CachedTaskInfo[];          // 任务列表和大小
  codeContexts: CachedContextInfo[];     // 代码上下文列表

  // 时间戳
  lastUpdated: number;
}

interface CachedTaskInfo {
  id: string;
  title: string;
  size: string;          // 格式化后的大小
  lastModified: number;
}

interface CachedContextInfo {
  id: string;
  name: string;
  size: string;          // 格式化后的大小
}
```

### 缓存键清单

| 缓存键 | 内容 | 用途 |
|--------|------|------|
| `gagp.lastViewState` | QuotaViewState | 饼图、状态栏 |
| `gagp.quotaHistory` | QuotaHistoryPoint[] | 柱状图（已有） |
| `gagp.lastBrainTasks` | CachedTaskInfo[] | Brain 目录树（新增） |
| `gagp.lastCodeContexts` | CachedContextInfo[] | Code Tracker 目录树（新增） |

### 启动时数据流

```
┌─────────────────────────────────────────────────────────────────┐
│                         启动流程                                 │
├─────────────────────────────────────────────────────────────────┤
│  1. Extension activate()                                        │
│     ├─ quotaViewModel.restoreFromCache()  → 获取缓存的配额状态   │
│     ├─ cacheViewModel.restoreFromCache()  → 获取缓存的目录树状态 │
│     │                                                           │
│  2. 立即渲染缓存数据（同步）                                      │
│     ├─ statusBar.updateFromCache(quotaState)                    │
│     ├─ sidebarProvider.updateFromCache(quotaState, treeState)   │
│     │                                                           │
│  3. 异步刷新真实数据                                             │
│     ├─ quotaManager.fetch()           → 更新配额                 │
│     ├─ cacheManager.getCacheInfo()    → 更新目录树               │
│     │                                                           │
│  4. 增量更新 UI                                                  │
│     ├─ statusBar.update(newData)                                │
│     └─ sidebarProvider.update(newData)                          │
└─────────────────────────────────────────────────────────────────┘
```

## 设计细节

### 职责边界

| 组件 | 职责 | 不负责 |
|------|------|--------|
| QuotaViewModel | 配额数据聚合、活跃分组检测、缓存管理 | 文件缓存(CacheInfo)、UI 渲染 |
| QuotaHistoryManager | 历史记录、柱状图数据计算、持久化存储 | 数据聚合逻辑 |
| StatusBarManager | 状态栏 UI 渲染 | 数据处理 |
| SidebarProvider | Webview 通信、CacheInfo 处理 | 配额聚合（委托给 ViewModel） |

### CacheInfo 处理策略

CacheInfo（Brain/Workspace 大小）**保持独立**，不纳入 QuotaViewModel：
- CacheInfo 由 CacheManager 管理
- SidebarProvider 继续直接接收 CacheInfo
- 两者在 extension.ts 中组合

```typescript
// extension.ts 中的数据流
const quotaState = quotaViewModel.updateFromSnapshot(snapshot);
const cacheInfo = await cacheManager.getCacheInfo();

statusBar.updateFromViewModel(quotaViewModel.getStatusBarData(), cacheInfo);
sidebarProvider.update(quotaState, cacheInfo);
```

### 柱状图数据来源

柱状图数据继续由 `QuotaHistoryManager.calculateUsageBuckets()` 计算：

```typescript
// QuotaViewModel 中
buildChartData(): UsageChartData {
  const config = this.configManager.getConfig();
  const buckets = this.historyManager.calculateUsageBuckets(
    config.historyDisplayMinutes,
    config.pollingInterval / 60
  );

  // 注入颜色
  const coloredBuckets = buckets.map(b => ({
    ...b,
    items: b.items.map(item => ({
      ...item,
      color: this.strategyManager.getGroups()
        .find(g => g.id === item.groupId)?.themeColor || '#888'
    }))
  }));

  return {
    buckets: coloredBuckets,
    maxUsage: this.historyManager.getMaxUsage(buckets),
    displayMinutes: config.historyDisplayMinutes,
    interval: config.pollingInterval,
    prediction: this.buildPrediction()
  };
}
```

## 实现计划

### Phase 1: 创建 QuotaViewModel

**文件**: `src/core/quota_view_model.ts`

```typescript
import { QuotaSnapshot } from './quota_manager';
import { QuotaStrategyManager } from './quota_strategy_manager';
import { QuotaHistoryManager } from './quota_history';
import { ConfigManager } from './config_manager';

export class QuotaViewModel {
  private state: QuotaViewState;
  private strategyManager: QuotaStrategyManager;
  private historyManager: QuotaHistoryManager;
  private configManager: ConfigManager;

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

  // 聚合服务器数据到分组 (复用 SidebarProvider._aggregateQuotas 逻辑)
  private aggregateGroups(snapshot: QuotaSnapshot): QuotaGroupState[] {
    const models = snapshot.models || [];
    const groups = this.strategyManager.getGroups();

    return groups.map(group => {
      const groupModels = models.filter(m =>
        this.strategyManager.getGroupForModel(m.modelId, m.label).id === group.id
      );

      if (groupModels.length === 0) {
        return { id: group.id, label: group.label, remaining: 0,
                 resetTime: 'N/A', themeColor: group.themeColor, hasData: false };
      }

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

  // 从缓存恢复状态
  restoreFromCache(): QuotaViewState {
    const cached = this.historyManager.getLastViewState();
    if (cached && cached.groups.length > 0) {
      this.state = cached;
    }
    return this.state;
  }

  // 从服务器数据更新
  updateFromSnapshot(snapshot: QuotaSnapshot): QuotaViewState {
    const prevState = this.state;
    const groups = this.aggregateGroups(snapshot);
    const activeGroupId = this.detectActiveGroup(prevState, groups);

    // 记录历史（用于柱状图）
    const usageRecord: Record<string, number> = {};
    groups.forEach(g => usageRecord[g.id] = g.remaining);
    this.historyManager.record(usageRecord);

    this.state = {
      groups,
      activeGroupId,
      chart: this.buildChartData(),
      lastUpdated: Date.now()
    };

    this.historyManager.setLastViewState(this.state);
    return this.state;
  }

  // 获取状态栏数据
  getStatusBarData(): { label: string; percentage: number; color: string } {
    const active = this.state.groups.find(g => g.id === this.state.activeGroupId);
    return {
      label: active?.label || 'Unknown',
      percentage: active?.remaining || 0,
      color: active?.themeColor || '#888'
    };
  }

  // 获取侧边栏数据
  getSidebarData(): QuotaDisplayItem[] {
    return this.state.groups.map(g => ({
      id: g.id,
      label: g.label,
      type: 'group',
      remaining: g.remaining,
      resetTime: g.resetTime,
      hasData: g.hasData,
      themeColor: g.themeColor
    }));
  }
}
```

### Phase 2: 扩展缓存结构

**修改**: `src/core/quota_history.ts`

```typescript
// 新增缓存方法
getLastViewState(): QuotaViewState | null {
  return this.globalState.get<QuotaViewState>('gagp.lastViewState') || null;
}

async setLastViewState(state: QuotaViewState): Promise<void> {
  await this.globalState.update('gagp.lastViewState', state);
}
```

### Phase 3: 重构数据流

**修改**: `src/extension.ts`

```typescript
// ========== 启动时：立即从缓存渲染 ==========

const quotaViewModel = new QuotaViewModel(quotaHistoryManager, configManager);

// 1. 恢复配额缓存
const cachedQuotaState = quotaViewModel.restoreFromCache();

// 2. 恢复目录树缓存
const cachedTreeState = quotaHistoryManager.getLastTreeState();

// 3. 立即渲染缓存数据（同步，秒开）
if (cachedQuotaState.groups.some(g => g.hasData)) {
  statusBar.updateFromCache(quotaViewModel.getStatusBarData());
}

sidebarProvider.updateFromCache({
  quotas: quotaViewModel.getSidebarData(),
  chart: cachedQuotaState.chart,
  tasks: cachedTreeState?.brainTasks || [],
  contexts: cachedTreeState?.codeContexts || []
});

// ========== 异步刷新真实数据 ==========

// 4. 异步获取最新目录树数据
cacheManager.getCacheInfo().then(async (cacheInfo) => {
  // 缓存目录树数据供下次启动使用
  await quotaHistoryManager.setLastTreeState({
    brainTasks: cacheInfo.brainTasks.map(t => ({
      id: t.id,
      title: t.title,
      size: formatBytes(t.size || 0),
      lastModified: t.lastModified
    })),
    codeContexts: []  // 由 sidebarProvider 异步加载
  });

  // 更新 UI
  sidebarProvider.updateTreeData(cacheInfo);
});

// 5. 配额轮询
quotaManager.onUpdate((snapshot) => {
  const newState = quotaViewModel.updateFromSnapshot(snapshot);

  // 更新状态栏
  statusBar.updateFromViewModel(quotaViewModel.getStatusBarData());

  // 更新侧边栏（只更新配额部分，目录树由 cacheManager 更新）
  sidebarProvider.updateQuotaData({
    quotas: quotaViewModel.getSidebarData(),
    chart: newState.chart
  });
});
```

### Phase 4: 简化 StatusBarManager

**修改**: `src/ui/status_bar.ts`

```typescript
// 移除 getCategoryStats() 方法
// 新增简化的更新方法
updateFromViewModel(data: { label: string; percentage: number; color: string }): void {
  this.item.text = `$(dashboard) ${Math.round(data.percentage)}%`;
  this.item.tooltip = `Active: ${data.label}\nQuota: ${Math.round(data.percentage)}%`;
  // 设置背景色警告...
}
```

## 迁移策略

### 向后兼容

1. 保留旧的缓存键一段时间，自动迁移到新结构
2. 保留 `getLastActiveCategory()` 等方法但标记为 deprecated
3. 新旧代码可以并存，逐步切换

### 测试要点

**启动缓存渲染测试**：
1. 有缓存时：StatusBar 立即显示缓存的配额（不显示 Loading）
2. 有缓存时：饼图立即显示缓存的分组配额（不显示空状态）
3. 有缓存时：目录树立即显示缓存的任务列表（不显示 Loading）
4. 无缓存时：正常降级到 Loading 状态

**活跃分组检测测试**：
5. 使用 Claude 时状态栏自动切换显示 Claude 的配额
6. 配额消耗小于阈值时保持上次的活跃分组
7. 多个分组同时消耗时选择消耗最大的

**数据一致性测试**：
8. 状态栏和饼图显示相同的活跃分组配额
9. 缓存数据与 UI 显示一致

**边界情况测试**：
10. 缓存为空时正常启动
11. 缓存格式损坏时正常降级
12. 服务器无响应时保持缓存数据

## 预期效果

| 场景 | 修复前 | 修复后 |
|------|--------|--------|
| 启动时状态栏 | 显示 "Loading..." | 立即显示缓存的配额 |
| 启动时饼图 | 无数据 | 立即显示缓存的分组配额 |
| 启动时目录树 | 显示 "Loading..." | 立即显示缓存的任务列表 |
| 使用 Claude 时 | 状态栏显示 Gemini 100% | 状态栏显示 Claude 37% |
| 切换模型 | 无变化 | 自动检测并切换显示 |

## 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `src/core/quota_view_model.ts` | 新增 | 统一的配额 ViewModel |
| `src/core/quota_history.ts` | 修改 | 扩展缓存结构（配额状态+目录树状态） |
| `src/extension.ts` | 修改 | 使用 ViewModel 驱动数据流，缓存优先启动 |
| `src/ui/status_bar.ts` | 修改 | 新增 `updateFromCache()` 方法 |
| `src/ui/sidebar_provider.ts` | 修改 | 新增 `updateFromCache()`、`updateQuotaData()`、`updateTreeData()` 方法 |
| `src/test/suite/quota_view_model.test.ts` | 新增 | ViewModel 单元测试 |
| `src/test/suite/startup_cache.test.ts` | 新增 | 启动缓存渲染测试 |

## 代码清理清单

重构完成后需要删除/清理的代码：

| 位置 | 内容 | 原因 |
|------|------|------|
| `status_bar.ts` | `getCategoryStats()` 方法 | 逻辑迁移到 ViewModel |
| `sidebar_provider.ts` | `_aggregateQuotas()` 方法 | 逻辑迁移到 ViewModel |
| `extension.ts` | 直接处理 geminiAvg/otherAvg 的逻辑 | 由 ViewModel 处理 |
| `quota_history.ts` | `getLastActiveCategory()` | 由 ViewModel 的 activeGroupId 替代 |
| `quota_history.ts` | `setActiveCategory()` | 由 ViewModel 自动检测替代 |
| `quota_history.ts` | `getLastDisplayPercentage()` | 由 ViewState 替代 |
| `quota_history.ts` | `setLastDisplayPercentage()` | 由 ViewState 替代 |

## 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 缓存格式变更导致旧缓存失效 | 首次启动显示空数据 | 检测旧格式并自动迁移 |
| 活跃分组检测误判 | 显示错误的分组 | 设置合理阈值、保持上次状态 |
| ViewModel 初始化失败 | 扩展启动失败 | 添加错误处理、降级方案 |

## 附录：当前代码需要迁移的逻辑

### SidebarProvider._aggregateQuotas()

需要将此逻辑迁移到 QuotaViewModel.aggregateGroups()：

```typescript
// 当前位置: src/ui/sidebar_provider.ts
private _aggregateQuotas(): QuotaDisplayItem[] {
  if (!this._quota?.models) return [];
  const models = this._quota.models;
  const groups = strategyManager.getGroups();
  // ... 分组聚合逻辑
}
```

### extension.ts 中的配额记录逻辑

需要将此逻辑迁移到 QuotaViewModel.updateFromSnapshot()：

```typescript
// 当前位置: src/extension.ts L287-291
const quotaPoolRecord = { gemini: geminiAvg, other: otherAvg };
await quotaHistoryManager.record(quotaPoolRecord);
```

