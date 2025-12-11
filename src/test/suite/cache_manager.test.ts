import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CacheManager } from '../../core/cache_manager';

suite('CacheManager Test Suite', () => {
    let tempDir: string;
    let brainDir: string;
    let conversationsDir: string;
    let cacheManager: CacheManager;

    setup(async () => {
        // Create a temporary directory structure
        tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'antigravity-test-'));
        brainDir = path.join(tempDir, 'brain');
        conversationsDir = path.join(tempDir, 'conversations');

        await fs.promises.mkdir(brainDir);
        await fs.promises.mkdir(conversationsDir);

        cacheManager = new CacheManager(brainDir, conversationsDir);
    });

    teardown(async () => {
        // Cleanup
        try {
            await fs.promises.rm(tempDir, { recursive: true, force: true });
        } catch (e) {
            console.error('Failed to cleanup temp dir', e);
        }
    });

    test('should report empty cache initially', async () => {
        const info = await cacheManager.getCacheInfo();
        assert.strictEqual(info.totalSize, 0);
        assert.strictEqual(info.brainCount, 0);
        assert.strictEqual(info.conversationsCount, 0);
    });

    test('should calculate cache size correctly', async () => {
        // Create dummy files
        await fs.promises.writeFile(path.join(conversationsDir, '1.json'), 'hello'); // 5 bytes
        await fs.promises.writeFile(path.join(conversationsDir, '2.json'), 'world'); // 5 bytes
        
        // Brain task structure: brain/task-id/files...
        const taskDir = path.join(brainDir, 'task-1');
        await fs.promises.mkdir(taskDir);
        await fs.promises.writeFile(path.join(taskDir, 'task.md'), '# Test Task'); // 11 bytes
        
        const info = await cacheManager.getCacheInfo();
        
        assert.strictEqual(info.conversationsCount, 2);
        assert.strictEqual(info.brainCount, 1);
        assert.strictEqual(info.conversationsSize, 10);
        assert.strictEqual(info.brainSize, 11);
        assert.strictEqual(info.totalSize, 21);
    });

    test('should extract simplified task label from task.md', async () => {
        const taskDir = path.join(brainDir, 'task-label');
        await fs.promises.mkdir(taskDir);
        await fs.promises.writeFile(path.join(taskDir, 'task.md'), '# My Feature\nDescription here');

        const info = await cacheManager.getCacheInfo();
        assert.strictEqual(info.brainTasks.length, 1);
        assert.strictEqual(info.brainTasks[0].label, 'My Feature');
    });

    test('should clean cache keeping newest 5 brain tasks and their conversations', async () => {
        // Create 7 brain task directories with corresponding conversation files
        for (let i = 1; i <= 7; i++) {
            const taskDir = path.join(brainDir, `task-${i}`);
            await fs.promises.mkdir(taskDir);
            await fs.promises.writeFile(path.join(taskDir, 'file'), `data-${i}`);
            // Create corresponding conversation file
            await fs.promises.writeFile(path.join(conversationsDir, `task-${i}.pb`), `conv-${i}`);
            // Small delay to ensure different creation times
            await new Promise(resolve => setTimeout(resolve, 10));
        }

        // Verify data exists
        let info = await cacheManager.getCacheInfo();
        assert.strictEqual(info.brainCount, 7);
        assert.strictEqual(info.conversationsCount, 7);

        // Clean - should keep newest 5 brain tasks and their conversations
        const deletedCount = await cacheManager.clean();

        // Verify results
        info = await cacheManager.getCacheInfo();
        assert.strictEqual(deletedCount, 2); // 7 - 5 = 2 deleted
        assert.strictEqual(info.brainCount, 5); // Newest 5 kept
        assert.strictEqual(info.conversationsCount, 5); // Corresponding 5 conversations kept

        // Verify directories still exist
        assert.strictEqual(fs.existsSync(brainDir), true);
        assert.strictEqual(fs.existsSync(conversationsDir), true);
    });

    test('should keep all brain tasks when less than 5', async () => {
        // Create 3 brain task directories
        for (let i = 1; i <= 3; i++) {
            const taskDir = path.join(brainDir, `task-${i}`);
            await fs.promises.mkdir(taskDir);
            await fs.promises.writeFile(path.join(taskDir, 'file'), `data-${i}`);
        }

        // Verify data exists
        let info = await cacheManager.getCacheInfo();
        assert.strictEqual(info.brainCount, 3);

        // Clean - should keep all 3 since < 5
        const deletedCount = await cacheManager.clean();

        // Verify results
        info = await cacheManager.getCacheInfo();
        assert.strictEqual(deletedCount, 0); // Nothing deleted
        assert.strictEqual(info.brainCount, 3); // All kept
    });
});
