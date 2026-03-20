import { Controller, Get } from '@nestjs/common';
import { ConfigService } from './config/config.service';

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
}