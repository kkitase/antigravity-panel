/**
 * Server Integration Tests - 服务器集成测试
 *
 * ⚠️ 重要：这些测试需要运行中的 Antigravity Language Server！
 *
 * 前置条件：
 * 1. 启动 Antigravity/Gemini CLI 或 VS Code 扩展
 * 2. 确保 Language Server 进程正在运行
 *
 * 运行方式：
 *   npm run test:server
 *
 * 跳过这些测试（CI 环境）：
 *   SKIP_SERVER_TESTS=true npm test
 *
 * 测试内容：
 * - 服务器进程检测
 * - 配额数据获取
 * - 模型数据解析
 * - 数据轮询机制
 * - QuotaViewModel 数据聚合
 */

import * as assert from 'assert';
import { ProcessFinder } from '../../../core/process_finder';
import { QuotaManager, QuotaSnapshot } from '../../../core/quota_manager';
import { QuotaStrategyManager } from '../../../core/quota_strategy_manager';
import { DEFAULT_QUOTA_API_PATH, DEFAULT_SERVER_HOST } from '../../../core/config_manager';
import { LanguageServerInfo } from '../../../utils/types';

// 如果设置了环境变量，跳过服务器测试
const SKIP_SERVER_TESTS = process.env.SKIP_SERVER_TESTS === 'true';

