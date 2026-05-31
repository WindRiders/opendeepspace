import { IsDefined, IsString, IsNotEmpty, IsArray, IsOptional, MaxLength } from 'class-validator';

export class PublishAgentDto {
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  name: string;

  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  description: string;

  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  dna: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  modelId?: string;
}