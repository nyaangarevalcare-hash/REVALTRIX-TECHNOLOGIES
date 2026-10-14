import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProductVisibility, ShopOrderStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import type {
  CreateShopCategoryDto,
  CreateShopOrderDto,
  CreateShopProductDto,
  UpdateShopOrderStatusDto,
  UpdateShopProductDto,
  UpdateShopSettingsDto,
} from './dto/shop.dto.js';

@Injectable()
export class ShopService {
  constructor(
    private readonly database: DatabaseService,
    private readonly authorization: AuthorizationService,
  ) {}

  async getSettings(userId: string) {
    const { tenantId } = await this.authorization.getContext(userId);
    return this.database.client.shopSettings.findUnique({
      where: { tenantId },
    });
  }

  async updateSettings(userId: string, dto: UpdateShopSettingsDto) {
    const context = await this.authorization.assertPermission(userId, {
      resource: 'shop',
      action: 'update',
    });
    const currentSettings = await this.database.client.shopSettings.findUnique({
      where: { tenantId: context.tenantId },
      select: {
        acceptingOrders: true,
        deliveryEnabled: true,
        pickupEnabled: true,
      },
    });
    const acceptingOrders = dto.acceptingOrders ?? currentSettings?.acceptingOrders ?? false;
    const deliveryEnabled = dto.deliveryEnabled ?? currentSettings?.deliveryEnabled ?? false;
    const pickupEnabled = dto.pickupEnabled ?? currentSettings?.pickupEnabled ?? true;
    if (acceptingOrders && !deliveryEnabled && !pickupEnabled) {
      throw new BadRequestException('Enable delivery or pickup before accepting shop orders.');
    }
    const settings = await this.database.client.shopSettings.upsert({
      where: { tenantId: context.tenantId },
      create: {
        tenantId: context.tenantId,
        storeName: dto.storeName,
        acceptingOrders: dto.acceptingOrders ?? false,
        deliveryEnabled: dto.deliveryEnabled ?? false,
        pickupEnabled: dto.pickupEnabled ?? true,
        deliveryFee: dto.deliveryFee ?? 0,
        minimumOrderValue: dto.minimumOrderValue ?? 0,
        currency: dto.currency?.toUpperCase() ?? 'KES',
      },
      update: {
        storeName: dto.storeName,
        ...(dto.acceptingOrders !== undefined && {
          acceptingOrders: dto.acceptingOrders,
        }),
        ...(dto.deliveryEnabled !== undefined && {
          deliveryEnabled: dto.deliveryEnabled,
        }),
        ...(dto.pickupEnabled !== undefined && {
          pickupEnabled: dto.pickupEnabled,
        }),
        ...(dto.deliveryFee !== undefined && { deliveryFee: dto.deliveryFee }),
        ...(dto.minimumOrderValue !== undefined && {
          minimumOrderValue: dto.minimumOrderValue,
        }),
        ...(dto.currency !== undefined && {
          currency: dto.currency.toUpperCase(),
        }),
      },
    });

    await this.audit(
      context.tenantId,
      userId,
      'SHOP_SETTINGS_UPDATED',
      'SHOP_SETTINGS',
      settings.id,
    );
    return settings;
  }

  async listCategories(userId: string) {
    const { tenantId } = await this.authorization.getContext(userId);
    return this.database.client.productCategory.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
  }

