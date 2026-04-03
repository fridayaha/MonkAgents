import { Global, Module } from '@nestjs/common';
import { SkillsDirectoryService } from './skills-directory.service';

@Global()
@Module({
  providers: [SkillsDirectoryService],
  exports: [SkillsDirectoryService],
})
export class SkillsModule {}