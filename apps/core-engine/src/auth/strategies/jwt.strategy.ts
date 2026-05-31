import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '@deepspace/shared-types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET', 'deepspace-default-secret'),
    });
  }

  validate(payload: JwtPayload): {
    sub: string;
    username: string;
    email: string;
    role: string;
  } {
    return {
      sub: payload.sub,
      username: payload.username,
      email: payload.email,
      role: payload.role,
    };
  }
}
