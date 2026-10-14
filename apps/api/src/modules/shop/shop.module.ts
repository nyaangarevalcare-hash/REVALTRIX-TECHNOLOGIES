import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../core/authentication/authentication.module.js';
import { AuthorizationModule } from '../authorization/authorization.module.js';
import { ShopController } from './shop.controller.js';
import { ShopService } from './shop.service.js';

@Module({
  imports: [AuthenticationModule, AuthorizationModule],
  controllers: [ShopController],
  providers: [ShopService],
})
export class ShopModule {}
