import { IsString, IsNotEmpty, MaxLength, IsOptional, IsDefined } from 'class-validator';

export class InteractDto {
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  message: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  dna?: string;

  @IsString()
  @IsOptional()
  @MaxLength(256)
  sessionId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  modelId?: string;
}
