import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Socket } from 'socket.io';

@Injectable()
export class WsJwtGuard implements CanActivate {
  private readonly logger = new Logger(WsJwtGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const client: Socket = context.switchToWs().getClient();
    const token =
      client.handshake.auth?.token ||
      client.handshake.query?.token as string;

    if (!token) {
      // Allow unauthenticated connections (messages scoped by session ownership in service layer)
      (client as any).user = { sub: 'anonymous' };
      return true;
    }

    try {
      const secret =
        this.configService.get<string>('JWT_SECRET', 'deepspace-default-secret');
      const payload = this.jwtService.verify(token, { secret });
      (client as any).user = payload;
      return true;
    } catch (err: any) {
      this.logger.warn(`WS auth failed: ${err.message}`);
      // Still allow connection but without auth
      (client as any).user = { sub: 'anonymous' };
      return true;
    }
  }
}
