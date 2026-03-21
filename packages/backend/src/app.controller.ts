import { Controller, Get, Post } from '@nestjs/common';
import { ConfigService } from './config/config.service';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

@Controller()
export class AppController {
  constructor(private readonly configService: ConfigService) {}

  @Get('health')
  health() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '0.1.0',
    };
  }

  @Get('info')
  info() {
    return {
      name: 'MonkAgents',
      description: 'Multi-agent collaboration platform',
      agents: this.configService.getAgentIds(),
    };
  }

  /**
   * Generate a random session title based on 西游记九九八十一难
   */
  @Post('utils/random-title')
  async generateRandomTitle(): Promise<{ title: string }> {
    const prompt = `请从《西游记》唐僧师徒取经路上的九九八十一难中，随机选择一个著名的磨难或事件，用4-6个汉字概括作为标题。只输出标题，不要其他内容。例如：三打白骨精、大闹天宫、真假美猴王等。`;

    try {
      const { stdout } = await execAsync(
        `claude -p "${prompt.replace(/"/g, '\\"')}" --max-tokens 50`,
        {
          timeout: 30000,
          env: { ...process.env },
        }
      );

      // Clean up the output
      const title = stdout.trim()
        .replace(/["\n\r]/g, '')
        .substring(0, 20);

      return { title: title || '西游取经路' };
    } catch (error) {
      // Fallback to preset titles if CLI fails
      const fallbackTitles = [
        '三打白骨精',
        '大闹天宫',
        '真假美猴王',
        '三借芭蕉扇',
        '偷吃人参果',
        '智取红孩儿',
        '流沙河收沙僧',
        '高老庄收八戒',
        '女儿国奇遇',
        '火焰山受阻',
        '通天河遇鼋',
        '狮驼岭斗妖',
        '盘丝洞遇险',
        '无底洞降鼠',
        '比丘国救儿',
        '车迟国斗法',
        '大战流沙河',
        '收服白龙马',
        '误入小雷音',
        '勇闯黄风岭',
      ];

      const randomTitle = fallbackTitles[Math.floor(Math.random() * fallbackTitles.length)];
      return { title: randomTitle };
    }
  }
}