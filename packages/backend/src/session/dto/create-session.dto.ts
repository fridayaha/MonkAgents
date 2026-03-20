import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class CreateSessionDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsString()
  @IsNotEmpty()
  workingDirectory: string;

  @IsOptional()
  @IsString()
  primaryAgent?: string;
}