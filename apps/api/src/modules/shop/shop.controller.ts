import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AccessTokenGuard } from '../core/authentication/guards/access-token.guard.js';
import type { AuthenticatedRequest } from '../core/authentication/guards/access-token.guard.js';
import { PermissionGuard } from '../authorization/guards/permission.guard.js';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator.js';
import {
  CreateShopCategoryDto,
  CreateShopOrderDto,
  CreateShopProductDto,
  UpdateShopOrderStatusDto,
  UpdateShopProductDto,
  UpdateShopSettingsDto,
} from './dto/shop.dto.js';
import { ShopService } from './shop.service.js';

@Controller('v1/shop')
@UseGuards(AccessTokenGuard, PermissionGuard)
export class ShopController {
  constructor(private readonly shop: ShopService) {}

  @Get('settings')
  @RequirePermission('shop', 'read')
  getSettings(@Req() request: AuthenticatedRequest) {
    return this.shop.getSettings(request.auth.userId);
  }

  @Patch('settings')
  @RequirePermission('shop', 'update')
  updateSettings(@Req() request: AuthenticatedRequest, @Body() dto: UpdateShopSettingsDto) {
    return this.shop.updateSettings(request.auth.userId, dto);
  }

  @Get('categories')
  @RequirePermission('shop', 'read')
  listCategories(@Req() request: AuthenticatedRequest) {
    return this.shop.listCategories(request.auth.userId);
  }

  @Post('categories')
  @RequirePermission('shop', 'create')
  createCategory(@Req() request: AuthenticatedRequest, @Body() dto: CreateShopCategoryDto) {
    return this.shop.createCategory(request.auth.userId, dto);
  }

  @Get('products')
  @RequirePermission('shop', 'read')
  listProducts(
    @Req() request: AuthenticatedRequest,
    @Query('includeHidden') includeHidden?: string,
  ) {
    return this.shop.listProducts(request.auth.userId, includeHidden !== 'false');
  }

  @Post('products')
  @RequirePermission('shop', 'create')
  createProduct(@Req() request: AuthenticatedRequest, @Body() dto: CreateShopProductDto) {
    return this.shop.createProduct(request.auth.userId, dto);
  }

  @Patch('products/:productId')
  @RequirePermission('shop', 'update')
  updateProduct(
    @Req() request: AuthenticatedRequest,
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Body() dto: UpdateShopProductDto,
  ) {
    return this.shop.updateProduct(request.auth.userId, productId, dto);
  }

  @Get('orders')
  @RequirePermission('shop', 'read')
  listOrders(@Req() request: AuthenticatedRequest) {
    return this.shop.listOrders(request.auth.userId);
  }

  @Post('orders')
  @RequirePermission('shop', 'create')
  createOrder(@Req() request: AuthenticatedRequest, @Body() dto: CreateShopOrderDto) {
    return this.shop.createOrder(request.auth.userId, dto);
  }

  @Patch('orders/:orderId/status')
  @RequirePermission('shop', 'update')
  updateOrderStatus(
    @Req() request: AuthenticatedRequest,
    @Param('orderId', new ParseUUIDPipe()) orderId: string,
    @Body() dto: UpdateShopOrderStatusDto,
  ) {
    return this.shop.updateOrderStatus(request.auth.userId, orderId, dto);
  }
}