  async createCategory(userId: string, dto: CreateShopCategoryDto) {
    const context = await this.authorization.assertPermission(userId, {
      resource: 'shop',
      action: 'create',
    });
    if (!dto.name.trim() || !dto.slug.trim()) {
      throw new BadRequestException('Category name and slug cannot be blank.');
    }
    try {
      return await this.database.client.productCategory.create({
        data: {
          tenantId: context.tenantId,
          name: dto.name.trim(),
          slug: dto.slug.trim().toLowerCase(),
          description: dto.description?.trim() ?? null,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A category with this slug already exists.');
      }
      throw error;
    }
  }

  async listProducts(userId: string, includeHidden = true) {
    const { tenantId } = await this.authorization.getContext(userId);
    return this.database.client.product.findMany({
      where: {
        tenantId,
        ...(includeHidden ? {} : { visibility: ProductVisibility.ONLINE }),
      },
      include: { category: true },
      orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
      take: 200,
    });
  }

  async createProduct(userId: string, dto: CreateShopProductDto) {
    const context = await this.authorization.assertPermission(userId, {
      resource: 'shop',
      action: 'create',
    });
    if (!dto.name.trim() || !dto.sku.trim()) {
      throw new BadRequestException('Product name and SKU cannot be blank.');
    }
    await this.assertCategory(context.tenantId, dto.categoryId);
    try {
      const product = await this.database.client.product.create({
        data: {
          tenantId: context.tenantId,
          categoryId: dto.categoryId ?? null,
          name: dto.name.trim(),
          sku: dto.sku.trim(),
          description: dto.description?.trim() ?? null,
          images: dto.images ?? [],
          brand: dto.brand?.trim() ?? null,
          price: new Prisma.Decimal(dto.price),
          compareAtPrice:
            dto.compareAtPrice === undefined ? null : new Prisma.Decimal(dto.compareAtPrice),
          taxRate: new Prisma.Decimal(dto.taxRate ?? 0),
          stockQuantity: dto.stockQuantity ?? 0,
          reorderLevel: dto.reorderLevel ?? 0,
          unit: dto.unit?.trim() || 'unit',
          barcode: dto.barcode?.trim() ?? null,
          expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
          batchNumber: dto.batchNumber?.trim() ?? null,
          visibility: dto.visibility ?? ProductVisibility.HIDDEN,
          prescriptionRequired: dto.prescriptionRequired ?? false,
          tags: dto.tags ?? [],
        },
      });
      await this.audit(context.tenantId, userId, 'SHOP_PRODUCT_CREATED', 'PRODUCT', product.id);
      return product;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A product with this SKU or barcode already exists.');
      }
      throw error;
    }
  }

  async updateProduct(userId: string, productId: string, dto: UpdateShopProductDto) {
    const context = await this.authorization.assertPermission(userId, {
      resource: 'shop',
      action: 'update',
    });
    const existing = await this.assertProduct(context.tenantId, productId);
    if (dto.stockQuantity !== undefined && dto.stockQuantity < existing.reservedStock) {
      throw new BadRequestException(
        'Available stock cannot be lower than stock already reserved by orders.',
      );
    }
    await this.assertCategory(context.tenantId, dto.categoryId);
    const updateData: Prisma.ProductUpdateInput = {
      ...(dto.categoryId !== undefined && {
        category: dto.categoryId ? { connect: { id: dto.categoryId } } : { disconnect: true },
      }),
      ...(dto.name !== undefined && { name: dto.name.trim() }),
      ...(dto.sku !== undefined && { sku: dto.sku.trim() }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.images !== undefined && { images: dto.images }),
      ...(dto.brand !== undefined && { brand: dto.brand }),
      ...(dto.price !== undefined && {
        price: new Prisma.Decimal(dto.price),
      }),
      ...(dto.compareAtPrice !== undefined && {
        compareAtPrice: dto.compareAtPrice === null ? null : new Prisma.Decimal(dto.compareAtPrice),
      }),
      ...(dto.taxRate !== undefined && {
        taxRate: new Prisma.Decimal(dto.taxRate),
      }),
      ...(dto.stockQuantity !== undefined && {
        stockQuantity: dto.stockQuantity,
      }),
      ...(dto.reorderLevel !== undefined && {
        reorderLevel: dto.reorderLevel,
      }),
      ...(dto.unit !== undefined && { unit: dto.unit.trim() }),
      ...(dto.barcode !== undefined && { barcode: dto.barcode }),
      ...(dto.expiryDate !== undefined && {
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
      }),
      ...(dto.batchNumber !== undefined && { batchNumber: dto.batchNumber }),
      ...(dto.visibility !== undefined && { visibility: dto.visibility }),
      ...(dto.prescriptionRequired !== undefined && {
        prescriptionRequired: dto.prescriptionRequired,
      }),
      ...(dto.tags !== undefined && { tags: dto.tags }),
    };
    try {
      const product = await this.database.client.product.update({
        where: {
          id: productId,
          tenantId: context.tenantId,
          ...(dto.stockQuantity !== undefined && {
            reservedStock: { lte: dto.stockQuantity },
          }),
        },
        data: updateData,
      });
      await this.audit(context.tenantId, userId, 'SHOP_PRODUCT_UPDATED', 'PRODUCT', product.id);
      return product;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A product with this SKU or barcode already exists.');
      }
      if (
        dto.stockQuantity !== undefined &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new ConflictException(
          'Available stock cannot be lower than stock reserved by concurrent orders.',
        );
      }
      throw error;
    }
  }

