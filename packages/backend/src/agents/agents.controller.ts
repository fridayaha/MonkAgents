import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { AgentsService } from './agents.service';

@Controller('agents')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Get()
  async findAll() {
    return this.agentsService.getAllAgents();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const agent = await this.agentsService.getAgent(id);
    if (!agent) {
      throw new NotFoundException(`Agent not found: ${id}`);
    }
    return agent;
  }

  @Get('role/:role')
  async findByRole(@Param('role') role: string) {
    return this.agentsService.getAgentsByRole(role);
  }
}