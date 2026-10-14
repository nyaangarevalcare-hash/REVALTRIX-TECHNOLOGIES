import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { createHash } from 'node:crypto';
import { DatabaseService } from '../../../database/database.service.js';

export interface RegistrationAuthenticatedRequest extends Request {
  registrationAuth: {
    userId: string;
    registrationSessionId: string;
    purpose: string;
  };
}

@Injectable()
export class RegistrationSessionGuard implements CanActivate {
  constructor(private readonly database: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RegistrationAuthenticatedRequest>();

    const header = request.headers['x-registration-token'];

    if (typeof header !== 'string' || !header.trim()) {
      throw new UnauthorizedException('Registration session required');
    }

    const tokenHash = createHash('sha256').update(header.trim()).digest('hex');

    const session = await this.database.client.registrationSession.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        purpose: true,
        expiresAt: true,
        consumedAt: true,
        user: {
          select: {
            id: true,
            status: true,
            deletedAt: true,
          },
        },
      },
    });

    if (
      !session ||
      session.consumedAt !== null ||
      session.expiresAt <= new Date() ||
      session.user.status !== 'ACTIVE' ||
      session.user.deletedAt !== null
    ) {
      throw new UnauthorizedException('Registration session is invalid or expired');
    }

    await this.database.client.registrationSession.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date() },
    });

    request.registrationAuth = {
      userId: session.userId,
      registrationSessionId: session.id,
      purpose: session.purpose,
    };

    return true;
  }
}