  async createOrder(userId: string, dto: CreateShopOrderDto) {
    const context = await this.authorization.assertPermission(userId, {
      resource: 'shop',
      action: 'create',
    });

    return this.database.client.$transaction(async (tx) => {
      const settings = await tx.shopSettings.findUnique({
        where: { tenantId: context.tenantId },
      });
      if (!settings?.acceptingOrders) {
        throw new BadRequestException('The shop is not currently accepting orders.');
      }
      if (dto.deliveryMethod === 'DELIVERY' && !settings.deliveryEnabled) {
        throw new BadRequestException('Delivery is not enabled for this shop.');
      }
      if (dto.deliveryMethod === 'PICKUP' && !settings.pickupEnabled) {
        throw new BadRequestException('Pickup is not enabled for this shop.');
      }
      if (
        dto.deliveryMethod === 'DELIVERY' &&
        (!dto.deliveryAddress || Object.keys(dto.deliveryAddress).length === 0)
      ) {
        throw new BadRequestException('A delivery address is required.');
      }
      if (
        dto.deliveryAddress &&
        (Object.keys(dto.deliveryAddress).length > 8 ||
          Object.entries(dto.deliveryAddress).some(
            ([key, value]) => key.length > 40 || typeof value !== 'string' || value.length > 200,
          ))
      ) {
        throw new BadRequestException('The delivery address contains invalid values.');
      }
      if (
        dto.items.some((item) => item.productId === '') ||
        new Set(dto.items.map((item) => item.productId)).size !== dto.items.length
      ) {
        throw new BadRequestException('Each product may only appear once in an order.');
      }

      const products = await tx.product.findMany({
        where: {
          tenantId: context.tenantId,
          id: { in: dto.items.map(({ productId }) => productId) },
          visibility: ProductVisibility.ONLINE,
        },
      });
      if (products.length !== dto.items.length) {
        throw new BadRequestException('One or more products are unavailable.');
      }

      let subtotal = new Prisma.Decimal(0);
      let taxTotal = new Prisma.Decimal(0);
      const lines = dto.items.map((item) => {
        const product = products.find(({ id }) => id === item.productId);
        if (!product) {
          throw new BadRequestException('One or more products are unavailable.');
        }
        if (product.prescriptionRequired) {
          throw new BadRequestException(
            `${product.name} requires prescription review, which is not available in this shop flow.`,
          );
        }
        const lineSubtotal = product.price.mul(item.quantity);
        const lineTax = lineSubtotal.mul(product.taxRate).div(100).toDecimalPlaces(2);
        subtotal = subtotal.add(lineSubtotal);
        taxTotal = taxTotal.add(lineTax);
        return {
          item,
          product,
          lineTotal: lineSubtotal.add(lineTax),
        };
      });

      if (subtotal.lessThan(settings.minimumOrderValue)) {
        throw new BadRequestException('The order is below the shop minimum order value.');
      }
      const deliveryFee =
        dto.deliveryMethod === 'DELIVERY'
          ? new Prisma.Decimal(settings.deliveryFee)
          : new Prisma.Decimal(0);
      const total = subtotal.add(taxTotal).add(deliveryFee);
      for (const { item, product } of lines) {
        const reserved = await tx.$executeRaw`
          UPDATE "products"
          SET "reservedStock" = "reservedStock" + ${item.quantity},
              "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${product.id}::uuid
            AND "tenantId" = ${context.tenantId}::uuid
            AND "stockQuantity" - "reservedStock" >= ${item.quantity}
        `;
        if (reserved !== 1) {
          throw new ConflictException(`Insufficient stock for ${product.name}.`);
        }
      }

      const order = await tx.shopOrder.create({
        data: {
          tenantId: context.tenantId,
          orderNumber: `SHOP-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`,
          currency: settings.currency,
          subtotal,
          deliveryFee,
          taxTotal,
          total,
          deliveryMethod: dto.deliveryMethod,
          ...(dto.deliveryAddress && { deliveryAddress: dto.deliveryAddress }),
          customerName: dto.customerName.trim(),
          customerPhone: dto.customerPhone.trim(),
          ...(dto.customerEmail && { customerEmail: dto.customerEmail.trim() }),
          items: {
            create: lines.map(({ item, product, lineTotal }) => ({
              productId: product.id,
              productName: product.name,
              sku: product.sku,
              quantity: item.quantity,
              unitPrice: product.price,
              taxRate: product.taxRate,
              lineTotal,
            })),
          },
        },
        include: { items: true },
      });

      await tx.auditEvent.create({
        data: {
          tenantId: context.tenantId,
          actorUserId: userId,
          action: 'SHOP_ORDER_CREATED',
          resourceType: 'SHOP_ORDER',
          resourceId: order.id,
          outcome: 'SUCCESS',
          metadata: { orderNumber: order.orderNumber, total: total.toString() },
        },
      });
      return order;
    });
  }

