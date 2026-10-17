import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';

export interface DispenseItemInput {
  productId: string;
  quantityRequested: number;
}

export interface BatchAllocationResult {
  batchId: string;
  batchNumber: string;
  quantityToTake: number;
  expiryDate: Date;
}

@Injectable()
export class BatchService {
  constructor(
    private readonly database: DatabaseService,
    private readonly authorization: AuthorizationService,
  ) {}

  /**
   * Allocates stock from active product batches using FEFO (First-Expired, First-Out) logic.
   */
  async allocateStockFEFO(
    userId: string,
    input: DispenseItemInput,
  ): Promise<BatchAllocationResult[]> {
    const { tenantId } = await this.authorization.getContext(userId);
    const { productId, quantityRequested } = input;

    const activeBatches = await this.database.client.productBatch.findMany({
      where: {
        productId,
        tenantId,
        quantity: { gt: 0 },
        expiryDate: { gte: new Date() },
      },
      orderBy: {
        expiryDate: 'asc',
      },
    });

    let remainingNeeded = quantityRequested;
    const allocations: BatchAllocationResult[] = [];

    for (const batch of activeBatches) {
      if (remainingNeeded <= 0) break;

      const takeFromBatch = Math.min(batch.quantity, remainingNeeded);

      allocations.push({
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        quantityToTake: takeFromBatch,
        expiryDate: batch.expiryDate,
      });

      remainingNeeded -= takeFromBatch;
    }

    if (remainingNeeded > 0) {
      throw new BadRequestException(
        `Insufficient unexpired batch stock for product ${productId}. Short by ${remainingNeeded} units.`,
      );
    }

    return allocations;
  }

  /**
   * Allocates and decrements batches transactionally using FEFO.
   */
  async allocateAndDecrementBatches(
    tx: any,
    tenantId: string,
    productId: string,
    quantityRequested: number,
  ): Promise<BatchAllocationResult[]> {
    const activeBatches = await tx.productBatch.findMany({
      where: {
        productId,
        tenantId,
        quantity: { gt: 0 },
        expiryDate: { gte: new Date() },
      },
      orderBy: {
        expiryDate: 'asc',
      },
    });

    let remaining = quantityRequested;
    const allocations: BatchAllocationResult[] = [];
    for (const batch of activeBatches) {
      if (remaining <= 0) break;
      const take = Math.min(batch.quantity, remaining);
      const changed = await tx.productBatch.updateMany({
        where: { id: batch.id, tenantId, productId, quantity: { gte: take } },
        data: { quantity: { decrement: take } },
      });
      if (changed.count !== 1) {
        throw new BadRequestException(
          'Batch stock changed during order fulfilment. Retry the operation.',
        );
      }
      allocations.push({
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        quantityToTake: take,
        expiryDate: batch.expiryDate,
      });
      remaining -= take;
    }

    if (remaining > 0) {
      throw new BadRequestException(
        `Insufficient unexpired batch stock for product ${productId}. Short by ${remaining} units.`,
      );
    }
    return allocations;
  }

  /**
   * Lists all batches for a product.
   */
  async listProductBatches(userId: string, productId: string) {
    const { tenantId } = await this.authorization.getContext(userId);
    return this.database.client.productBatch.findMany({
      where: { tenantId, productId },
      orderBy: { expiryDate: 'asc' },
    });
  }
}
