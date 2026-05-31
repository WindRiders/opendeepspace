import { IsString, IsNotEmpty, IsDefined } from 'class-validator';

export class LoginDto {
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsDefined()
  @IsString()
  @IsNotEmpty()
  password: string;
}
