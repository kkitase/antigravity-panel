/**
 * Server Integration Test Runner - 服务器集成测试运行器
 * 
 * ⚠️ 这些测试需要运行中的 Antigravity Language Server！
 * 
 * 运行方式：
 *   npm run test:server
 * 
 * 跳过服务器测试：
 *   SKIP_SERVER_TESTS=true npm run test:server
 */
import Mocha from 'mocha';
import * as path from 'path';
import { glob } from 'glob';
import Module from 'module';

// Mock vscode module for tests
const vscodeModulePath = path.resolve(__dirname, 'mocks', 'vscode.js');
// @ts-ignore - Monkey patching Module.prototype.require
const originalRequire = Module.prototype.require;
// @ts-ignore
Module.prototype.require = function(id: string) {
    if (id === 'vscode') {
        // @ts-ignore
        return originalRequire.call(this, vscodeModulePath);
    }
    // @ts-ignore
    return originalRequire.apply(this, arguments);
};

async function run(): Promise<void> {
    console.log('\n' + '='.repeat(60));
    console.log('🖥️  Antigravity Language Server Integration Tests');
    console.log('='.repeat(60));
    console.log('\n⚠️  这些测试需要运行中的 Antigravity Language Server！');
    console.log('   如果服务器未运行，测试将被跳过。\n');

    const mocha = new Mocha({
        ui: 'tdd',
        color: true,
        timeout: 30000  // 30秒超时，网络请求需要更长时间
    });

    const testsRoot = __dirname;

    try {
        // 只运行 integration 目录下的测试
        const files = await glob('suite/integration/*.test.js', { cwd: testsRoot });

        if (files.length === 0) {
            console.log('❌ 未找到集成测试文件');
            return;
        }

        console.log(`📋 找到 ${files.length} 个集成测试文件:\n`);
        files.forEach(f => console.log(`   ✓ ${f}`));
        console.log('');

        files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

        return new Promise<void>((resolve, reject) => {
            mocha.run((failures: number) => {
                if (failures > 0) {
                    reject(new Error(`${failures} tests failed.`));
                } else {
                    resolve();
                }
            });
        });
    } catch (err) {
        console.error('Test runner error:', err);
        throw err;
    }
}

run()
    .then(() => {
        console.log('\n' + '='.repeat(60));
        console.log('✅ 所有服务器集成测试通过！');
        console.log('='.repeat(60) + '\n');
        process.exit(0);
    })
    .catch(err => {
        console.error('\n❌ 测试失败:', err.message);
        process.exit(1);
    });

