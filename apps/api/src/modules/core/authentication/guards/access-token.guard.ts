import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { TokenService } from '../token.service.js';
import { SessionService } from '../../sessions/session.service.js';

export interface AuthenticatedRequest extends Request {
  auth: {
    userId: string;
    sessionId: string;
  };
  departmentAccess?: {
    tenantId: string;
    departmentId: string;
    branchId: string | null;
    accessLevel: string;
    role: string;
    canGrantPermission: boolean;
  };
}

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    private readonly sessionService: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const authorization = request.headers.authorization;

    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Authentication required');
    }

    const token = authorization.slice(7).trim();

    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    const payload = await this.tokenService.verifyAccessToken(token);

    if (payload.type !== 'access' || !payload.sub || !payload.sid) {
      throw new UnauthorizedException('Invalid access token');
    }

    const session = await this.sessionService.findActiveSession(payload.sid);

    if (!session || session.userId !== payload.sub) {
      throw new UnauthorizedException('Session is no longer active');
    }

    request.auth = {
      userId: payload.sub,
      sessionId: payload.sid,
    };

    return true;
  }
}