  async listOrders(userId: string) {
    const { tenantId } = await this.authorization.getContext(userId);
    return this.database.client.shopOrder.findMany({
      where: { tenantId },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async updateOrderStatus(userId: string, orderId: string, dto: UpdateShopOrderStatusDto) {
    const context = await this.authorization.assertPermission(userId, {
      resource: 'shop',
      action: 'update',
    });
    return this.database.client.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id"
        FROM "shop_orders"
        WHERE "id" = ${orderId}::uuid
          AND "tenantId" = ${context.tenantId}::uuid
        FOR UPDATE
      `;
      const order = await tx.shopOrder.findFirst({
        where: { id: orderId, tenantId: context.tenantId },
        include: { items: true },
      });
      if (!order) {
        throw new NotFoundException('Shop order not found.');
      }
      this.assertOrderTransition(order.status, dto.status, order.deliveryMethod);
      if (dto.status === ShopOrderStatus.CANCELLED) {
        for (const item of order.items) {
          const released = await tx.product.updateMany({
            where: {
              id: item.productId,
              tenantId: context.tenantId,
              reservedStock: { gte: item.quantity },
            },
            data: { reservedStock: { decrement: item.quantity } },
          });
          if (released.count !== 1) {
            throw new ConflictException('Reserved stock no longer matches this order.');
          }
        }
      } else if (
        dto.status === ShopOrderStatus.OUT_FOR_DELIVERY ||
        (dto.status === ShopOrderStatus.DELIVERED && order.deliveryMethod === 'PICKUP')
      ) {
        for (const item of order.items) {
          const changed = await tx.product.updateMany({
            where: {
              id: item.productId,
              tenantId: context.tenantId,
              reservedStock: { gte: item.quantity },
              stockQuantity: { gte: item.quantity },
            },
            data: {
              reservedStock: { decrement: item.quantity },
              stockQuantity: { decrement: item.quantity },
            },
          });
          if (changed.count !== 1) {
            throw new ConflictException('Reserved stock no longer matches this order.');
          }
        }
      }
      const updated = await tx.shopOrder.update({
        where: { id: order.id },
        data: { status: dto.status },
        include: { items: true },
      });
      await tx.auditEvent.create({
        data: {
          tenantId: context.tenantId,
          actorUserId: userId,
          action: 'SHOP_ORDER_STATUS_UPDATED',
          resourceType: 'SHOP_ORDER',
          resourceId: order.id,
          outcome: 'SUCCESS',
          metadata: { from: order.status, to: dto.status },
        },
      });
      return updated;
    });
  }

  private async assertCategory(tenantId: string, categoryId?: string | null) {
    if (!categoryId) {
      return;
    }
    const category = await this.database.client.productCategory.findFirst({
      where: { id: categoryId, tenantId, isActive: true },
      select: { id: true },
    });
    if (!category) {
      throw new BadRequestException('The selected product category is unavailable.');
    }
  }

  private async assertProduct(tenantId: string, productId: string) {
    const product = await this.database.client.product.findFirst({
      where: { id: productId, tenantId },
      select: { id: true, reservedStock: true },
    });
    if (!product) {
      throw new NotFoundException('Product not found.');
    }
    return product;
  }

  private assertOrderTransition(
    current: ShopOrderStatus,
    next: ShopOrderStatus,
    deliveryMethod: string,
  ) {
    const transitions: Record<ShopOrderStatus, ShopOrderStatus[]> = {
      PENDING: [ShopOrderStatus.CONFIRMED, ShopOrderStatus.CANCELLED],
      CONFIRMED: [ShopOrderStatus.PACKED, ShopOrderStatus.CANCELLED],
      PACKED: [
        ShopOrderStatus.READY_FOR_PICKUP,
        ShopOrderStatus.OUT_FOR_DELIVERY,
        ShopOrderStatus.CANCELLED,
      ],
      READY_FOR_PICKUP: [ShopOrderStatus.DELIVERED],
      OUT_FOR_DELIVERY: [ShopOrderStatus.DELIVERED],
      DELIVERED: [],
      CANCELLED: [],
      REFUNDED: [],
    };
    if (!transitions[current].includes(next)) {
      throw new BadRequestException(`Cannot change order status from ${current} to ${next}.`);
    }
    if (next === ShopOrderStatus.READY_FOR_PICKUP && deliveryMethod !== 'PICKUP') {
      throw new BadRequestException('Only pickup orders can be marked ready for pickup.');
    }
    if (next === ShopOrderStatus.OUT_FOR_DELIVERY && deliveryMethod !== 'DELIVERY') {
      throw new BadRequestException('Only delivery orders can be sent out for delivery.');
    }
  }

  private async audit(
    tenantId: string,
    actorUserId: string,
    action: string,
    resourceType: string,
    resourceId: string,
  ) {
    await this.database.client.auditEvent.create({
      data: {
        tenantId,
        actorUserId,
        action,
        resourceType,
        resourceId,
        outcome: 'SUCCESS',
      },
    });
  }
}
