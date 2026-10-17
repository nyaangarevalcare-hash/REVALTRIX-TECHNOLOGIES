import { BatchService } from './batch.service.js';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  ProductVisibility,
  SalePaymentMethod,
  SalePaymentStatus,
  SaleStatus,
  ShopOrderStatus,
  StockMovementType,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import type {
  CreateShopCategoryDto,
  CreateShopOrderDto,
  CreateShopProductDto,
  CreateShopPosSaleDto,
  HoldShopPosSaleDto,
  RefundShopPosSaleDto,
  ReceiveShopPosBatchDto,
  ResumeShopPosSaleDto,
  UpdateShopOrderStatusDto,
  UpdateShopProductDto,
  UpdateShopSettingsDto,
} from './dto/shop.dto.js';

@Injectable()
export class ShopService {
  constructor(
    private readonly database: DatabaseService,
    private readonly authorization: AuthorizationService,
    private readonly batchService: BatchService,
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
          brandName: dto.brand?.trim() ?? null,
          price: new Prisma.Decimal(dto.price),
          sellingPrice: new Prisma.Decimal(dto.price),
          compareAtPrice:
            dto.compareAtPrice === undefined ? null : new Prisma.Decimal(dto.compareAtPrice),
          taxRate: new Prisma.Decimal(dto.taxRate ?? 0),
          stockQuantity: dto.stockQuantity ?? 0,
          reorderLevel: dto.reorderLevel ?? 0,
          minimumStockLevel: dto.reorderLevel ?? 0,
          unit: dto.unit?.trim() || 'unit',
          barcode: dto.barcode?.trim() ?? null,
          expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
          batchNumber: dto.batchNumber?.trim() ?? null,
          visibility: dto.visibility ?? ProductVisibility.HIDDEN,
          status:
            dto.visibility === ProductVisibility.DISCONTINUED
              ? 'DISCONTINUED'
              : dto.visibility === ProductVisibility.HIDDEN
                ? 'INACTIVE'
                : 'ACTIVE',
          prescriptionRequired: dto.prescriptionRequired ?? false,
          prescriptionClass: dto.prescriptionRequired ? 'PRESCRIPTION_ONLY' : 'OTC',
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
      ...(dto.brand !== undefined && { brandName: dto.brand }),
      ...(dto.price !== undefined && {
        price: new Prisma.Decimal(dto.price),
        sellingPrice: new Prisma.Decimal(dto.price),
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
        minimumStockLevel: dto.reorderLevel,
      }),
      ...(dto.unit !== undefined && { unit: dto.unit.trim() }),
      ...(dto.barcode !== undefined && { barcode: dto.barcode }),
      ...(dto.expiryDate !== undefined && {
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
      }),
      ...(dto.batchNumber !== undefined && { batchNumber: dto.batchNumber }),
      ...(dto.visibility !== undefined && {
        visibility: dto.visibility,
        status:
          dto.visibility === ProductVisibility.DISCONTINUED
            ? 'DISCONTINUED'
            : dto.visibility === ProductVisibility.HIDDEN
              ? 'INACTIVE'
              : 'ACTIVE',
      }),
      ...(dto.prescriptionRequired !== undefined && {
        prescriptionRequired: dto.prescriptionRequired,
        prescriptionClass: dto.prescriptionRequired ? 'PRESCRIPTION_ONLY' : 'OTC',
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

  async searchPosProducts(userId: string, search: string) {
    const { tenantId } = await this.authorization.assertPermission(userId, {
      resource: 'shop',
      action: 'read',
    });
    const term = search.trim();
    if (term.length > 120) {
      throw new BadRequestException('Product search cannot exceed 120 characters.');
    }
    const products = await this.database.client.product.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
        visibility: { in: [ProductVisibility.ONLINE, ProductVisibility.IN_STORE_ONLY] },
        ...(term
          ? {
              OR: [
                { name: { contains: term, mode: 'insensitive' } },
                { brand: { contains: term, mode: 'insensitive' } },
                { genericName: { contains: term, mode: 'insensitive' } },
                { sku: { contains: term, mode: 'insensitive' } },
                { barcode: { contains: term, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        batches: {
          where: {
            quantity: { gt: 0 },
            expiryDate: { gte: this.startOfToday() },
          },
          orderBy: [{ expiryDate: 'asc' }, { receivedAt: 'asc' }],
        },
        category: true,
      },
      orderBy: { name: 'asc' },
      take: 50,
    });

    return products
      .map((product) => {
        const batchQuantity = product.batches.reduce((sum, batch) => sum + batch.quantity, 0);
        const availableStock = Math.max(
          0,
          Math.min(batchQuantity, product.stockQuantity - product.reservedStock),
        );
        return {
          id: product.id,
          name: product.name,
          brand: product.brand,
          genericName: product.genericName,
          strength: product.strength,
          dosageForm: product.dosageForm,
          packSize: product.packSize,
          image: product.images[0] ?? null,
          sku: product.sku,
          barcode: product.barcode,
          unit: product.unit,
          price: product.price,
          taxRate: product.taxRate,
          prescriptionRequired: product.prescriptionRequired,
          availableStock,
          nextBatch: product.batches[0]
            ? {
                id: product.batches[0].id,
                batchNumber: product.batches[0].batchNumber,
                expiryDate: product.batches[0].expiryDate,
                availableQuantity: Math.min(product.batches[0].quantity, availableStock),
              }
            : null,
        };
      })
      .filter((product) => product.availableStock > 0);
  }

  async listPosBatches(userId: string, productId: string) {
    const { tenantId } = await this.authorization.assertPermission(userId, {
      resource: 'shop',
      action: 'read',
    });
    const product = await this.database.client.product.findFirst({
      where: {
        id: productId,
        tenantId,
        status: 'ACTIVE',
        visibility: { in: [ProductVisibility.ONLINE, ProductVisibility.IN_STORE_ONLY] },
      },
      select: { stockQuantity: true, reservedStock: true },
    });
    if (!product) {
      throw new NotFoundException('Product not found.');
    }

    const batches = await this.database.client.productBatch.findMany({
      where: {
        tenantId,
        productId,
        quantity: { gt: 0 },
        expiryDate: { gte: this.startOfToday() },
      },
      orderBy: [{ expiryDate: 'asc' }, { receivedAt: 'asc' }],
    });
    let stockLeft = Math.max(0, product.stockQuantity - product.reservedStock);
    return batches
      .map((batch) => {
        const availableQuantity = Math.min(batch.quantity, stockLeft);
        stockLeft -= availableQuantity;
        return {
          id: batch.id,
          batchNumber: batch.batchNumber,
          expiryDate: batch.expiryDate,
          availableQuantity,
          costPrice: batch.costPrice,
        };
      })
      .filter((batch) => batch.availableQuantity > 0);
  }

  async receivePosBatch(userId: string, dto: ReceiveShopPosBatchDto) {
    const context = await this.authorization.assertPermission(userId, {
      resource: 'shop',
      action: 'update',
    });
    const expiryDate = new Date(dto.expiryDate);
    if (expiryDate < this.startOfToday()) {
      throw new BadRequestException('Cannot receive stock with an expired batch date.');
    }

    return this.database.client.$transaction(async (tx) => {
      const lockedProduct = await tx.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM "products"
          WHERE "id" = ${dto.productId}::uuid AND "tenantId" = ${context.tenantId}::uuid
          FOR UPDATE
        `;
      if (lockedProduct.length === 0) {
        throw new NotFoundException('Product not found.');
      }

      const batch = await tx.productBatch
        .create({
          data: {
            tenantId: context.tenantId,
            productId: dto.productId,
            batchNumber: dto.batchNumber.trim(),
            expiryDate,
            quantity: dto.quantity,
            costPrice: new Prisma.Decimal(dto.costPrice),
            supplierName: dto.supplierName?.trim() || null,
          },
        })
        .catch((error: unknown) => {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new ConflictException('This product already has a batch with that number.');
          }
          throw error;
        });

      await tx.product.update({
        where: { id: dto.productId },
        data: { stockQuantity: { increment: dto.quantity } },
      });
      await tx.stockMovement.create({
        data: {
          tenantId: context.tenantId,
          userId,
          productId: dto.productId,
          batchId: batch.id,
          type: StockMovementType.RECEIVE,
          quantity: dto.quantity,
          reason: `Stock received: batch ${batch.batchNumber}`,
        },
      });
      await tx.auditEvent.create({
        data: {
          tenantId: context.tenantId,
          actorUserId: userId,
          action: 'SHOP_POS_BATCH_RECEIVED',
          resourceType: 'PRODUCT_BATCH',
          resourceId: batch.id,
          outcome: 'SUCCESS',
          metadata: {
            productId: dto.productId,
            batchNumber: batch.batchNumber,
            quantity: dto.quantity,
          },
        },
      });
      return batch;
    });
  }

  async createPosSale(userId: string, dto: CreateShopPosSaleDto) {
    const context = await this.authorization.assertPermission(userId, {
      resource: 'shop',
      action: 'create',
    });
    this.assertUniqueSaleBatches(dto.items);

    return this.database.client.$transaction(async (tx) => {
      const today = this.startOfToday();
      const productIds = [...new Set(dto.items.map((item) => item.productId))].sort();
      const lockIds = [...new Set(dto.items.map((item) => item.batchId))].sort();
      for (const batchId of lockIds) {
        await tx.$queryRaw`
            SELECT "id" FROM "product_batches"
            WHERE "id" = ${batchId}::uuid AND "tenantId" = ${context.tenantId}::uuid
            FOR UPDATE
          `;
      }
      for (const productId of productIds) {
        await tx.$queryRaw`
            SELECT "id" FROM "products"
            WHERE "id" = ${productId}::uuid AND "tenantId" = ${context.tenantId}::uuid
            FOR UPDATE
          `;
      }

      const products = await tx.product.findMany({
        where: {
          tenantId: context.tenantId,
          id: { in: [...new Set(dto.items.map((item) => item.productId))] },
          visibility: { in: [ProductVisibility.ONLINE, ProductVisibility.IN_STORE_ONLY] },
        },
      });
      const batches = await tx.productBatch.findMany({
        where: {
          tenantId: context.tenantId,
          id: { in: lockIds },
        },
      });

      let subtotal = new Prisma.Decimal(0);
      let itemDiscountTotal = new Prisma.Decimal(0);
      let taxTotal = new Prisma.Decimal(0);
      const saleLines = dto.items.map((item) => {
        const product = products.find((candidate) => candidate.id === item.productId);
        const batch = batches.find(
          (candidate) => candidate.id === item.batchId && candidate.productId === item.productId,
        );
        if (!product || !batch) {
          throw new BadRequestException('A selected product or batch is unavailable.');
        }
        if (product.prescriptionRequired) {
          throw new BadRequestException(
            `${product.name} requires a verified prescription. Prescription verification is not available in the POS yet.`,
          );
        }
        if (batch.expiryDate < today) {
          throw new BadRequestException(`Expired batch ${batch.batchNumber} cannot be sold.`);
        }
        if (batch.quantity < item.quantity) {
          throw new ConflictException(
            `Batch ${batch.batchNumber} has only ${batch.quantity} units available.`,
          );
        }
        const gross = product.price.mul(item.quantity);
        const discount = new Prisma.Decimal(item.discountAmount ?? 0);
        if (discount.greaterThan(gross)) {
          throw new BadRequestException(`Discount exceeds the line total for ${product.name}.`);
        }
        const net = gross.sub(discount);
        const tax = net.mul(product.taxRate).div(100).toDecimalPlaces(2);
        subtotal = subtotal.add(gross);
        itemDiscountTotal = itemDiscountTotal.add(discount);
        taxTotal = taxTotal.add(tax);
        return {
          product,
          batch,
          quantity: item.quantity,
          unit: item.unit?.trim() || product.unit,
          gross,
          discount,
          tax,
          lineTotal: net.add(tax),
        };
      });

      const overallDiscount = new Prisma.Decimal(dto.discountAmount ?? 0);
      const quantityByProduct = new Map<string, number>();
      for (const { product, quantity } of saleLines) {
        quantityByProduct.set(product.id, (quantityByProduct.get(product.id) ?? 0) + quantity);
      }
      for (const product of products) {
        const requested = quantityByProduct.get(product.id) ?? 0;
        if (requested > product.stockQuantity - product.reservedStock) {
          throw new ConflictException(`Insufficient available stock for ${product.name}.`);
        }
      }
      const discountTotal = itemDiscountTotal.add(overallDiscount);
      if (discountTotal.greaterThan(subtotal)) {
        throw new BadRequestException('Total discounts cannot exceed the sale subtotal.');
      }
      const total = subtotal.sub(discountTotal).add(taxTotal).toDecimalPlaces(2);
      if (total.lessThanOrEqualTo(0)) {
        throw new BadRequestException('Sale total must be greater than zero.');
      }

      const payments = dto.payments.map((payment) => ({
        method: payment.method as SalePaymentMethod,
        amount: new Prisma.Decimal(payment.amount),
        reference: payment.reference?.trim() || null,
      }));
      const creditAmount = payments
        .filter((payment) => payment.method === SalePaymentMethod.CREDIT_ACCOUNT)
        .reduce((sum, payment) => sum.add(payment.amount), new Prisma.Decimal(0));
      const tendered = payments
        .filter(
          (payment) =>
            payment.method !== SalePaymentMethod.CREDIT_ACCOUNT &&
            payment.method !== SalePaymentMethod.MPESA_STK_PUSH,
        )
        .reduce((sum, payment) => sum.add(payment.amount), new Prisma.Decimal(0));
      const mpesaPending = payments
        .filter((payment) => payment.method === SalePaymentMethod.MPESA_STK_PUSH)
        .reduce((sum, payment) => sum.add(payment.amount), new Prisma.Decimal(0));
      if (
        mpesaPending.greaterThan(0) &&
        payments.some(
          (payment) => payment.method === SalePaymentMethod.MPESA_STK_PUSH && !payment.reference,
        )
      ) {
        throw new BadRequestException(
          'Enter the M-Pesa transaction reference for manual verification.',
        );
      }
      const cashTendered = payments
        .filter((payment) => payment.method === SalePaymentMethod.CASH)
        .reduce((sum, payment) => sum.add(payment.amount), new Prisma.Decimal(0));
      if (
        creditAmount.greaterThan(total) ||
        tendered.add(mpesaPending).add(creditAmount).lessThan(total)
      ) {
        throw new BadRequestException('Payments must cover the full sale total.');
      }
      if (
        (creditAmount.greaterThan(0) || mpesaPending.greaterThan(0)) &&
        tendered.add(mpesaPending).add(creditAmount).greaterThan(total)
      ) {
        throw new BadRequestException(
          'When using pending or account payments, payment amounts must equal the sale total.',
        );
      }
      if (tendered.greaterThan(total) && tendered.sub(total).greaterThan(cashTendered)) {
        throw new BadRequestException('Only cash payments can include change.');
      }
      const changeDue =
        creditAmount.isZero() && mpesaPending.isZero() && tendered.greaterThan(total)
          ? tendered.sub(total)
          : new Prisma.Decimal(0);
      const paymentStatus =
        creditAmount.greaterThan(0) || mpesaPending.greaterThan(0)
          ? SalePaymentStatus.PENDING
          : SalePaymentStatus.PAID;

      const sale = await tx.sale.create({
        data: {
          tenantId: context.tenantId,
          cashierUserId: userId,
          saleNumber: `POS-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`,
          currency:
            (
              await tx.shopSettings.findUnique({
                where: { tenantId: context.tenantId },
                select: { currency: true },
              })
            )?.currency ?? 'KES',
          subtotal,
          discountTotal,
          taxTotal,
          total,
          amountPaid: tendered.sub(changeDue),
          changeDue,
          paymentStatus,
          customerName: dto.customerName?.trim() || null,
          customerPhone: dto.customerPhone?.trim() || null,
          items: {
            create: saleLines.map(({ product, batch, quantity, unit, discount, lineTotal }) => ({
              productId: product.id,
              batchId: batch.id,
              productName: product.name,
              sku: product.sku,
              batchNumber: batch.batchNumber,
              expiryDate: batch.expiryDate,
              unit,
              quantity,
              unitPrice: product.price,
              discountAmount: discount,
              taxRate: product.taxRate,
              lineTotal,
            })),
          },
          payments: {
            create: payments.map((payment) => ({
              method: payment.method,
              status:
                payment.method === SalePaymentMethod.CREDIT_ACCOUNT ||
                payment.method === SalePaymentMethod.MPESA_STK_PUSH
                  ? SalePaymentStatus.PENDING
                  : SalePaymentStatus.PAID,
              amount:
                payment.method === SalePaymentMethod.CASH
                  ? payment.amount.sub(changeDue)
                  : payment.amount,
              reference: payment.reference,
            })),
          },
        },
      });

      for (const { product, batch, quantity } of saleLines) {
        const changedBatch = await tx.productBatch.updateMany({
          where: {
            id: batch.id,
            tenantId: context.tenantId,
            productId: product.id,
            quantity: { gte: quantity },
            expiryDate: { gte: today },
          },
          data: { quantity: { decrement: quantity } },
        });
        if (changedBatch.count !== 1) {
          throw new ConflictException(`Stock changed while completing sale for ${product.name}.`);
        }
        await tx.stockMovement.create({
          data: {
            tenantId: context.tenantId,
            userId,
            productId: product.id,
            batchId: batch.id,
            saleId: sale.id,
            type: StockMovementType.SALE,
            quantity: -quantity,
            reason: `POS sale ${sale.saleNumber}`,
          },
        });
      }
      for (const [productId, quantity] of quantityByProduct) {
        const changedProduct = await tx.$executeRaw`
            UPDATE "products"
            SET "stockQuantity" = "stockQuantity" - ${quantity},
                "updatedAt" = CURRENT_TIMESTAMP
            WHERE "id" = ${productId}::uuid
              AND "tenantId" = ${context.tenantId}::uuid
              AND "stockQuantity" - "reservedStock" >= ${quantity}
          `;
        if (changedProduct !== 1) {
          throw new ConflictException('Stock changed while completing this sale.');
        }
      }

      await tx.auditEvent.create({
        data: {
          tenantId: context.tenantId,
          actorUserId: userId,
          action: 'SHOP_POS_SALE_COMPLETED',
          resourceType: 'SALE',
          resourceId: sale.id,
          outcome: 'SUCCESS',
          metadata: {
            saleNumber: sale.saleNumber,
            total: total.toString(),
            itemCount: saleLines.length,
            paymentStatus,
          },
        },
      });

      return tx.sale.findUniqueOrThrow({
        where: { id: sale.id },
        include: { items: true, payments: true },
      });
    });
  }

  async holdPosSale(userId: string, dto: HoldShopPosSaleDto) {
    const context = await this.authorization.assertPermission(userId, {
      resource: 'shop',
      action: 'create',
    });
    return this.database.client.$transaction(async (tx) => {
      const held = await tx.heldShopSale.create({
        data: {
          tenantId: context.tenantId,
          cashierUserId: userId,
          payload: {
            items: dto.items.map((item) => ({
              productId: item.productId,
              batchId: item.batchId,
              quantity: item.quantity,
              unit: item.unit ?? null,
              discountAmount: item.discountAmount ?? 0,
            })),
            customerName: dto.customerName ?? '',
            customerPhone: dto.customerPhone ?? '',
            discountAmount: dto.discountAmount ?? 0,
          },
        },
      });
      await tx.auditEvent.create({
        data: {
          tenantId: context.tenantId,
          actorUserId: userId,
          action: 'SHOP_POS_SALE_HELD',
          resourceType: 'HELD_SHOP_SALE',
          resourceId: held.id,
          outcome: 'SUCCESS',
        },
      });
      return { id: held.id, createdAt: held.createdAt };
    });
  }

  async listHeldPosSales(userId: string) {
    const { tenantId, userId: cashierUserId } = await this.authorization.assertPermission(userId, {
      resource: 'shop',
      action: 'read',
    });
    return this.database.client.heldShopSale.findMany({
      where: { tenantId, cashierUserId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async resumePosSale(userId: string, dto: ResumeShopPosSaleDto) {
    const { tenantId, userId: cashierUserId } = await this.authorization.assertPermission(userId, {
      resource: 'shop',
      action: 'update',
    });
    return this.database.client.$transaction(async (tx) => {
      const held = await tx.heldShopSale.findFirst({
        where: { id: dto.heldSaleId, tenantId, cashierUserId },
      });
      if (!held) {
        throw new NotFoundException('Held sale was not found.');
      }
      if (dto.consume) {
        await tx.heldShopSale.delete({ where: { id: held.id } });
        await tx.auditEvent.create({
          data: {
            tenantId,
            actorUserId: userId,
            action: 'SHOP_POS_SALE_RESUMED',
            resourceType: 'HELD_SHOP_SALE',
            resourceId: held.id,
            outcome: 'SUCCESS',
          },
        });
      }
      return held.payload;
    });
  }

  async listPosSales(userId: string) {
    const { tenantId } = await this.authorization.assertPermission(userId, {
      resource: 'shop',
      action: 'read',
    });
    return this.database.client.sale.findMany({
      where: { tenantId },
      include: { items: true, payments: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async refundPosSale(userId: string, dto: RefundShopPosSaleDto) {
    const { tenantId } = await this.authorization.assertPermission(userId, {
      resource: 'shop',
      action: 'update',
    });
    return this.database.client.$transaction(async (tx) => {
      await tx.$queryRaw`
          SELECT "id" FROM "sales"
          WHERE "id" = ${dto.saleId}::uuid AND "tenantId" = ${tenantId}::uuid
          FOR UPDATE
        `;
      const sale = await tx.sale.findFirst({
        where: { id: dto.saleId, tenantId },
        include: { items: true },
      });
      if (!sale) {
        throw new NotFoundException('Sale not found.');
      }
      if (sale.status !== SaleStatus.COMPLETED) {
        throw new BadRequestException('Only completed, not-yet-refunded sales can be refunded.');
      }

      const returnStock = dto.returnStock ?? false;
      if (returnStock) {
        const today = this.startOfToday();
        for (const item of sale.items) {
          if (item.expiryDate < today) {
            throw new BadRequestException(
              `Cannot return expired batch ${item.batchNumber} to saleable stock.`,
            );
          }
          await tx.productBatch.update({
            where: { id: item.batchId },
            data: { quantity: { increment: item.quantity } },
          });
          await tx.product.update({
            where: { id: item.productId },
            data: { stockQuantity: { increment: item.quantity } },
          });
          await tx.stockMovement.create({
            data: {
              tenantId,
              userId,
              productId: item.productId,
              batchId: item.batchId,
              saleId: sale.id,
              type: StockMovementType.REFUND,
              quantity: item.quantity,
              reason: `Refund ${sale.saleNumber}: ${dto.reason.trim()}`,
            },
          });
        }
      }

      const refund = await tx.saleRefund.create({
        data: {
          tenantId,
          saleId: sale.id,
          cashierUserId: userId,
          amount: sale.total,
          reason: dto.reason.trim(),
          stockReturned: returnStock,
        },
      });
      await tx.sale.update({
        where: { id: sale.id },
        data: { status: SaleStatus.REFUNDED, paymentStatus: SalePaymentStatus.REFUNDED },
      });
      await tx.salePayment.updateMany({
        where: { saleId: sale.id },
        data: { status: SalePaymentStatus.REFUNDED },
      });
      await tx.auditEvent.create({
        data: {
          tenantId,
          actorUserId: userId,
          action: 'SHOP_POS_SALE_REFUNDED',
          resourceType: 'SALE',
          resourceId: sale.id,
          outcome: 'SUCCESS',
          reason: dto.reason.trim(),
          metadata: { amount: sale.total.toString(), stockReturned: returnStock },
        },
      });
      return refund;
    });
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
          // 1. Allocate and decrement batches using FEFO
          await this.batchService.allocateAndDecrementBatches(
            tx,
            context.tenantId,
            item.productId,
            item.quantity,
          );

          // 2. Decrement product totals and reserved stock
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

  private startOfToday(): Date {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    return today;
  }

  private assertUniqueSaleBatches(items: CreateShopPosSaleDto['items']): void {
    const batchKeys = items.map((item) => `${item.productId}:${item.batchId}`);
    if (new Set(batchKeys).size !== batchKeys.length) {
      throw new BadRequestException(
        'Combine quantities for the same product and batch into one sale line.',
      );
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
