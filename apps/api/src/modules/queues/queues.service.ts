import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EncounterStatus,
  Prisma,
  QueueEntryPriority,
  QueueCallStatus,
  QueueEntryStatus,
  QueueStatus,
} from '@prisma/client';
import { randomInt, randomUUID } from 'node:crypto';

import { DatabaseService } from '../../database/database.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { CreateQueueDto } from './dto/create-queue.dto.js';
import { CreateQueueCareRecordDto } from './dto/create-queue-care-record.dto.js';
import { CreateQueueEntryDto } from './dto/create-queue-entry.dto.js';
import { QueueEntryQueryDto, QueueQueryDto } from './dto/queue-query.dto.js';
import { PrivateObjectStorageService } from '../storage/private-object-storage.service.js';

@Injectable()
export class QueuesService {
  private readonly queueTxOptions = {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 10000,
    timeout: 30000,
  } as const;

  constructor(
    private readonly database: DatabaseService,
    private readonly authorization: AuthorizationService,
    private readonly storage: PrivateObjectStorageService,
  ) {}

  private async generateQueueNumber(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    queueId: string,
  ): Promise<string> {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const letters = new Set<string>();
      while (letters.size < 5) {
        letters.add(alphabet[randomInt(alphabet.length)]!);
      }

      const queueNumber = [...letters].join('');
      const existing = await transaction.queueEntry.findFirst({
        where: { tenantId, queueId, queueNumber },
        select: { id: true },
      });

      if (!existing) {
        return queueNumber;
      }
    }

