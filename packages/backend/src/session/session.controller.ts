import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SessionService } from './session.service';
import { CreateSessionDto } from './dto/create-session.dto';

@Controller('sessions')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Post()
  async create(@Body() dto: CreateSessionDto) {
    return this.sessionService.create({
      title: dto.title,
      workingDirectory: dto.workingDirectory,
      primaryAgent: dto.primaryAgent,
    });
  }

  @Get()
  async findAll() {
    return this.sessionService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.sessionService.findOne(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.sessionService.remove(id);
  }
}