import { Module, Global } from '@nestjs/common';
import { CliService } from './cli.service';
import { ConfigModule } from '../config/config.module';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [CliService],
  exports: [CliService],
})
export class CliModule {}