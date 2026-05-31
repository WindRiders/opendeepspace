import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class UpdateTitleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title: string;
}
