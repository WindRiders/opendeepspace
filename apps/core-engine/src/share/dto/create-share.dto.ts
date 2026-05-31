import { IsString, IsNotEmpty, IsEnum, IsDefined } from 'class-validator';
import type { ShareType } from '@deepspace/shared-types';

export enum ShareTypeEnum {
  DNA = 'dna',
  TEMPLATE = 'template',
  TRACE = 'trace',
}

export class CreateShareDto {
  @IsDefined()
  @IsEnum(ShareTypeEnum)
  type: ShareType;

  @IsDefined()
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsDefined()
  @IsString()
  @IsNotEmpty()
  payload: string;
}
