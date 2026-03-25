/**
 * 测试数据清理工具
 * 用于在测试完成后清理 Redis 和数据库中的测试脏数据
 */

import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';

interface TestCleanupConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
    keyPrefix?: string;
  };
  database: {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
  };
}

/**
 * 加载测试配置
 */
function loadTestConfig(): TestCleanupConfig {
  const configPaths = [
    join(process.cwd(), 'configs', 'system.yaml'),
    join(process.cwd(), '..', '..', 'configs', 'system.yaml'),
  ];

  let config: any = {};

  for (const configPath of configPaths) {
    if (existsSync(configPath)) {
      const content = readFileSync(configPath, 'utf-8');
      config = parse(content);
      break;
    }
  }

  return {
    redis: {
      host: config.redis?.host || 'localhost',
      port: config.redis?.port || 6379,
      password: config.redis?.password,
      db: config.redis?.db || 0,
      keyPrefix: config.redis?.keyPrefix || 'monkagents:',
    },
    database: {
      host: config.database?.host || 'localhost',
      port: config.database?.port || 3306,
      username: config.database?.username || 'root',
      password: config.database?.password || 'root',
      database: config.database?.database || 'monkagents',
    },
  };
}

/**
 * 清理 Redis 测试数据
 */
async function cleanupRedis(config: TestCleanupConfig['redis']): Promise<void> {
  const logger = new Logger('TestCleanup:Redis');

  try {
    const client = new Redis({
      host: config.host,
      port: config.port,
      password: config.password,
      db: config.db,
    });

    // 等待连接
    await new Promise<void>((resolve, reject) => {
      client.once('ready', () => resolve());
      client.once('error', (err) => reject(err));
      setTimeout(() => resolve(), 1000); // 超时也继续
    });

    // 获取所有匹配前缀的 key
    const pattern = `${config.keyPrefix}*`;
    const keys = await client.keys(pattern);

    if (keys.length > 0) {
      // 删除所有匹配的 key
      await client.del(...keys);
      logger.log(`已清理 ${keys.length} 个 Redis key (pattern: ${pattern})`);
    } else {
      logger.log('没有需要清理的 Redis 数据');
    }

    await client.quit();
  } catch (error) {
    logger.warn(`Redis 清理失败: ${error}`);
  }
}

/**
 * 清理数据库测试数据
 */
async function cleanupDatabase(config: TestCleanupConfig['database']): Promise<void> {
  const logger = new Logger('TestCleanup:Database');

  const dataSource = new DataSource({
    type: 'mysql',
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password,
    database: config.database,
  });

  try {
    await dataSource.initialize();

    // 清理各个表的数据（保留表结构）
    const tables = [
      'execution_logs',
      'checkpoints',
      'scheduled_tasks',
      'conversations',
      'subtasks',
      'tasks',
      'agents',
      'sessions',
    ];

    for (const table of tables) {
      try {
        await dataSource.query(`TRUNCATE TABLE ${table}`);
        logger.log(`已清理表: ${table}`);
      } catch (error) {
        // 表可能不存在，忽略错误
        logger.debug(`跳过表 ${table}: ${error}`);
      }
    }

    await dataSource.destroy();
    logger.log('数据库清理完成');
  } catch (error) {
    logger.warn(`数据库清理失败: ${error}`);
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

/**
 * 执行完整的测试数据清理
 */
export async function cleanupTestData(): Promise<void> {
  const logger = new Logger('TestCleanup');
  logger.log('开始清理测试数据...');

  const config = loadTestConfig();

  // 并行清理 Redis 和数据库
  await Promise.all([
    cleanupRedis(config.redis),
    cleanupDatabase(config.database),
  ]);

  logger.log('测试数据清理完成');
}

/**
 * 仅清理 Redis 测试数据（用于单元测试）
 */
export async function cleanupRedisOnly(): Promise<void> {
  const config = loadTestConfig();
  await cleanupRedis(config.redis);
}

/**
 * 仅清理数据库测试数据（用于单元测试）
 */
export async function cleanupDatabaseOnly(): Promise<void> {
  const config = loadTestConfig();
  await cleanupDatabase(config.database);
}