suite('Server Integration Tests (需要运行中的服务器)', function() {
  this.timeout(30000);

  let serverInfo: LanguageServerInfo | null = null;
  let quotaManager: QuotaManager | null = null;
  let strategyManager: QuotaStrategyManager;

  suiteSetup(async function() {
    if (SKIP_SERVER_TESTS) {
      console.log('\n⏭️  跳过服务器测试 (SKIP_SERVER_TESTS=true)');
      this.skip();
      return;
    }

    strategyManager = new QuotaStrategyManager();

    // 检测运行中的服务器
    const finder = new ProcessFinder();
    serverInfo = await finder.detect({ attempts: 3, baseDelay: 1000 });

    if (!serverInfo) {
      console.log('\n⚠️  未检测到 Antigravity Language Server');
      console.log('   请先启动 Antigravity/Gemini CLI\n');
      this.skip();
      return;
    }

    console.log(`\n✅ 服务器已检测到，端口: ${serverInfo.port}`);
    quotaManager = QuotaManager.create(serverInfo, DEFAULT_QUOTA_API_PATH, DEFAULT_SERVER_HOST);
  });

  // ==================== 服务器检测测试 ====================
  suite('ProcessFinder - 进程检测', function() {
    test('应能检测到运行中的服务器', async function() {
      if (!serverInfo) { this.skip(); return; }

      assert.ok(serverInfo.port > 0, '端口号应为正数');
      assert.ok(serverInfo.csrfToken, 'CSRF Token 应存在');
      assert.ok(serverInfo.csrfToken.length > 10, 'CSRF Token 长度应合理');
    });

    test('多次检测应返回一致的结果', async function() {
      if (!serverInfo) { this.skip(); return; }

      const finder = new ProcessFinder();
      const secondDetect = await finder.detect({ attempts: 1 });

      assert.ok(secondDetect, '二次检测应成功');
      assert.strictEqual(secondDetect!.port, serverInfo.port, '端口应一致');
      assert.strictEqual(secondDetect!.csrfToken, serverInfo.csrfToken, 'CSRF Token 应一致');
    });
  });

  // ==================== 配额获取测试 ====================
  suite('QuotaManager - 配额获取', function() {
    test('应能成功获取配额数据', async function() {
      if (!quotaManager) { this.skip(); return; }

      const snapshot = await quotaManager.fetchQuota();

      assert.ok(snapshot, '应返回快照数据');
      assert.ok(snapshot!.timestamp instanceof Date, '应有时间戳');
      assert.ok(Array.isArray(snapshot!.models), '应有模型数组');
    });

    test('配额数据应包含有效的模型信息', async function() {
      if (!quotaManager) { this.skip(); return; }

      const snapshot = await quotaManager.fetchQuota();
      assert.ok(snapshot && snapshot.models.length > 0, '应有模型数据');

      const model = snapshot!.models[0];

      // 验证模型数据结构
      assert.ok(model.modelId, '模型应有 ID');
      assert.ok(model.label, '模型应有标签');
      assert.ok(typeof model.remainingPercentage === 'number', '应有剩余百分比');
      assert.ok(model.remainingPercentage >= 0 && model.remainingPercentage <= 100,
        '剩余百分比应在 0-100 之间');
      assert.ok(typeof model.isExhausted === 'boolean', '应有耗尽标志');
      assert.ok(model.resetTime instanceof Date, '应有重置时间');
      assert.ok(model.timeUntilReset, '应有重置倒计时文本');
    });

    test('onUpdate 回调应被触发', async function() {
      if (!serverInfo) { this.skip(); return; }

      const manager = QuotaManager.create(serverInfo, DEFAULT_QUOTA_API_PATH, DEFAULT_SERVER_HOST);
      let receivedSnapshot: QuotaSnapshot | null = null;

      manager.onUpdate((snapshot) => {
        receivedSnapshot = snapshot;
      });

      await manager.fetchQuota();

      assert.ok(receivedSnapshot, '回调应被调用');
      assert.ok((receivedSnapshot as QuotaSnapshot).models, '回调应收到模型数据');
    });
  });

  // ==================== 模型数据解析测试 ====================
  suite('Model Data Parsing - 模型数据解析', function() {
    test('应能解析所有返回的模型', async function() {
      if (!quotaManager) { this.skip(); return; }

      const snapshot = await quotaManager.fetchQuota();
      assert.ok(snapshot, '快照应存在');

      console.log(`\n📊 解析到 ${snapshot!.models.length} 个模型:`);
      snapshot!.models.forEach(m => {
        console.log(`   - [${m.modelId}] ${m.label}: ${m.remainingPercentage.toFixed(1)}%`);
      });

      assert.ok(snapshot!.models.length >= 1, '应至少有一个模型');
    });

    test('模型应能正确映射到分组', async function() {
      if (!quotaManager) { this.skip(); return; }

      const snapshot = await quotaManager.fetchQuota();
      assert.ok(snapshot, '快照应存在');

      const groupCounts: Record<string, number> = {};

      snapshot!.models.forEach(model => {
        const group = strategyManager.getGroupForModel(model.modelId, model.label);
        groupCounts[group.id] = (groupCounts[group.id] || 0) + 1;
      });

      console.log('\n📦 模型分组统计:');
      Object.entries(groupCounts).forEach(([groupId, count]) => {
        const group = strategyManager.getGroups().find(g => g.id === groupId);
        console.log(`   - ${group?.label || groupId}: ${count} 个模型`);
      });

      assert.ok(Object.keys(groupCounts).length >= 1, '应至少有一个分组');
    });

    test('resetTime 应为未来时间', async function() {
      if (!quotaManager) { this.skip(); return; }

      const snapshot = await quotaManager.fetchQuota();
      assert.ok(snapshot, '快照应存在');

      const now = new Date();
      snapshot!.models.forEach(model => {
        // 重置时间应该是未来（或者如果配额已耗尽可能是过去）
        if (!model.isExhausted) {
          assert.ok(model.resetTime >= now,
            `模型 ${model.label} 的重置时间应在未来: ${model.resetTime}`);
        }
      });
    });

    test('timeUntilReset 格式应正确', async function() {
      if (!quotaManager) { this.skip(); return; }

      const snapshot = await quotaManager.fetchQuota();
      assert.ok(snapshot, '快照应存在');

      snapshot!.models.forEach(model => {
        // 格式应该是 "Xh Xm" 或 "Xm" 或类似格式
        assert.ok(model.timeUntilReset.length > 0,
          `模型 ${model.label} 应有非空的倒计时文本`);
      });
    });
  });

  // ==================== 轮询机制测试 ====================
  suite('Polling Mechanism - 轮询机制', function() {
    test('连续多次获取应返回一致的数据结构', async function() {
      if (!quotaManager) { this.skip(); return; }

      const snapshot1 = await quotaManager.fetchQuota();
      const snapshot2 = await quotaManager.fetchQuota();

      assert.ok(snapshot1 && snapshot2, '两次获取都应成功');
      assert.strictEqual(snapshot1!.models.length, snapshot2!.models.length,
        '模型数量应一致');
    });

    test('模拟轮询间隔获取数据', async function() {
      if (!quotaManager) { this.skip(); return; }

      const results: QuotaSnapshot[] = [];

      // 模拟 3 次轮询，间隔 500ms
      for (let i = 0; i < 3; i++) {
        const snapshot = await quotaManager.fetchQuota();
        if (snapshot) {
          results.push(snapshot);
        }
        if (i < 2) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      assert.strictEqual(results.length, 3, '3 次轮询都应成功');

      // 时间戳应递增
      for (let i = 1; i < results.length; i++) {
        assert.ok(results[i].timestamp >= results[i-1].timestamp,
          '时间戳应递增');
      }
    });

    test('配额消耗应能被检测到', async function() {
      if (!quotaManager) { this.skip(); return; }

      const snapshot1 = await quotaManager.fetchQuota();

      // 等待一小段时间再获取
      await new Promise(resolve => setTimeout(resolve, 1000));

      const snapshot2 = await quotaManager.fetchQuota();

      assert.ok(snapshot1 && snapshot2, '两次获取都应成功');

      // 比较配额变化（可能相同，也可能减少）
      snapshot1!.models.forEach(model1 => {
        const model2 = snapshot2!.models.find(m => m.modelId === model1.modelId);
        if (model2) {
          // 配额只能保持或减少（除非重置）
          const diff = model1.remainingPercentage - model2.remainingPercentage;
          console.log(`   ${model1.label}: ${model1.remainingPercentage.toFixed(2)}% -> ${model2.remainingPercentage.toFixed(2)}% (${diff >= 0 ? '-' : '+'}${Math.abs(diff).toFixed(2)}%)`);
        }
      });
    });
  });

  // ==================== Prompt Credits 测试 ====================
  suite('Prompt Credits - 提示词额度', function() {
    test('应能获取 Prompt Credits 信息（如果有）', async function() {
      if (!quotaManager) { this.skip(); return; }

      const snapshot = await quotaManager.fetchQuota();
      assert.ok(snapshot, '快照应存在');

      if (snapshot!.promptCredits) {
        const credits = snapshot!.promptCredits;
        console.log('\n💳 Prompt Credits:');
        console.log(`   - 可用: ${credits.available}`);
        console.log(`   - 月度总量: ${credits.monthly}`);
        console.log(`   - 剩余百分比: ${credits.remainingPercentage.toFixed(1)}%`);

        assert.ok(typeof credits.available === 'number', '可用额度应为数字');
        assert.ok(typeof credits.monthly === 'number', '月度总量应为数字');
        assert.ok(credits.remainingPercentage >= 0 && credits.remainingPercentage <= 100,
          '剩余百分比应在 0-100 之间');
      } else {
        console.log('\n💳 Prompt Credits: 无数据（可能未订阅）');
      }
    });
  });
});

