import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import type { CreateServiceDto, UpdateServiceDto } from './types.js';

@Injectable()
export class ServicesService {
  constructor(private readonly database: DatabaseService) {}

  private async getTenantIdForUser(userId: string): Promise<string> {
    const now = new Date();

    const membership = await this.database.client.membership.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        startsAt: {
          lte: now,
        },
        OR: [
          {
            endsAt: null,
          },
          {
            endsAt: {
              gt: now,
            },
          },
        ],
        tenant: {
          status: 'ACTIVE',
          deletedAt: null,
        },
      },
      select: {
        tenantId: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    if (!membership) {
      throw new NotFoundException('Active tenant membership not found');
    }

    return membership.tenantId;
  }

  async list(userId: string, departmentId?: string, branchId?: string | null) {
    const tenantId = await this.getTenantIdForUser(userId);

    return this.database.client.service.findMany({
      where: {
        tenantId,
        ...(departmentId ? { departmentId } : {}),
        ...(branchId ? { branchId } : {}),
        deletedAt: null,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        tenantId: true,
        departmentId: true,
        branchId: true,
        name: true,
        code: true,
        price: true,
        description: true,
        category: true,
        durationMin: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        department: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        branch: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
      orderBy: [
        {
          name: 'asc',
        },
        {
          createdAt: 'asc',
        },
      ],
    });
  }

  async create(userId: string, input: CreateServiceDto) {
    const tenantId = await this.getTenantIdForUser(userId);

    const name = input.name.trim();
    const code = await this.generateServiceCode(tenantId, name);

    await this.validateReferences(tenantId, input.departmentId, input.branchId);

    return this.database.client.service.create({
      data: {
        tenantId,
        name,
        code,
        price: input.price,
        description: input.description?.trim() || null,
        category: input.category?.trim() || null,
        durationMin: input.durationMin ?? null,
        departmentId: input.departmentId ?? null,
        branchId: input.branchId ?? null,
      },
      select: {
        id: true,
        tenantId: true,
        departmentId: true,
        branchId: true,
        name: true,
        code: true,
        price: true,
        description: true,
        category: true,
        durationMin: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        department: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        branch: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });
  }

  async update(userId: string, serviceId: string, input: UpdateServiceDto) {
    const tenantId = await this.getTenantIdForUser(userId);

    const existing = await this.database.client.service.findFirst({
      where: {
        id: serviceId,
        tenantId,
        deletedAt: null,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        departmentId: true,
        branchId: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Service not found');
    }

    const departmentId =
      input.departmentId !== undefined ? input.departmentId : existing.departmentId;

    const branchId = input.branchId !== undefined ? input.branchId : existing.branchId;

    await this.validateReferences(tenantId, departmentId, branchId);

    const data: {
      name?: string;
      price?: number;
      description?: string | null;
      category?: string | null;
      durationMin?: number | null;
      departmentId?: string | null;
      branchId?: string | null;
    } = {};

    if (input.name !== undefined) {
      data.name = input.name.trim();
    }

    if (input.price !== undefined) data.price = input.price;

    if (input.description !== undefined) {
      data.description = input.description.trim() || null;
    }

    if (input.category !== undefined) {
      data.category = input.category.trim() || null;
    }

    if (input.durationMin !== undefined) {
      data.durationMin = input.durationMin;
    }

    if (input.departmentId !== undefined) {
      data.departmentId = input.departmentId;
    }

    if (input.branchId !== undefined) {
      data.branchId = input.branchId;
    }

    if (Object.keys(data).length === 0) {
      return this.getById(userId, serviceId);
    }

    return this.database.client.service.update({
      where: {
        id: serviceId,
      },
      data,
      select: {
        id: true,
        tenantId: true,
        departmentId: true,
        branchId: true,
        name: true,
        code: true,
        price: true,
        description: true,
        category: true,
        durationMin: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        department: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        branch: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });
  }

  async getById(userId: string, serviceId: string) {
    const tenantId = await this.getTenantIdForUser(userId);

    const service = await this.database.client.service.findFirst({
      where: {
        id: serviceId,
        tenantId,
        deletedAt: null,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        tenantId: true,
        departmentId: true,
        branchId: true,
        name: true,
        code: true,
        price: true,
        description: true,
        category: true,
        durationMin: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        department: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        branch: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });

    if (!service) {
      throw new NotFoundException('Service not found');
    }

    return service;
  }

  async remove(userId: string, serviceId: string) {
    const tenantId = await this.getTenantIdForUser(userId);

    const service = await this.database.client.service.findFirst({
      where: {
        id: serviceId,
        tenantId,
        deletedAt: null,
        status: 'ACTIVE',
      },
      select: {
        id: true,
      },
    });

    if (!service) {
      throw new NotFoundException('Service not found');
    }

    await this.database.client.service.update({
      where: {
        id: serviceId,
      },
      data: {
        status: 'INACTIVE',
        deletedAt: new Date(),
      },
    });

    return {
      id: serviceId,
      deleted: true,
    };
  }

  private async generateServiceCode(tenantId: string, name: string): Promise<string> {
    const base = name
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50) || 'SERVICE';

    for (let attempt = 0; attempt < 10000; attempt += 1) {
      const suffix = attempt === 0 ? '' : `-${attempt + 1}`;
      const candidate = `${base.slice(0, 50 - suffix.length)}${suffix}`;
      const existing = await this.database.client.service.findFirst({
        where: { tenantId, code: candidate },
        select: { id: true },
      });
      if (!existing) return candidate;
    }
    throw new ConflictException('Unable to generate a unique service code');
  }

  private async validateReferences(
    tenantId: string,
    departmentId?: string | null,
    branchId?: string | null,
  ): Promise<void> {
    let departmentBranchId: string | null | undefined;

    if (departmentId) {
      const department = await this.database.client.department.findFirst({
        where: {
          id: departmentId,
          tenantId,
          status: 'ACTIVE',
          deletedAt: null,
        },
        select: {
          id: true,
          branchId: true,
        },
      });

      if (!department) {
        throw new NotFoundException('Department not found in this tenant');
      }

      departmentBranchId = department.branchId;
    }

    if (branchId) {
      const branch = await this.database.client.branch.findFirst({
        where: {
          id: branchId,
          tenantId,
          status: 'ACTIVE',
          deletedAt: null,
        },
        select: {
          id: true,
        },
      });

      if (!branch) {
        throw new NotFoundException('Branch not found in this tenant');
      }
    }

    if (departmentBranchId && branchId && departmentBranchId !== branchId) {
      throw new BadRequestException('Service branch must match the department branch');
    }
  }
}
