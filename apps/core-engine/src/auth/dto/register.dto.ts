import { IsEmail, IsString, MinLength, MaxLength, Matches, IsDefined } from 'class-validator';

export class RegisterDto {
  @IsDefined()
  @IsEmail()
  email: string;

  @IsDefined()
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: 'username can only contain letters, numbers, underscores and hyphens',
  })
  username: string;

  @IsDefined()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}
