import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../core/authentication/authentication.module.js';
import { AuthorizationModule } from '../authorization/authorization.module.js';
import { ShopController } from './shop.controller.js';
import { ShopService } from './shop.service.js';
import { BatchService } from './batch.service.js';
import { ShopProductService } from './shop-product.service.js';
import { PurchaseService } from './purchase.service.js';
import { ShopSupplierService } from './shop-supplier.service.js';
import { StorageModule } from '../storage/storage.module.js';

@Module({
  imports: [AuthenticationModule, AuthorizationModule, StorageModule],
  controllers: [ShopController],
  providers: [ShopService, ShopProductService, BatchService, PurchaseService, ShopSupplierService],
})
export class ShopModule {}