    throw new ConflictException(
      'Unable to allocate a unique five-letter queue number. Please retry.',
    );
  }

  private queueSelect() {
    return {
      id: true,
      tenantId: true,
      name: true,
      code: true,
      description: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      branch: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      department: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    } satisfies Prisma.QueueSelect;
  }

  private entrySelect() {
    return {
      id: true,
      tenantId: true,
      queueId: true,
      encounterId: true,
      patientTenantRecordId: true,
      queueNumber: true,
      priority: true,
      status: true,
      position: true,
      reason: true,
      checkedInAt: true,
      calledAt: true,
      startedAt: true,
      completedAt: true,
      skippedAt: true,
      cancelledAt: true,
      noShowAt: true,
      createdByUserId: true,
      createdAt: true,
      updatedAt: true,
      queue: {
        select: {
          id: true,
          name: true,
          code: true,
          department: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      },
      encounter: {
        select: {
          id: true,
          encounterNumber: true,
          status: true,
          reason: true,
        },
      },
      patientTenantRecord: {
        select: {
          id: true,
          patientNumber: true,
          status: true,
          patientProfile: {
            select: {
              id: true,
              firstName: true,
              secondName: true,
            },
          },
        },
      },
      journeySteps: {
        orderBy: {
          sequence: 'asc',
        },
        take: 1,
        select: {
          id: true,
          journeyId: true,
          sequence: true,
          status: true,
          handoffsFrom: {
            where: {
              status: {
                in: ['PENDING', 'ACCEPTED', 'COMPLETED'],
              },
            },
            orderBy: {
              createdAt: 'desc',
            },
            take: 1,
            select: {
              id: true,
              status: true,
              reason: true,
              instruction: true,
              toDepartmentId: true,
              toStepId: true,
              toDepartment: {
                select: {
                  id: true,
                  name: true,
                  code: true,
                },
              },
              fromDepartment: {
                select: {
                  id: true,
                  name: true,
                  code: true,
                },
              },
            },
          },
        },
      },
      _count: {
        select: {
          careRecords: true,
        },
      },
    } satisfies Prisma.QueueEntrySelect;
  }

  private async ensureDepartmentQueue(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    departmentId: string,
    branchId: string | null,
  ) {
    const department = await transaction.department.findFirst({
      where: {
        id: departmentId,
        tenantId,
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        code: true,
        branchId: true,
      },
    });

    if (!department) {
      throw new NotFoundException('Active department not found');
    }

    const existing = await transaction.queue.findFirst({
      where: {
        tenantId,
        departmentId: department.id,
        status: QueueStatus.ACTIVE,
      },
      orderBy: {
        createdAt: 'asc',
      },
      select: {
        id: true,
        tenantId: true,
        code: true,
      },
    });

    if (existing) {
      return existing;
    }

    const queueBranchId = department.branchId ?? branchId;
    const code = `D-${department.id}`;

    return transaction.queue.upsert({
      where: {
        tenantId_code: {
          tenantId,
          code,
        },
      },
      update: {
        status: QueueStatus.ACTIVE,
      },
      create: {
        tenantId,
        branchId: queueBranchId,
        departmentId: department.id,
        name: `${department.name} Queue`,
        code,
        description: `Automatically managed queue for ${department.name}.`,
        status: QueueStatus.ACTIVE,
      },
      select: {
        id: true,
        tenantId: true,
        code: true,
      },
    });
  }

  private async ensureJourneyForQueueEntry(
    transaction: Prisma.TransactionClient,
    userId: string,
    tenantId: string,
    queueEntryId: string,
  ) {
    const entry = await transaction.queueEntry.findFirst({
      where: {
        id: queueEntryId,
        tenantId,
      },
      select: {
        id: true,
        status: true,
        reason: true,
        checkedInAt: true,
        startedAt: true,
        completedAt: true,
        encounterId: true,
        patientTenantRecordId: true,
        queueId: true,
        queue: {
          select: {
            name: true,
            code: true,
            branchId: true,
            departmentId: true,
            department: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        encounter: {
          select: {
            reason: true,
            branchId: true,
            departmentId: true,
          },
        },
      },
    });

    if (!entry) {
      throw new NotFoundException('Queue entry not found');
    }

    const journey = await transaction.patientJourney.findFirst({
      where: {
        tenantId,
        encounterId: entry.encounterId,
        status: 'ACTIVE',
      },
      select: {
        id: true,
      },
    });

    const journeyId =
      journey?.id ??
      (
        await transaction.patientJourney.create({
          data: {
            tenantId,
            patientTenantRecordId: entry.patientTenantRecordId,
            encounterId: entry.encounterId,
            status: 'ACTIVE',
          },
          select: {
            id: true,
          },
        })
      ).id;

    let step = await transaction.patientJourneyStep.findFirst({
      where: {
        tenantId,
        journeyId,
        queueEntryId: entry.id,
      },
      select: {
        id: true,
        status: true,
        name: true,
        description: true,
        queueId: true,
        departmentId: true,
        branchId: true,
        instruction: true,
        readyAt: true,
        startedAt: true,
      },
    });

    const status =
      entry.status === QueueEntryStatus.CALLED
        ? 'CALLED'
        : entry.status === QueueEntryStatus.IN_SERVICE
          ? 'IN_PROGRESS'
          : 'WAITING';
    const departmentId = entry.queue.departmentId ?? entry.encounter.departmentId;
    const branchId = entry.queue.branchId ?? entry.encounter.branchId;

    if (!step) {
      step = await transaction.patientJourneyStep.findFirst({
        where: {
          tenantId,
          journeyId,
          queueEntryId: null,
          type: 'SERVICE',
          departmentId,
          status: {
            notIn: ['COMPLETED', 'SKIPPED', 'CANCELLED'],
          },
        },
        orderBy: {
          sequence: 'asc',
        },
        select: {
          id: true,
          status: true,
          name: true,
          description: true,
          queueId: true,
          departmentId: true,
          branchId: true,
          instruction: true,
          readyAt: true,
          startedAt: true,
        },
      });
    }

    if (step) {
      const name = entry.queue.department?.name ?? entry.queue.code ?? entry.queue.name;
      const description =
        entry.reason ?? entry.encounter.reason ?? 'You are checked in and waiting to be called.';
      const instruction =
        'Remain nearby and watch for your queue call. When called, proceed to the service point.';
      const readyAt = entry.checkedInAt ?? step.readyAt;
      const changed =
        step.status !== status ||
        step.name !== name ||
        step.description !== description ||
        step.queueId !== entry.queueId ||
        step.departmentId !== departmentId ||
        step.branchId !== branchId ||
        step.instruction !== instruction ||
        step.readyAt?.getTime() !== readyAt?.getTime() ||
        step.startedAt?.getTime() !== entry.startedAt?.getTime();

      if (changed) {
        await transaction.patientJourneyStep.update({
          where: {
            id: step.id,
          },
          data: {
            status,
            name,
            description,
            queueId: entry.queueId,
            departmentId,
            branchId,
            encounterId: entry.encounterId,
            readyAt,
            startedAt: entry.startedAt,
            instruction,
          },
        });
      }
      return;
    }

    const maxSequence = await transaction.patientJourneyStep.aggregate({
      where: {
        journeyId,
      },
      _max: {
        sequence: true,
      },
    });

    const createdStep = await transaction.patientJourneyStep.create({
      data: {
        tenantId,
        journeyId,
        sequence: (maxSequence._max.sequence ?? 0) + 1,
        type: 'SERVICE',
        status,
        name: entry.queue.department?.name ?? entry.queue.code ?? entry.queue.name,
        description:
          entry.reason ?? entry.encounter.reason ?? 'You are checked in and waiting to be called.',
        branchId,
        departmentId,
        encounterId: entry.encounterId,
        queueId: entry.queueId,
        queueEntryId: entry.id,
        instruction:
          'Remain nearby and watch for your queue call. When called, proceed to the service point.',
        readyAt: entry.checkedInAt ?? new Date(),
        startedAt: entry.startedAt,
      },
      select: {
        id: true,
      },
    });

    await transaction.auditEvent.create({
      data: {
        tenantId,
        actorUserId: userId,
        action: 'PATIENT_JOURNEY_QUEUE_STEP_RECONCILED',
        resourceType: 'PATIENT_JOURNEY_STEP',
        resourceId: createdStep.id,
        outcome: 'SUCCESS',
        reason: 'Patient journey step linked to active queue entry',
        metadata: {
          journeyId,
          encounterId: entry.encounterId,
          queueEntryId: entry.id,
          queueId: entry.queueId,
          departmentId,
        },
      },
    });
  }

  async reconcilePatientJourneyEntries(userId: string) {
    const patient = await this.database.client.patientProfile.findUnique({
      where: {
        userId,
      },
      select: {
        tenantRecords: {
          where: {
            status: 'ACTIVE',
            deletedAt: null,
          },
          select: {
            id: true,
            tenantId: true,
          },
        },
      },
    });

    if (!patient || patient.tenantRecords.length === 0) {
      return;
    }

    const entries = await this.database.client.queueEntry.findMany({
      where: {
        patientTenantRecordId: {
          in: patient.tenantRecords.map((record) => record.id),
        },
        status: {
          in: [
            QueueEntryStatus.CREATED,
            QueueEntryStatus.WAITING,
            QueueEntryStatus.CALLED,
            QueueEntryStatus.IN_SERVICE,
          ],
        },
        journeySteps: {
          none: {},
        },
      },
      select: {
        id: true,
        tenantId: true,
      },
    });

    for (const entry of entries) {
      let repaired = false;

      for (let attempt = 0; attempt < 2 && !repaired; attempt += 1) {
        try {
          await this.database.client.$transaction(
            (transaction) =>
              this.ensureJourneyForQueueEntry(transaction, userId, entry.tenantId, entry.id),
            this.queueTxOptions,
          );
          repaired = true;
        } catch (error) {
          const isConcurrentWrite =
            error instanceof Prisma.PrismaClientKnownRequestError &&
            (error.code === 'P2034' || error.code === 'P2002');

          if (!isConcurrentWrite || attempt === 1) {
            throw error;
          }
        }
      }
    }
  }

  async listMyQueue(userId: string) {
    const patient = await this.database.client.patientProfile.findUnique({
      where: {
        userId,
      },
      select: {
        id: true,
        tenantRecords: {
          where: {
            status: 'ACTIVE',
            deletedAt: null,
          },
          select: {
            id: true,
            tenantId: true,
          },
        },
      },
    });

    if (!patient) {
      throw new NotFoundException('Authenticated user is not a Revaltrix patient');
    }

    const patientTenantRecordIds = patient.tenantRecords.map((record) => record.id);

    if (patientTenantRecordIds.length === 0) {
      return { data: [] };
    }

    const entries = await this.database.client.queueEntry.findMany({
      where: {
        patientTenantRecordId: {
          in: patientTenantRecordIds,
        },
        status: {
          in: [QueueEntryStatus.WAITING, QueueEntryStatus.CALLED, QueueEntryStatus.IN_SERVICE],
        },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        tenantId: true,
        queueId: true,
        queueNumber: true,
        priority: true,
        status: true,
        position: true,
        checkedInAt: true,
        calledAt: true,
        startedAt: true,
        queue: {
          select: {
            id: true,
            name: true,
            code: true,
            branch: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
            department: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
        encounter: {
          select: {
            id: true,
            encounterNumber: true,
            status: true,
          },
        },
        calls: {
          orderBy: {
            callNumber: 'desc',
          },
          take: 1,
          select: {
            id: true,
            callNumber: true,
            status: true,
            calledAt: true,
            acknowledgedAt: true,
            expiresAt: true,
          },
        },
      },
    });

    const queueIds = [...new Set(entries.map((entry) => entry.queueId))];
    const waitingEntries = queueIds.length
      ? await this.database.client.queueEntry.findMany({
          where: {
            tenantId: {
              in: patient.tenantRecords.map((record) => record.tenantId),
            },
            queueId: { in: queueIds },
            status: {
              in: [QueueEntryStatus.CREATED, QueueEntryStatus.WAITING],
            },
          },
          orderBy: [
            { queueId: 'asc' },
            { position: 'asc' },
            { createdAt: 'asc' },
            { id: 'asc' },
          ],
          select: { id: true, queueId: true },
        })
      : [];
    const livePositions = new Map<string, number>();
    const positionsByQueue = new Map<string, number>();
    for (const entry of waitingEntries) {
      const position = (positionsByQueue.get(entry.queueId) ?? 0) + 1;
      positionsByQueue.set(entry.queueId, position);
      livePositions.set(entry.id, position);
    }

    return {
      data: entries.map((entry) => {
        const latestCall = entry.calls[0] ?? null;

        return {
          id: entry.id,
          queueNumber: entry.queueNumber,
          priority: entry.priority,
          status: entry.status,
          position:
            entry.status === QueueEntryStatus.CREATED ||
            entry.status === QueueEntryStatus.WAITING
              ? (livePositions.get(entry.id) ?? null)
              : null,
          checkedInAt: entry.checkedInAt,
          calledAt: entry.calledAt,
          startedAt: entry.startedAt,
          queue: entry.queue,
          encounter: entry.encounter,
          latestCall,
          requiresAcknowledgement:
            entry.status === QueueEntryStatus.CALLED &&
            latestCall?.status === QueueCallStatus.CALLED,
        };
      }),
    };
  }

  async acknowledgeMyQueueCall(userId: string, entryId: string) {
    const patient = await this.database.client.patientProfile.findUnique({
      where: {
        userId,
      },
      select: {
        id: true,
        tenantRecords: {
          where: {
            status: 'ACTIVE',
            deletedAt: null,
          },
          select: {
            id: true,
            tenantId: true,
          },
        },
      },
    });

    if (!patient) {
      throw new NotFoundException('Authenticated user is not a Revaltrix patient');
    }

    const patientTenantRecordIds = patient.tenantRecords.map((record) => record.id);

    if (patientTenantRecordIds.length === 0) {
      throw new NotFoundException('Queue entry not found');
    }

    const entry = await this.database.client.queueEntry.findFirst({
      where: {
        id: entryId,
        patientTenantRecordId: {
          in: patientTenantRecordIds,
        },
        status: QueueEntryStatus.CALLED,
      },
      select: {
        id: true,
        tenantId: true,
        queueNumber: true,
        calls: {
          orderBy: {
            callNumber: 'desc',
          },
          take: 1,
          select: {
            id: true,
            callNumber: true,
            status: true,
          },
        },
      },
    });

    if (!entry) {
      throw new NotFoundException('Active queue call not found');
    }

    const latestCall = entry.calls[0];

    if (!latestCall || latestCall.status !== QueueCallStatus.CALLED) {
      throw new BadRequestException('There is no active queue call awaiting acknowledgement');
    }

    const acknowledgedAt = new Date();

    const call = await this.database.client.$transaction(async (tx) => {
      const updated = await tx.queueCall.updateMany({
        where: {
          id: latestCall.id,
          status: QueueCallStatus.CALLED,
        },
        data: {
          status: QueueCallStatus.ACKNOWLEDGED,
          acknowledgedAt,
        },
      });

      if (updated.count !== 1) {
        throw new ConflictException('Queue call was already acknowledged or is no longer active');
      }

      await tx.auditEvent.create({
        data: {
          tenantId: entry.tenantId,
          actorUserId: userId,
          action: 'QUEUE_PATIENT_CALL_ACKNOWLEDGED',
          resourceType: 'QUEUE_CALL',
          resourceId: latestCall.id,
          outcome: 'SUCCESS',
          reason: 'Patient acknowledged queue call',
          metadata: {
            queueEntryId: entry.id,
            queueNumber: entry.queueNumber,
            callNumber: latestCall.callNumber,
          },
        },
      });

      return tx.queueCall.findUniqueOrThrow({
        where: {
          id: latestCall.id,
        },
        select: {
          id: true,
          callNumber: true,
          status: true,
          calledAt: true,
          acknowledgedAt: true,
          expiresAt: true,
        },
      });
    });

    return {
      data: call,
    };
  }

  /**
   * Reconciles today's checked-in encounters that do not yet have
   * an active queue entry.
   *
   * This is intentionally idempotent: running it repeatedly will not
   * create duplicate queue entries.
   */
  async reconcileTodayCheckedInEncounters(userId: string) {
    const context = await this.authorization.getContext(userId);

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const encounters = await this.database.client.encounter.findMany({
      where: {
        tenantId: context.tenantId,
        status: EncounterStatus.CHECKED_IN,
        createdAt: {
          gte: startOfDay,
          lt: endOfDay,
        },
      },
      select: {
        id: true,
        patientTenantRecordId: true,
        branchId: true,
        departmentId: true,
        type: true,
        reason: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    let queued = 0;
    let alreadyQueued = 0;

    for (const encounter of encounters) {
      const existing = await this.database.client.queueEntry.findFirst({
        where: {
          tenantId: context.tenantId,
          encounterId: encounter.id,
          status: {
            in: [
              QueueEntryStatus.CREATED,
              QueueEntryStatus.WAITING,
              QueueEntryStatus.CALLED,
              QueueEntryStatus.IN_SERVICE,
            ],
          },
        },
        select: {
          id: true,
          journeySteps: {
            take: 1,
            select: {
              id: true,
            },
          },
        },
      });

      if (existing) {
        if (existing.journeySteps.length === 0) {
          await this.database.client.$transaction(
            (transaction) =>
              this.ensureJourneyForQueueEntry(transaction, userId, context.tenantId, existing.id),
            this.queueTxOptions,
          );
        }
        alreadyQueued += 1;
        continue;
      }

      await this.database.client.$transaction(
        async (transaction) => {
          const created = await this.autoQueueCheckedInEncounter(transaction, {
            userId,
            tenantId: context.tenantId,
            encounterId: encounter.id,
            patientTenantRecordId: encounter.patientTenantRecordId,
            branchId: encounter.branchId,
            departmentId: encounter.departmentId,
            encounterType: encounter.type,
            reason: encounter.reason ?? 'Automatically reconciled after patient check-in',
          });

          if (created) {
            queued += 1;
          }
        },
        this.queueTxOptions,
      );
    }

    return {
      data: {
        checkedInToday: encounters.length,
        queued,
        alreadyQueued,
      },
    };
  }

  async listQueues(userId: string, query: QueueQueryDto) {
    const context = await this.authorization.getContext(userId);

    const queues = await this.database.client.$transaction(
      async (tx) => {
        const departments = await tx.department.findMany({
          where: {
            tenantId: context.tenantId,
            status: 'ACTIVE',
            deletedAt: null,
          },
          select: {
            id: true,
            branchId: true,
          },
        });

        for (const department of departments) {
          await this.ensureDepartmentQueue(tx, context.tenantId, department.id, department.branchId);
        }

        return tx.queue.findMany({
          where: {
            tenantId: context.tenantId,
            ...(query.status ? { status: query.status } : {}),
            ...(query.branchId ? { branchId: query.branchId } : {}),
            ...(query.departmentId ? { departmentId: query.departmentId } : {}),
          },
          orderBy: {
            name: 'asc',
          },
          select: this.queueSelect(),
        });
      },
      this.queueTxOptions,
    );

    return { data: queues };
  }

  async createQueue(userId: string, dto: CreateQueueDto) {
    const context = await this.authorization.getContext(userId);

    const name = dto.name.trim();
    const code = dto.code.trim().toUpperCase();

    if (!name || !code) {
      throw new BadRequestException('Queue name and code are required');
    }

    if (dto.branchId) {
      const branch = await this.database.client.branch.findFirst({
        where: {
          id: dto.branchId,
          tenantId: context.tenantId,
          status: 'ACTIVE',
          deletedAt: null,
        },
        select: { id: true },
      });

      if (!branch) {
        throw new BadRequestException('Branch does not belong to the active tenant');
      }
    }

    if (dto.departmentId) {
      const department = await this.database.client.department.findFirst({
        where: {
          id: dto.departmentId,
          tenantId: context.tenantId,
          status: 'ACTIVE',
          deletedAt: null,
        },
        select: {
          id: true,
          branchId: true,
        },
      });

      if (!department) {
        throw new BadRequestException('Department does not belong to the active tenant');
      }

      if (department.branchId && dto.branchId && department.branchId !== dto.branchId) {
        throw new BadRequestException('Department does not belong to the selected branch');
      }
    }

    try {
      const queue = await this.database.client.queue.create({
        data: {
          tenantId: context.tenantId,
          branchId: dto.branchId ?? null,
          departmentId: dto.departmentId ?? null,
          name,
          code,
          description: dto.description?.trim() || null,
          status: QueueStatus.ACTIVE,
        },
        select: this.queueSelect(),
      });

      await this.database.client.auditEvent.create({
        data: {
          tenantId: context.tenantId,
          actorUserId: userId,
          branchId: context.branchId ?? null,
          action: 'QUEUE_CREATED',
          resourceType: 'QUEUE',
          resourceId: queue.id,
          outcome: 'SUCCESS',
          metadata: {
            queueId: queue.id,
            code: queue.code,
          },
        },
      });

      return queue;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A queue with this code already exists');
      }

      throw error;
    }
  }

  async getQueue(userId: string, queueId: string) {
    const context = await this.authorization.getContext(userId);

    const queue = await this.database.client.queue.findFirst({
      where: {
        id: queueId,
        tenantId: context.tenantId,
      },
      select: this.queueSelect(),
    });

    if (!queue) {
      throw new NotFoundException('Queue not found');
    }

    return queue;
  }

  async listEntries(userId: string, queueId: string, query: QueueEntryQueryDto) {
    const context = await this.authorization.getContext(userId);

    const queue = await this.database.client.queue.findFirst({
      where: {
        id: queueId,
        tenantId: context.tenantId,
      },
      select: { id: true },
    });

    if (!queue) {
      throw new NotFoundException('Queue not found');
    }

    const entries = await this.database.client.queueEntry.findMany({
      where: {
        tenantId: context.tenantId,
        queueId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.priority ? { priority: query.priority } : {}),
      },
      orderBy: [{ status: 'asc' }, { position: 'asc' }, { createdAt: 'asc' }],
      select: this.entrySelect(),
    });

    const waitingEntries = await this.database.client.queueEntry.findMany({
      where: {
        tenantId: context.tenantId,
        queueId,
        status: {
          in: [QueueEntryStatus.CREATED, QueueEntryStatus.WAITING],
        },
      },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
      },
    });
    const waitingPositions = new Map<string, number>();
    waitingEntries.forEach((entry, index) => {
      waitingPositions.set(entry.id, index + 1);
    });
    const positionedEntries = entries.map((entry) => ({
      ...entry,
      position:
        entry.status === QueueEntryStatus.WAITING || entry.status === QueueEntryStatus.CREATED
          ? (waitingPositions.get(entry.id) ?? null)
          : null,
    }));

    return { data: positionedEntries };
  }

  /**
   * Automatically places a checked-in encounter into the
   * most appropriate active operational queue.
   *
   * This method deliberately accepts the caller's transaction client
   * so encounter CHECKED_IN and queue WAITING are committed atomically.
   */
  async autoQueueCheckedInEncounter(
    transaction: Prisma.TransactionClient,
    params: {
      userId: string;
      tenantId: string;
      encounterId: string;
      patientTenantRecordId: string;
      branchId: string | null;
      departmentId: string | null;
      encounterType: string;
      reason?: string | null;
    },
  ) {
    const activeStatuses = {
      in: [
        QueueEntryStatus.CREATED,
        QueueEntryStatus.WAITING,
        QueueEntryStatus.CALLED,
        QueueEntryStatus.IN_SERVICE,
      ],
    };

    const existing = await transaction.queueEntry.findFirst({
      where: {
        tenantId: params.tenantId,
        encounterId: params.encounterId,
        status: activeStatuses,
      },
      select: {
        id: true,
        queueId: true,
        queueNumber: true,
        status: true,
      },
    });

    if (existing) {
      await this.ensureJourneyForQueueEntry(
        transaction,
        params.userId,
        params.tenantId,
        existing.id,
      );
      return existing;
    }

    let queue = null;

    if (params.departmentId && params.branchId) {
      queue = await transaction.queue.findFirst({
        where: {
          tenantId: params.tenantId,
          status: QueueStatus.ACTIVE,
          departmentId: params.departmentId,
          branchId: params.branchId,
        },
        orderBy: {
          createdAt: 'asc',
        },
        select: {
          id: true,
          tenantId: true,
          code: true,
        },
      });
    }

    if (!queue && params.departmentId) {
      queue = await transaction.queue.findFirst({
        where: {
          tenantId: params.tenantId,
          status: QueueStatus.ACTIVE,
          departmentId: params.departmentId,
        },
        orderBy: {
          createdAt: 'asc',
        },
        select: {
          id: true,
          tenantId: true,
          code: true,
        },
      });
    }

    if (!queue && params.departmentId) {
      queue = await this.ensureDepartmentQueue(
        transaction,
        params.tenantId,
        params.departmentId,
        params.branchId,
      );
    }

    if (!queue && params.branchId) {
      queue = await transaction.queue.findFirst({
        where: {
          tenantId: params.tenantId,
          status: QueueStatus.ACTIVE,
          branchId: params.branchId,
          departmentId: null,
        },
        orderBy: {
          createdAt: 'asc',
        },
        select: {
          id: true,
          tenantId: true,
          code: true,
        },
      });
    }

    if (!queue) {
      queue = await transaction.queue.findFirst({
        where: {
          tenantId: params.tenantId,
          status: QueueStatus.ACTIVE,
          branchId: null,
          departmentId: null,
        },
        orderBy: {
          createdAt: 'asc',
        },
        select: {
          id: true,
          tenantId: true,
          code: true,
        },
      });
    }

    if (!queue) {
      queue = await transaction.queue.upsert({
        where: {
          tenantId_code: {
            tenantId: params.tenantId,
            code: 'GENERAL',
          },
        },
        update: {
          status: QueueStatus.ACTIVE,
        },
        create: {
          tenantId: params.tenantId,
          branchId: null,
          departmentId: null,
          name: 'General Queue',
          code: 'GENERAL',
          description: 'Automatically managed general hospital patient queue.',
          status: QueueStatus.ACTIVE,
        },
        select: {
          id: true,
          tenantId: true,
          code: true,
        },
      });
    }

    const waitingCount = await transaction.queueEntry.count({
      where: {
        tenantId: params.tenantId,
        queueId: queue.id,
        status: {
          in: [QueueEntryStatus.CREATED, QueueEntryStatus.WAITING],
        },
      },
    });

    const position = waitingCount + 1;

    const priority =
      params.encounterType === 'EMERGENCY'
        ? QueueEntryPriority.EMERGENCY
        : QueueEntryPriority.ROUTINE;

    const entry = await transaction.queueEntry.create({
      data: {
        tenantId: params.tenantId,
        queueId: queue.id,
        encounterId: params.encounterId,
        patientTenantRecordId: params.patientTenantRecordId,
        queueNumber: await this.generateQueueNumber(
          transaction,
          params.tenantId,
          queue.id,
        ),
        priority,
        status: QueueEntryStatus.WAITING,
        position,
        reason: params.reason?.trim() || 'Automatically queued after patient check-in',
        checkedInAt: new Date(),
        createdByUserId: params.userId,
      },
      select: {
        id: true,
        tenantId: true,
        queueId: true,
        queueNumber: true,
        status: true,
        position: true,
      },
    });

    await transaction.queueEntryHistory.create({
      data: {
        tenantId: params.tenantId,
        queueEntryId: entry.id,
        fromStatus: null,
        toStatus: QueueEntryStatus.WAITING,
        fromPosition: null,
        toPosition: position,
        reason: params.reason?.trim() || 'Automatically queued after patient check-in',
        changedByUserId: params.userId,
      },
    });

    await this.ensureJourneyForQueueEntry(transaction, params.userId, params.tenantId, entry.id);

    await transaction.auditEvent.create({
      data: {
        tenantId: params.tenantId,
        actorUserId: params.userId,
        branchId: params.branchId,
        action: 'QUEUE_ENTRY_AUTO_CREATED',
        resourceType: 'QUEUE_ENTRY',
        resourceId: entry.id,
        outcome: 'SUCCESS',
        reason: 'Patient automatically queued after encounter check-in',
        metadata: {
          queueId: queue.id,
          queueCode: queue.code,
          encounterId: params.encounterId,
          encounterType: params.encounterType,
          patientTenantRecordId: params.patientTenantRecordId,
          queueNumber: entry.queueNumber,
          priority,
          position,
        },
      },
    });

    return entry;
  }

  async autoQueueJourneyDestination(
    transaction: Prisma.TransactionClient,
    params: {
      userId: string;
      tenantId: string;
      encounterId: string;
      patientTenantRecordId: string;
      branchId: string | null;
      departmentId: string | null;
      reason?: string | null;
    },
  ) {
    if (!params.departmentId) {
      throw new BadRequestException('A destination department is required for a journey handoff');
    }

    let queue = null;

    if (params.branchId) {
      queue = await transaction.queue.findFirst({
        where: {
          tenantId: params.tenantId,
          status: QueueStatus.ACTIVE,
          departmentId: params.departmentId,
          branchId: params.branchId,
        },
        orderBy: {
          createdAt: 'asc',
        },
        select: {
          id: true,
          tenantId: true,
          code: true,
        },
      });
    }

    if (!queue) {
      queue = await transaction.queue.findFirst({
        where: {
          tenantId: params.tenantId,
          status: QueueStatus.ACTIVE,
          departmentId: params.departmentId,
        },
        orderBy: {
          createdAt: 'asc',
        },
        select: {
          id: true,
          tenantId: true,
          code: true,
        },
      });
    }

    if (!queue) {
      queue = await this.ensureDepartmentQueue(
        transaction,
        params.tenantId,
        params.departmentId,
        params.branchId,
      );
    }

    const existing = await transaction.queueEntry.findFirst({
      where: {
        tenantId: params.tenantId,
        queueId: queue.id,
        encounterId: params.encounterId,
        status: {
          in: [
            QueueEntryStatus.CREATED,
            QueueEntryStatus.WAITING,
            QueueEntryStatus.CALLED,
            QueueEntryStatus.IN_SERVICE,
          ],
        },
      },
      select: {
        id: true,
        queueId: true,
        queueNumber: true,
        status: true,
        position: true,
      },
    });

    if (existing) {
      return existing;
    }

    const waitingCount = await transaction.queueEntry.count({
      where: {
        tenantId: params.tenantId,
        queueId: queue.id,
        status: {
          in: [QueueEntryStatus.CREATED, QueueEntryStatus.WAITING],
        },
      },
    });

    const position = waitingCount + 1;

    const entry = await transaction.queueEntry.create({
      data: {
        tenantId: params.tenantId,
        queueId: queue.id,
        encounterId: params.encounterId,
        patientTenantRecordId: params.patientTenantRecordId,
        queueNumber: await this.generateQueueNumber(
          transaction,
          params.tenantId,
          queue.id,
        ),
        priority: QueueEntryPriority.ROUTINE,
        status: QueueEntryStatus.WAITING,
        position,
        reason: params.reason?.trim() || 'Automatically queued after department handoff',
        checkedInAt: new Date(),
        createdByUserId: params.userId,
      },
      select: this.entrySelect(),
    });

    await transaction.queueEntryHistory.create({
      data: {
        tenantId: params.tenantId,
        queueEntryId: entry.id,
        fromStatus: null,
        toStatus: QueueEntryStatus.WAITING,
        fromPosition: null,
        toPosition: position,
        reason: params.reason?.trim() || 'Automatically queued after department handoff',
        changedByUserId: params.userId,
      },
    });

    return entry;
  }

  async createEntry(userId: string, dto: CreateQueueEntryDto) {
    const context = await this.authorization.getContext(userId);

    try {
      return await this.database.client.$transaction(
        async (tx) => {
          const queue = await tx.queue.findFirst({
            where: {
              id: dto.queueId,
              tenantId: context.tenantId,
              status: QueueStatus.ACTIVE,
            },
            select: {
              id: true,
              tenantId: true,
              code: true,
              branchId: true,
              departmentId: true,
            },
          });

          if (!queue) {
            throw new NotFoundException('Active queue not found');
          }

          const encounter = await tx.encounter.findFirst({
            where: {
              id: dto.encounterId,
              tenantId: context.tenantId,
            },
            select: {
              id: true,
              tenantId: true,
              patientTenantRecordId: true,
              branchId: true,
              departmentId: true,
              type: true,
              status: true,
            },
          });

          if (!encounter) {
            throw new NotFoundException('Encounter not found');
          }

          if (encounter.status === 'CANCELLED' || encounter.status === 'NO_SHOW') {
            throw new BadRequestException('Cancelled or no-show encounters cannot enter a queue');
          }

          if (queue.branchId && queue.branchId !== encounter.branchId) {
            throw new BadRequestException('Queue branch does not match the encounter branch');
          }

          if (queue.departmentId && queue.departmentId !== encounter.departmentId) {
            throw new BadRequestException(
              'Queue department does not match the encounter department',
            );
          }

          const patientTenantRecord = await tx.patientTenantRecord.findFirst({
            where: {
              id: encounter.patientTenantRecordId,
              tenantId: context.tenantId,
              status: 'ACTIVE',
              deletedAt: null,
            },
            select: { id: true },
          });

          if (!patientTenantRecord) {
            throw new BadRequestException('Encounter patient is not active at this tenant');
          }

          const existing = await tx.queueEntry.findFirst({
            where: {
              tenantId: context.tenantId,
              queueId: queue.id,
              encounterId: encounter.id,
              status: {
                in: [
                  QueueEntryStatus.CREATED,
                  QueueEntryStatus.WAITING,
                  QueueEntryStatus.CALLED,
                  QueueEntryStatus.IN_SERVICE,
                ],
              },
            },
            select: { id: true },
          });

          if (existing) {
            throw new ConflictException('Encounter is already active in this queue');
          }

          const waitingCount = await tx.queueEntry.count({
            where: {
              tenantId: context.tenantId,
              queueId: queue.id,
              status: {
                in: [QueueEntryStatus.CREATED, QueueEntryStatus.WAITING],
              },
            },
          });

          const position = waitingCount + 1;

          const entry = await tx.queueEntry.create({
            data: {
              tenantId: context.tenantId,
              queueId: queue.id,
              encounterId: encounter.id,
              patientTenantRecordId: encounter.patientTenantRecordId,
              queueNumber: await this.generateQueueNumber(
                tx,
                context.tenantId,
                queue.id,
              ),
              priority: dto.priority ?? QueueEntryPriority.ROUTINE,
              status: QueueEntryStatus.WAITING,
              position,
              reason: dto.reason?.trim() || null,
              checkedInAt: new Date(),
              createdByUserId: userId,
            },
            select: this.entrySelect(),
          });

          await tx.queueEntryHistory.create({
            data: {
              tenantId: context.tenantId,
              queueEntryId: entry.id,
              fromStatus: null,
              toStatus: QueueEntryStatus.WAITING,
              fromPosition: null,
              toPosition: position,
              reason: dto.reason?.trim() || null,
              changedByUserId: userId,
            },
          });

          await tx.auditEvent.create({
            data: {
              tenantId: context.tenantId,
              actorUserId: userId,
              branchId: context.branchId ?? null,
              action: 'QUEUE_ENTRY_CREATED',
              resourceType: 'QUEUE_ENTRY',
              resourceId: entry.id,
              outcome: 'SUCCESS',
              metadata: {
                queueId: queue.id,
                encounterId: encounter.id,
                queueNumber: entry.queueNumber,
              },
            },
          });

          return entry;
        },
        this.queueTxOptions,
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ConflictException('Queue changed concurrently. Please retry the operation.');
      }

      throw error;
    }
  }

  private async transition(
    userId: string,
    entryId: string,
    from: QueueEntryStatus,
    to: QueueEntryStatus,
    timestampField:
      'calledAt' | 'startedAt' | 'completedAt' | 'skippedAt' | 'noShowAt' | 'cancelledAt' | null,
  ) {
    const context = await this.authorization.getContext(userId);

    return this.database.client.$transaction(
      async (tx) => {
        const entry = await tx.queueEntry.findFirst({
          where: {
            id: entryId,
            tenantId: context.tenantId,
          },
          select: {
            id: true,
            tenantId: true,
            queueId: true,
            status: true,
            position: true,
          },
        });

        if (!entry) {
          throw new NotFoundException('Queue entry not found');
        }

        if (entry.status !== from) {
          throw new BadRequestException(`Queue entry must be ${from} before it can become ${to}`);
        }

        if (to === QueueEntryStatus.COMPLETED) {
          const careRecordCount = await tx.queueCareRecord.count({
            where: {
              tenantId: context.tenantId,
              queueEntryId: entry.id,
            },
          });

          if (careRecordCount === 0) {
            throw new BadRequestException(
              'Record the department notes or procedures before completing this queue step',
            );
          }
        }

        const now = new Date();

        const data: Prisma.QueueEntryUpdateInput = {
          status: to,
        };

        if (timestampField) {
          data[timestampField] = now;
        }

        if (
          to === QueueEntryStatus.COMPLETED ||
          to === QueueEntryStatus.SKIPPED ||
          to === QueueEntryStatus.CANCELLED ||
          to === QueueEntryStatus.NO_SHOW ||
          to === QueueEntryStatus.CALLED
        ) {
          data.position = null;
        }

        const updated = await tx.queueEntry.update({
          where: { id: entry.id },
          data,
          select: this.entrySelect(),
        });

        await tx.queueEntryHistory.create({
          data: {
            tenantId: context.tenantId,
            queueEntryId: entry.id,
            fromStatus: from,
            toStatus: to,
            fromPosition: entry.position,
            toPosition: updated.position,
            changedByUserId: userId,
          },
        });

        const journeyStep = await tx.patientJourneyStep.findFirst({
          where: {
            tenantId: context.tenantId,
            queueEntryId: entry.id,
            status: {
              notIn: ['COMPLETED', 'SKIPPED', 'CANCELLED'],
            },
          },
          orderBy: {
            sequence: 'asc',
          },
          select: {
            id: true,
            journeyId: true,
            status: true,
            sequence: true,
          },
        });

        if (journeyStep) {
          const journeyStatusMap: Record<
            QueueEntryStatus,
            'WAITING' | 'CALLED' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED' | 'CANCELLED'
          > = {
            [QueueEntryStatus.CREATED]: 'WAITING',
            [QueueEntryStatus.WAITING]: 'WAITING',
            [QueueEntryStatus.CALLED]: 'CALLED',
            [QueueEntryStatus.IN_SERVICE]: 'IN_PROGRESS',
            [QueueEntryStatus.COMPLETED]: 'COMPLETED',
            [QueueEntryStatus.SKIPPED]: 'SKIPPED',
            [QueueEntryStatus.CANCELLED]: 'CANCELLED',
            [QueueEntryStatus.NO_SHOW]: 'CANCELLED',
          };

          const journeyStepStatus = journeyStatusMap[to];

          const journeyStepData: Prisma.PatientJourneyStepUpdateInput = {
            status: journeyStepStatus,
          };

          if (journeyStepStatus === 'IN_PROGRESS') {
            journeyStepData.startedAt = now;
          }

          if (
            journeyStepStatus === 'COMPLETED' ||
            journeyStepStatus === 'SKIPPED' ||
            journeyStepStatus === 'CANCELLED'
          ) {
            journeyStepData.completedAt = now;
          }

          await tx.patientJourneyStep.update({
            where: {
              id: journeyStep.id,
            },
            data: journeyStepData,
          });

          if (journeyStepStatus === 'COMPLETED') {
            await tx.patientJourneyHandoff.updateMany({
              where: {
                tenantId: context.tenantId,
                journeyId: journeyStep.journeyId,
                toStepId: journeyStep.id,
                status: 'ACCEPTED',
              },
              data: {
                status: 'COMPLETED',
                completedAt: now,
              },
            });
          }

          if (
            journeyStepStatus === 'COMPLETED' ||
            journeyStepStatus === 'SKIPPED' ||
            journeyStepStatus === 'CANCELLED'
          ) {
            const nextJourneyStep = await tx.patientJourneyStep.findFirst({
              where: {
                journeyId: journeyStep.journeyId,
                sequence: {
                  gt: journeyStep.sequence,
                },
                status: {
                  notIn: ['COMPLETED', 'SKIPPED', 'CANCELLED'],
                },
              },
              orderBy: {
                sequence: 'asc',
              },
            });

            if (nextJourneyStep) {
              await tx.patientJourneyStep.update({
                where: {
                  id: nextJourneyStep.id,
                },
                data: {
                  status: 'READY',
                  readyAt: now,
                },
              });

              if (nextJourneyStep.type === 'HANDOFF') {
                const journey = await tx.patientJourney.findUnique({
                  where: {
                    id: journeyStep.journeyId,
                  },
                  select: {
                    id: true,
                    encounterId: true,
                    patientTenantRecordId: true,
                  },
                });

                if (journey?.encounterId && nextJourneyStep.departmentId) {
                  const destinationEntry = await this.autoQueueJourneyDestination(tx, {
                    userId,
                    tenantId: context.tenantId,
                    encounterId: journey.encounterId,
                    patientTenantRecordId: journey.patientTenantRecordId,
                    branchId: nextJourneyStep.branchId,
                    departmentId: nextJourneyStep.departmentId,
                    reason:
                      nextJourneyStep.description ??
                      nextJourneyStep.instruction ??
                      'Automatically queued after department handoff',
                  });

                  const destinationStep = await tx.patientJourneyStep.findFirst({
                    where: {
                      journeyId: journey.id,
                      sequence: {
                        gt: nextJourneyStep.sequence,
                      },
                      type: 'SERVICE',
                      departmentId: nextJourneyStep.departmentId,
                    },
                    orderBy: {
                      sequence: 'asc',
                    },
                    select: {
                      id: true,
                      description: true,
                    },
                  });

                  if (destinationStep) {
                    await tx.patientJourneyStep.update({
                      where: {
                        id: destinationStep.id,
                      },
                      data: {
                        status: 'WAITING',
                        queueId: destinationEntry.queueId,
                        queueEntryId: destinationEntry.id,
                        branchId: nextJourneyStep.branchId,
                        departmentId: nextJourneyStep.departmentId,
                        description: nextJourneyStep.description ?? destinationStep.description,
                        readyAt: now,
                        instruction:
                          'Remain nearby and watch for your queue call. When called, proceed to the service point.',
                      },
                    });
                  }

                  await tx.patientJourneyStep.update({
                    where: {
                      id: nextJourneyStep.id,
                    },
                    data: {
                      status: 'COMPLETED',
                      completedAt: now,
                    },
                  });

                  const handoff = await tx.patientJourneyHandoff.findFirst({
                    where: {
                      journeyId: journey.id,
                      toStepId: destinationStep ? destinationStep.id : null,
                      status: 'PENDING',
                    },
                    select: {
                      id: true,
                    },
                  });

                  if (handoff) {
                    await tx.patientJourneyHandoff.update({
                      where: {
                        id: handoff.id,
                      },
                      data: {
                        status: 'ACCEPTED',
                        acceptedAt: now,
                      },
                    });
                  }
                }
              }
            } else {
              await tx.patientJourney.update({
                where: {
                  id: journeyStep.journeyId,
                },
                data: {
                  status: 'COMPLETED',
                  completedAt: now,
                },
              });
            }
          }
        }

        await tx.auditEvent.create({
          data: {
            tenantId: context.tenantId,
            actorUserId: userId,
            branchId: context.branchId ?? null,
            action: `QUEUE_ENTRY_${to}`,
            resourceType: 'QUEUE_ENTRY',
            resourceId: entry.id,
            outcome: 'SUCCESS',
            metadata: {
              queueId: entry.queueId,
              fromStatus: from,
              toStatus: to,
            },
          },
        });

        return updated;
      },
      this.queueTxOptions,
    );
  }

  async call(userId: string, entryId: string) {
    const context = await this.authorization.getContext(userId);

    try {
      return await this.database.client.$transaction(
        async (tx) => {
          const entry = await tx.queueEntry.findFirst({
            where: {
              id: entryId,
              tenantId: context.tenantId,
            },
            select: {
              id: true,
              tenantId: true,
              queueId: true,
              status: true,
              position: true,
              patientTenantRecord: {
                select: {
                  patientProfile: {
                    select: {
                      userId: true,
                    },
                  },
                },
              },
            },
          });

          if (!entry) {
            throw new NotFoundException('Queue entry not found');
          }

          if (
            entry.status !== QueueEntryStatus.WAITING &&
            entry.status !== QueueEntryStatus.CALLED
          ) {
            throw new BadRequestException(
              'Queue entry must be WAITING or CALLED before it can be called',
            );
          }

          const lastCall = await tx.queueCall.findFirst({
            where: {
              queueEntryId: entry.id,
              tenantId: context.tenantId,
            },
            orderBy: {
              callNumber: 'desc',
            },
            select: {
              callNumber: true,
            },
          });

          const callNumber = (lastCall?.callNumber ?? 0) + 1;
          const now = new Date();

          const updated = await tx.queueEntry.update({
            where: {
              id: entry.id,
            },
            data: {
              status: QueueEntryStatus.CALLED,
              calledAt: now,
              position: null,
            },
            select: this.entrySelect(),
          });

          await tx.patientJourneyStep.updateMany({
            where: {
              tenantId: context.tenantId,
              queueEntryId: entry.id,
              status: {
                notIn: ['COMPLETED', 'SKIPPED', 'CANCELLED'],
              },
            },
            data: {
              status: 'CALLED',
            },
          });

          const call = await tx.queueCall.create({
            data: {
              tenantId: context.tenantId,
              queueEntryId: entry.id,
              calledByUserId: userId,
              callNumber,
              status: 'CALLED',
              calledAt: now,
            },
          });

          await tx.notification.create({
            data: {
              tenantId: context.tenantId,
              recipientUserId: entry.patientTenantRecord.patientProfile.userId,
              type: 'QUEUE_PATIENT_CALLED',
              title: callNumber === 1 ? 'You are being called' : 'You have been recalled',
              body:
                callNumber === 1
                  ? `Please proceed to the queue. Your queue number is ${updated.queueNumber}.`
                  : `Please proceed to the queue. You have been recalled for queue number ${updated.queueNumber}.`,
              data: {
                queueEntryId: entry.id,
                queueCallId: call.id,
                queueId: entry.queueId,
                queueNumber: updated.queueNumber,
                callNumber,
                status: 'CALLED',
              },
              deliveries: {
                createMany: {
                  data: [
                    {
                      channel: 'IN_APP',
                      status: 'PENDING',
                      idempotencyKey: `queue-call:${call.id}:IN_APP`,
                    },
                    {
                      channel: 'EMAIL',
                      status: 'PENDING',
                      idempotencyKey: `queue-call:${call.id}:EMAIL`,
                    },
                  ],
                },
              },
            },
          });

          await tx.queueEntryHistory.create({
            data: {
              tenantId: context.tenantId,
              queueEntryId: entry.id,
              fromStatus: entry.status,
              toStatus: QueueEntryStatus.CALLED,
              fromPosition: entry.position,
              toPosition: updated.position,
              reason: callNumber === 1 ? 'Patient called' : `Patient recalled (call ${callNumber})`,
              changedByUserId: userId,
            },
          });

          await tx.auditEvent.create({
            data: {
              tenantId: context.tenantId,
              actorUserId: userId,
              branchId: context.branchId ?? null,
              action: callNumber === 1 ? 'QUEUE_PATIENT_CALLED' : 'QUEUE_PATIENT_RECALLED',
              resourceType: 'QUEUE_ENTRY',
              resourceId: entry.id,
              outcome: 'SUCCESS',
              metadata: {
                queueId: entry.queueId,
                callId: call.id,
                callNumber,
                previousStatus: entry.status,
                status: QueueEntryStatus.CALLED,
              },
            },
          });

          return {
            entry: updated,
            call,
          };
        },
        this.queueTxOptions,
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2034' || error.code === 'P2002')
      ) {
        throw new ConflictException('Queue call changed concurrently. Please retry the operation.');
      }

      throw error;
    }
  }

  async acknowledge(userId: string, entryId: string) {
    const context = await this.authorization.getContext(userId);

    return this.database.client.$transaction(
      async (tx) => {
        const entry = await tx.queueEntry.findFirst({
          where: {
            id: entryId,
            tenantId: context.tenantId,
            status: QueueEntryStatus.CALLED,
          },
          select: {
            id: true,
            tenantId: true,
            queueId: true,
            position: true,
          },
        });

        if (!entry) {
          throw new NotFoundException('Called queue entry not found');
        }

        const activeCall = await tx.queueCall.findFirst({
          where: {
            queueEntryId: entry.id,
            tenantId: context.tenantId,
            status: 'CALLED',
          },
          orderBy: {
            callNumber: 'desc',
          },
          select: {
            id: true,
            callNumber: true,
          },
        });

        if (!activeCall) {
          throw new BadRequestException('No active queue call exists for this entry');
        }

        const now = new Date();

        const call = await tx.queueCall.update({
          where: {
            id: activeCall.id,
          },
          data: {
            status: 'ACKNOWLEDGED',
            acknowledgedAt: now,
          },
        });

        await tx.auditEvent.create({
          data: {
            tenantId: context.tenantId,
            actorUserId: userId,
            branchId: context.branchId ?? null,
            action: 'QUEUE_CALL_ACKNOWLEDGED',
            resourceType: 'QUEUE_CALL',
            resourceId: activeCall.id,
            outcome: 'SUCCESS',
            metadata: {
              queueEntryId: entry.id,
              queueId: entry.queueId,
              callNumber: activeCall.callNumber,
            },
          },
        });

        return {
          entryId: entry.id,
          call,
        };
      },
      this.queueTxOptions,
    );
  }

  async start(userId: string, entryId: string) {
    return this.transition(
      userId,
      entryId,
      QueueEntryStatus.CALLED,
      QueueEntryStatus.IN_SERVICE,
      'startedAt',
    );
  }

  async complete(userId: string, entryId: string) {
    return this.transition(
      userId,
      entryId,
      QueueEntryStatus.IN_SERVICE,
      QueueEntryStatus.COMPLETED,
      'completedAt',
    );
  }

  async skip(userId: string, entryId: string) {
    return this.transition(
      userId,
      entryId,
      QueueEntryStatus.WAITING,
      QueueEntryStatus.SKIPPED,
      'skippedAt',
    );
  }

  async noShow(userId: string, entryId: string) {
    return this.transition(
      userId,
      entryId,
      QueueEntryStatus.CALLED,
      QueueEntryStatus.NO_SHOW,
      'noShowAt',
    );
  }

  async cancel(userId: string, entryId: string) {
    return this.transition(
      userId,
      entryId,
      QueueEntryStatus.WAITING,
      QueueEntryStatus.CANCELLED,
      'cancelledAt',
    );
  }

  async listCareRecords(userId: string, entryId: string) {
    const context = await this.authorization.getContext(userId);
    const entry = await this.database.client.queueEntry.findFirst({
      where: {
        id: entryId,
        tenantId: context.tenantId,
      },
      select: {
        id: true,
      },
    });

    if (!entry) {
      throw new NotFoundException('Queue entry not found');
    }

    const data = await this.database.client.queueCareRecord.findMany({
      where: {
        tenantId: context.tenantId,
        queueEntryId: entry.id,
      },
      orderBy: {
        createdAt: 'asc',
      },
      select: {
        id: true,
        note: true,
        procedures: true,
        documentUrl: true,
        createdAt: true,
        author: {
          select: {
            id: true,
            displayName: true,
          },
        },
        department: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        attachments: {
          orderBy: {
            createdAt: 'asc',
          },
          select: {
            id: true,
            fileName: true,
            contentType: true,
            byteSize: true,
            createdAt: true,
          },
        },
      },
    });

    return { data };
  }

  async createCareRecord(userId: string, entryId: string, dto: CreateQueueCareRecordDto) {
    const context = await this.authorization.getContext(userId);
    const note = dto.note?.trim() || null;
    const procedures = dto.procedures?.trim() || null;
    const documentUrl = dto.documentUrl?.trim() || null;

    if (!note && !procedures && !documentUrl) {
      throw new BadRequestException(
        'Enter department notes, procedures performed, or provide a document URL',
      );
    }

    const entry = await this.database.client.queueEntry.findFirst({
      where: {
        id: entryId,
        tenantId: context.tenantId,
      },
      select: {
        id: true,
        status: true,
        encounterId: true,
        queue: {
          select: {
            departmentId: true,
          },
        },
      },
    });

    if (!entry) {
      throw new NotFoundException('Queue entry not found');
    }

    if (entry.status !== QueueEntryStatus.IN_SERVICE) {
      throw new BadRequestException(
        'Department care can only be recorded while the patient is in service',
      );
    }

    return this.database.client.$transaction(async (tx) => {
      const record = await tx.queueCareRecord.create({
        data: {
          tenantId: context.tenantId,
          queueEntryId: entry.id,
          encounterId: entry.encounterId,
          departmentId: entry.queue.departmentId,
          authorUserId: userId,
          note,
          procedures,
          documentUrl,
        },
        select: {
          id: true,
          note: true,
          procedures: true,
          documentUrl: true,
          createdAt: true,
        },
      });

      await tx.auditEvent.create({
        data: {
          tenantId: context.tenantId,
          actorUserId: userId,
          branchId: context.branchId ?? null,
          action: 'QUEUE_DEPARTMENT_CARE_RECORDED',
          resourceType: 'QUEUE_CARE_RECORD',
          resourceId: record.id,
          outcome: 'SUCCESS',
          reason: 'Department care recorded',
          metadata: {
            queueEntryId: entry.id,
            encounterId: entry.encounterId,
            departmentId: entry.queue.departmentId,
            hasNote: Boolean(note),
            hasProcedures: Boolean(procedures),
            hasDocumentUrl: Boolean(documentUrl),
          },
        },
      });

      return record;
    });
  }

  async uploadCareAttachment(
    userId: string,
    careRecordId: string,
    file: {
      originalname: string;
      mimetype: string;
      buffer: Buffer;
    },
  ) {
    const context = await this.authorization.getContext(userId);
    const maxFileSize = 25 * 1024 * 1024;
    const allowedContentTypes = new Set([
      'application/pdf',
      'application/dicom',
      'image/jpeg',
      'image/png',
      'image/webp',
    ]);
    const expectedExtensions: Record<string, string[]> = {
      'application/pdf': ['.pdf'],
      'application/dicom': ['.dcm'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
    };

    if (!allowedContentTypes.has(file.mimetype)) {
      throw new BadRequestException(
        'Only PDF, DICOM, JPEG, PNG, and WebP clinical files are supported',
      );
    }

    const lowerCaseFileName = file.originalname.toLowerCase();
    if (
      !expectedExtensions[file.mimetype]?.some((extension) =>
        lowerCaseFileName.endsWith(extension),
      )
    ) {
      throw new BadRequestException(
        'The uploaded file extension does not match a supported clinical file type',
      );
    }

    if (!file.buffer.length || file.buffer.length > maxFileSize) {
      throw new BadRequestException('Clinical files must be between 1 byte and 25 MB');
    }

    const hasValidSignature =
      (file.mimetype === 'application/pdf' &&
        file.buffer.subarray(0, 5).toString('ascii') === '%PDF-') ||
      (file.mimetype === 'image/jpeg' &&
        file.buffer[0] === 0xff &&
        file.buffer[1] === 0xd8 &&
        file.buffer[2] === 0xff) ||
      (file.mimetype === 'image/png' &&
        file.buffer
          .subarray(0, 8)
          .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) ||
      (file.mimetype === 'image/webp' &&
        file.buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        file.buffer.subarray(8, 12).toString('ascii') === 'WEBP') ||
      (file.mimetype === 'application/dicom' &&
        file.buffer.subarray(128, 132).toString('ascii') === 'DICM');

    if (!hasValidSignature) {
      throw new BadRequestException(
        'The uploaded file content does not match its declared file type',
      );
    }

    const careRecord = await this.database.client.queueCareRecord.findFirst({
      where: {
        id: careRecordId,
        tenantId: context.tenantId,
        queueEntry: {
          status: QueueEntryStatus.IN_SERVICE,
        },
      },
      select: {
        id: true,
        queueEntryId: true,
      },
    });

    if (!careRecord) {
      throw new NotFoundException('Active department care record not found');
    }

    const fileName =
      file.originalname
        .replace(/[\\/]/g, '_')
        .replace(/[^\w.\- ()]/g, '_')
        .slice(0, 255) || 'clinical-file';
    const storageKey = `tenant/${context.tenantId}/queue-care/${randomUUID()}`;

    await this.storage.put(storageKey, file.buffer, file.mimetype);

    try {
      return await this.database.client.$transaction(
        async (tx) => {
          const attachment = await tx.queueCareAttachment.create({
            data: {
              tenantId: context.tenantId,
              careRecordId: careRecord.id,
              uploadedByUserId: userId,
              storageKey,
              fileName,
              contentType: file.mimetype,
              byteSize: file.buffer.length,
            },
            select: {
              id: true,
              fileName: true,
              contentType: true,
              byteSize: true,
              createdAt: true,
            },
          });

          await tx.auditEvent.create({
            data: {
              tenantId: context.tenantId,
              actorUserId: userId,
              branchId: context.branchId ?? null,
              action: 'QUEUE_DEPARTMENT_ATTACHMENT_UPLOADED',
              resourceType: 'QUEUE_CARE_ATTACHMENT',
              resourceId: attachment.id,
              outcome: 'SUCCESS',
              reason: 'Department clinical attachment uploaded',
              metadata: {
                careRecordId: careRecord.id,
                queueEntryId: careRecord.queueEntryId,
                fileName,
                contentType: file.mimetype,
                byteSize: file.buffer.length,
              },
            },
          });

          return attachment;
        },
        this.queueTxOptions,
      );
    } catch (error) {
      try {
        await this.storage.delete(storageKey);
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          'Attachment metadata could not be saved and the private object could not be cleaned up',
        );
      }

      throw error;
    }
  }

  async downloadCareAttachment(userId: string, attachmentId: string) {
    const context = await this.authorization.getContext(userId);
    const attachment = await this.database.client.queueCareAttachment.findFirst({
      where: {
        id: attachmentId,
        tenantId: context.tenantId,
      },
      select: {
        storageKey: true,
        fileName: true,
        contentType: true,
        byteSize: true,
      },
    });

    if (!attachment) {
      throw new NotFoundException('Clinical attachment not found');
    }

    const buffer = await this.storage.get(attachment.storageKey);

    await this.database.client.auditEvent.create({
      data: {
        tenantId: context.tenantId,
        actorUserId: userId,
        branchId: context.branchId ?? null,
        action: 'QUEUE_DEPARTMENT_ATTACHMENT_DOWNLOADED',
        resourceType: 'QUEUE_CARE_ATTACHMENT',
        resourceId: attachmentId,
        outcome: 'SUCCESS',
        reason: 'Department clinical attachment downloaded',
        metadata: {
          contentType: attachment.contentType,
          byteSize: attachment.byteSize,
        },
      },
    });

    return {
      ...attachment,
      buffer,
    };
  }

  async getHistory(userId: string, entryId: string) {
    const context = await this.authorization.getContext(userId);

    const entry = await this.database.client.queueEntry.findFirst({
      where: {
        id: entryId,
        tenantId: context.tenantId,
      },
      select: { id: true },
    });

    if (!entry) {
      throw new NotFoundException('Queue entry not found');
    }

    return this.database.client.queueEntryHistory.findMany({
      where: {
        tenantId: context.tenantId,
        queueEntryId: entry.id,
      },
      orderBy: {
        createdAt: 'asc',
      },
      select: {
        id: true,
        queueEntryId: true,
        fromStatus: true,
        toStatus: true,
        fromPosition: true,
        toPosition: true,
        reason: true,
        changedByUserId: true,
        createdAt: true,
      },
    });
  }
}
