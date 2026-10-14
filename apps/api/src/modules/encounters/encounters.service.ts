import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import crypto from 'node:crypto';
import {
  EncounterType,
  EncounterStatus,
  Prisma,
  QueueEntryStatus,
  RecordStatus,
} from '@prisma/client';
import { DatabaseService } from '../../database/database.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { CreateEncounterDto } from './dto/create-encounter.dto.js';
import { EncounterQueryDto } from './dto/encounter-query.dto.js';
import { TransitionEncounterDto } from './dto/transition-encounter.dto.js';
import { QueuesService } from '../queues/queues.service.js';

@Injectable()
export class EncountersService {
  constructor(
    private readonly database: DatabaseService,
    private readonly authorization: AuthorizationService,
    private readonly queues: QueuesService,
  ) {}

  private encounterSelect() {
    return {
      id: true,
      branchId: true,
      departmentId: true,
      encounterNumber: true,
      type: true,
      status: true,
      reason: true,
      startedAt: true,
      completedAt: true,
      cancelledAt: true,
      cancelledReason: true,
      createdAt: true,
      updatedAt: true,
      queueEntries: {
        where: {
          status: {
            in: [
              QueueEntryStatus.CREATED,
              QueueEntryStatus.WAITING,
              QueueEntryStatus.CALLED,
              QueueEntryStatus.IN_SERVICE,
            ],
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 1,
        select: {
          id: true,
          queueNumber: true,
          status: true,
          position: true,
          reason: true,
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
              user: {
                select: {
                  displayName: true,
                },
              },
            },
          },
        },
      },
      provider: {
        select: {
          id: true,
          providerNumber: true,
          providerType: true,
          professionalTitle: true,
          specialty: true,
          user: {
            select: {
              displayName: true,
            },
          },
        },
      },
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
      createdByUser: {
        select: {
          id: true,
          displayName: true,
        },
      },
    } satisfies Prisma.EncounterSelect;
  }

  async create(userId: string, dto: CreateEncounterDto) {
    const context = await this.authorization.getContext(userId);

    const patient = await this.database.client.patientTenantRecord.findFirst({
      where: {
        id: dto.patientTenantRecordId,
        tenantId: context.tenantId,
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: {
        id: true,
        patientNumber: true,
        status: true,
      },
    });

    if (!patient) {
      throw new BadRequestException(
        'Patient must be an active patient of this facility',
      );
    }

    if (dto.providerId) {
      const provider = await this.database.client.providerProfile.findFirst({
        where: {
          id: dto.providerId,
          tenantId: context.tenantId,
          status: RecordStatus.ACTIVE,
          deletedAt: null,
        },
        select: { id: true },
      });

      if (!provider) {
        throw new BadRequestException(
          'Provider does not belong to this facility or is not active',
        );
      }
    }

    if (dto.branchId) {
      const branch = await this.database.client.branch.findFirst({
        where: {
          id: dto.branchId,
          tenantId: context.tenantId,
          status: RecordStatus.ACTIVE,
          deletedAt: null,
        },
        select: { id: true },
      });

      if (!branch) {
        throw new BadRequestException(
          'Branch does not belong to this facility or is not active',
        );
      }
    }

    if (dto.departmentId) {
      const department = await this.database.client.department.findFirst({
        where: {
          id: dto.departmentId,
          tenantId: context.tenantId,
          status: RecordStatus.ACTIVE,
          deletedAt: null,
        },
        select: {
          id: true,
          branchId: true,
        },
      });

      if (!department) {
        throw new BadRequestException(
          'Department does not belong to this facility or is not active',
        );
      }

      if (dto.branchId && department.branchId && department.branchId !== dto.branchId) {
        throw new BadRequestException(
          'Department does not belong to the selected branch',
        );
      }
    }

    const reason = dto.reason?.trim() || null;

    try {
      return await this.database.client.$transaction(
        async (transaction) => {
        const encounterNumber =
          `ENC-${new Date().getUTCFullYear()}-${crypto.randomUUID()
            .replace(/-/g, '')
            .slice(0, 12)
            .toUpperCase()}`;

        const encounter = await transaction.encounter.create({
          data: {
            tenantId: context.tenantId,
            patientTenantRecordId: patient.id,
            providerId: dto.providerId ?? null,
            branchId: dto.branchId ?? context.branchId ?? null,
            departmentId: dto.departmentId ?? context.departmentId ?? null,
            createdByUserId: userId,
            encounterNumber,
            type: dto.type,
            status: EncounterStatus.CREATED,
            reason,
          },
          select: this.encounterSelect(),
        });

        await transaction.encounterStatusHistory.create({
          data: {
            encounterId: encounter.id,
            tenantId: context.tenantId,
            fromStatus: null,
            toStatus: EncounterStatus.CREATED,
            changedByUserId: userId,
            reason: 'Encounter created',
          },
        });

        await transaction.auditEvent.create({
          data: {
            tenantId: context.tenantId,
            actorUserId: userId,
            branchId: encounter.branch?.id ?? context.branchId,
            action: 'ENCOUNTER_CREATED',
            resourceType: 'ENCOUNTER',
            resourceId: encounter.id,
            outcome: 'SUCCESS',
            reason: 'Encounter created',
            metadata: {
              encounterNumber: encounter.encounterNumber,
              patientTenantRecordId: patient.id,
              patientNumber: patient.patientNumber,
              type: encounter.type,
              providerId: encounter.provider?.id ?? null,
              departmentId: encounter.department?.id ?? null,
              branchId: encounter.branch?.id ?? null,
            },
          },
        });

        return encounter;
        },
        {
          timeout: 30000,
          maxWait: 15000,
        },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Encounter number already exists in this facility',
        );
      }

      throw error;
    }
  }

  private async transition(
    userId: string,
    encounterId: string,
    allowedFrom: EncounterStatus[],
    toStatus: EncounterStatus,
    dto: TransitionEncounterDto = {},
    existingTransaction?: Prisma.TransactionClient,
  ) {
    const context = await this.authorization.getContext(userId);
    const reason = dto.reason?.trim() || null;

    if (
      (toStatus === EncounterStatus.CANCELLED ||
        toStatus === EncounterStatus.REFERRED) &&
      !reason
    ) {
      throw new BadRequestException(
        `${toStatus === EncounterStatus.CANCELLED ? 'Cancellation' : 'Referral'} reason is required`,
      );
    }

    try {
      const execute = async (transaction: Prisma.TransactionClient) => {
        const encounter = await transaction.encounter.findFirst({
          where: {
            id: encounterId,
            tenantId: context.tenantId,
          },
          select: {
            id: true,
            encounterNumber: true,
            status: true,
            branchId: true,
            departmentId: true,
            reason: true,
          },
        });

        if (!encounter) {
          throw new NotFoundException('Encounter not found');
        }

        if (!allowedFrom.includes(encounter.status)) {
          throw new ConflictException(
            `Encounter cannot transition from ${encounter.status} to ${toStatus}`,
          );
        }

        let checkInDepartmentId: string | null = null;
        let checkInReason: string | null = null;

        if (toStatus === EncounterStatus.CHECKED_IN) {
          checkInReason =
            dto.reason?.trim() || encounter.reason?.trim() || null;
          checkInDepartmentId =
            dto.departmentId ??
            encounter.departmentId ??
            context.departmentId ??
            null;

          if (!checkInReason) {
            throw new BadRequestException(
              "Record the patient's presenting concern before check-in",
            );
          }

          if (!checkInDepartmentId) {
            throw new BadRequestException(
              'Assign the patient to a treatment department before check-in',
            );
          }

          const department = await transaction.department.findFirst({
            where: {
              id: checkInDepartmentId,
              tenantId: context.tenantId,
              status: RecordStatus.ACTIVE,
              deletedAt: null,
            },
            select: {
              id: true,
              branchId: true,
            },
          });

          if (!department) {
            throw new BadRequestException(
              'The selected treatment department is not active at this facility',
            );
          }

          if (
            encounter.branchId &&
            department.branchId &&
            encounter.branchId !== department.branchId
          ) {
            throw new BadRequestException(
              'The selected department does not belong to this encounter branch',
            );
          }
        }

        const now = new Date();

        const data: Prisma.EncounterUpdateInput = {
          status: toStatus,
        };

        if (
          toStatus === EncounterStatus.CHECKED_IN &&
          checkInDepartmentId
        ) {
          data.reason = checkInReason;
          data.department = {
            connect: {
              id: checkInDepartmentId,
            },
          };
        }

        if (toStatus === EncounterStatus.IN_PROGRESS) {
          data.startedAt = now;
        }

        if (toStatus === EncounterStatus.COMPLETED) {
          data.completedAt = now;
        }

        if (toStatus === EncounterStatus.CANCELLED) {
          data.cancelledAt = now;
          data.cancelledReason = reason;
        }

        const updated = await transaction.encounter.update({
          where: {
            id: encounter.id,
          },
          data,
          select: this.encounterSelect(),
        });

        await transaction.encounterStatusHistory.create({
          data: {
            encounterId: encounter.id,
            tenantId: context.tenantId,
            fromStatus: encounter.status,
            toStatus,
            changedByUserId: userId,
            reason,
          },
        });

        await transaction.auditEvent.create({
          data: {
            tenantId: context.tenantId,
            actorUserId: userId,
            branchId: encounter.branchId ?? context.branchId,
            action: 'ENCOUNTER_STATUS_CHANGED',
            resourceType: 'ENCOUNTER',
            resourceId: encounter.id,
            outcome: 'SUCCESS',
            reason: reason ?? `Encounter transitioned to ${toStatus}`,
            metadata: {
              encounterNumber: encounter.encounterNumber,
              fromStatus: encounter.status,
              toStatus,
            },
          },
        });

        if (toStatus === EncounterStatus.CHECKED_IN) {
          await this.queues.autoQueueCheckedInEncounter(
            transaction,
            {
              userId,
              tenantId: context.tenantId,
              encounterId: encounter.id,
              patientTenantRecordId:
                updated.patientTenantRecord.id,
              branchId: updated.branch?.id ?? context.branchId ?? null,
              departmentId: updated.department?.id ?? context.departmentId ?? null,
              encounterType: updated.type,
              reason: updated.reason,
            },
          );
        }

        return updated;
      };

      return existingTransaction
        ? await execute(existingTransaction)
        : await this.database.client.$transaction(execute, {
          timeout: 15000,
          maxWait: 10000,
        });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Encounter not found');
      }

      throw error;
    }
  }

  async ensureAppointmentEncounterCheckedIn(
    userId: string,
    transaction: Prisma.TransactionClient,
    appointment: {
      id: string;
      tenantId: string;
      patientTenantRecordId: string;
      providerId: string | null;
      branchId: string | null;
      departmentId: string | null;
      reason: string | null;
    },
    fallbackReason?: string | null,
  ) {
    const context = await this.authorization.getContext(userId);

    if (context.tenantId !== appointment.tenantId) {
      throw new NotFoundException('Appointment not found');
    }

    const patient = await transaction.patientTenantRecord.findFirst({
      where: {
        id: appointment.patientTenantRecordId,
        tenantId: context.tenantId,
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: { id: true, patientNumber: true },
    });

    if (!patient) {
      throw new BadRequestException(
        'Patient must be an active patient of this facility',
      );
    }

    const existing = await transaction.encounter.findUnique({
      where: { appointmentId: appointment.id },
      select: {
        id: true,
        tenantId: true,
        patientTenantRecordId: true,
        status: true,
      },
    });

    if (existing) {
      if (
        existing.tenantId !== context.tenantId ||
        existing.patientTenantRecordId !== patient.id
      ) {
        throw new ConflictException(
          'The appointment is already linked to a different encounter',
        );
      }

      if (existing.status === EncounterStatus.CREATED) {
        return this.transition(
          userId,
          existing.id,
          [EncounterStatus.CREATED],
          EncounterStatus.CHECKED_IN,
          fallbackReason ? { reason: fallbackReason } : {},
          transaction,
        );
      }

      const alreadyCheckedInStatuses: EncounterStatus[] = [
        EncounterStatus.CHECKED_IN,
        EncounterStatus.TRIAGED,
        EncounterStatus.IN_PROGRESS,
        EncounterStatus.COMPLETED,
      ];

      if (
        alreadyCheckedInStatuses.includes(existing.status)
      ) {
        return transaction.encounter.findFirstOrThrow({
          where: {
            id: existing.id,
            tenantId: context.tenantId,
          },
          select: this.encounterSelect(),
        });
      }

      throw new ConflictException(
        `Linked encounter cannot be checked in from ${existing.status}`,
      );
    }

    if (appointment.providerId) {
      const provider = await transaction.providerProfile.findFirst({
        where: {
          id: appointment.providerId,
          tenantId: context.tenantId,
          status: RecordStatus.ACTIVE,
          deletedAt: null,
        },
        select: { id: true },
      });

      if (!provider) {
        throw new BadRequestException(
          'Provider does not belong to this facility or is not active',
        );
      }
    }

    if (appointment.branchId) {
      const branch = await transaction.branch.findFirst({
        where: {
          id: appointment.branchId,
          tenantId: context.tenantId,
          status: RecordStatus.ACTIVE,
          deletedAt: null,
        },
        select: { id: true },
      });

      if (!branch) {
        throw new BadRequestException(
          'Branch does not belong to this facility or is not active',
        );
      }
    }

    const reason =
      appointment.reason?.trim() || fallbackReason?.trim() || null;
    const encounterNumber =
      `ENC-${new Date().getUTCFullYear()}-${crypto.randomUUID()
        .replace(/-/g, '')
        .slice(0, 12)
        .toUpperCase()}`;

    const encounter = await transaction.encounter.create({
      data: {
        tenantId: context.tenantId,
        patientTenantRecordId: patient.id,
        providerId: appointment.providerId,
        branchId: appointment.branchId,
        departmentId: appointment.departmentId,
        createdByUserId: userId,
        appointmentId: appointment.id,
        encounterNumber,
        type: EncounterType.OUTPATIENT,
        status: EncounterStatus.CREATED,
        reason,
      },
      select: {
        id: true,
        encounterNumber: true,
        branchId: true,
        type: true,
      },
    });

    await transaction.encounterStatusHistory.create({
      data: {
        encounterId: encounter.id,
        tenantId: context.tenantId,
        fromStatus: null,
        toStatus: EncounterStatus.CREATED,
        changedByUserId: userId,
        reason: 'Encounter created from appointment check-in',
      },
    });

    await transaction.auditEvent.create({
      data: {
        tenantId: context.tenantId,
        actorUserId: userId,
        branchId: encounter.branchId ?? context.branchId,
        action: 'ENCOUNTER_CREATED',
        resourceType: 'ENCOUNTER',
        resourceId: encounter.id,
        outcome: 'SUCCESS',
        reason: 'Encounter created from appointment check-in',
        metadata: {
          encounterNumber: encounter.encounterNumber,
          patientTenantRecordId: patient.id,
          patientNumber: patient.patientNumber,
          type: encounter.type,
          providerId: appointment.providerId,
          departmentId: appointment.departmentId,
          branchId: appointment.branchId,
          appointmentId: appointment.id,
        },
      },
    });

    return this.transition(
      userId,
      encounter.id,
      [EncounterStatus.CREATED],
      EncounterStatus.CHECKED_IN,
      reason ? { reason } : {},
      transaction,
    );
  }

  async checkIn(
    userId: string,
    encounterId: string,
    dto: TransitionEncounterDto = {},
  ) {
    return this.transition(
      userId,
      encounterId,
      [EncounterStatus.CREATED],
      EncounterStatus.CHECKED_IN,
      dto,
    );
  }

  async triage(userId: string, encounterId: string) {
    return this.transition(
      userId,
      encounterId,
      [EncounterStatus.CHECKED_IN],
      EncounterStatus.TRIAGED,
    );
  }

  async start(userId: string, encounterId: string) {
    return this.transition(
      userId,
      encounterId,
      [EncounterStatus.TRIAGED],
      EncounterStatus.IN_PROGRESS,
    );
  }

  async complete(userId: string, encounterId: string) {
    return this.transition(
      userId,
      encounterId,
      [EncounterStatus.IN_PROGRESS],
      EncounterStatus.COMPLETED,
    );
  }

  async cancel(
    userId: string,
    encounterId: string,
    dto: TransitionEncounterDto,
  ) {
    return this.transition(
      userId,
      encounterId,
      [
        EncounterStatus.CREATED,
        EncounterStatus.CHECKED_IN,
        EncounterStatus.TRIAGED,
        EncounterStatus.IN_PROGRESS,
      ],
      EncounterStatus.CANCELLED,
      dto,
    );
  }

  async noShow(
    userId: string,
    encounterId: string,
    dto: TransitionEncounterDto,
  ) {
    return this.transition(
      userId,
      encounterId,
      [EncounterStatus.CREATED, EncounterStatus.CHECKED_IN],
      EncounterStatus.NO_SHOW,
      dto,
    );
  }

  async refer(
    userId: string,
    encounterId: string,
    dto: TransitionEncounterDto,
  ) {
    return this.transition(
      userId,
      encounterId,
      [EncounterStatus.IN_PROGRESS],
      EncounterStatus.REFERRED,
      dto,
    );
  }

  async list(userId: string, query: EncounterQueryDto) {
    const context = await this.authorization.getContext(userId);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const search = query.search?.trim();

    const where: Prisma.EncounterWhereInput = {
      tenantId: context.tenantId,
      ...(query.patientTenantRecordId
        ? { patientTenantRecordId: query.patientTenantRecordId }
        : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.providerId ? { providerId: query.providerId } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(search
        ? {
            OR: [
              {
                encounterNumber: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
              {
                patientTenantRecord: {
                  patientNumber: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
              },
              {
                patientTenantRecord: {
                  patientProfile: {
                    user: {
                      displayName: {
                        contains: search,
                        mode: 'insensitive',
                      },
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [total, encounters] = await Promise.all([
      this.database.client.encounter.count({ where }),
      this.database.client.encounter.findMany({
        where,
        select: this.encounterSelect(),
        orderBy: {
          createdAt: 'desc',
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const queueIds = [
      ...new Set(
        encounters.flatMap((encounter) =>
          (encounter.queueEntries ?? []).map((entry) => entry.queue.id),
        ),
      ),
    ];
    const waitingEntries = queueIds.length
      ? await this.database.client.queueEntry.findMany({
          where: {
            tenantId: context.tenantId,
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
    const positions = new Map<string, number>();
    const queuePositions = new Map<string, number>();
    for (const entry of waitingEntries) {
      const position = (queuePositions.get(entry.queueId) ?? 0) + 1;
      queuePositions.set(entry.queueId, position);
      positions.set(entry.id, position);
    }

    return {
      data: encounters.map((encounter) => ({
        ...encounter,
        queueEntries: encounter.queueEntries?.map((entry) => ({
          ...entry,
          position:
            entry.status === QueueEntryStatus.CREATED ||
            entry.status === QueueEntryStatus.WAITING
              ? (positions.get(entry.id) ?? null)
              : null,
        })),
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async getHistory(userId: string, encounterId: string) {
    const context = await this.authorization.getContext(userId);

    const encounter = await this.database.client.encounter.findFirst({
      where: {
        id: encounterId,
        tenantId: context.tenantId,
      },
      select: {
        id: true,
        encounterNumber: true,
      },
    });

    if (!encounter) {
      throw new NotFoundException('Encounter not found');
    }

    const history =
      await this.database.client.encounterStatusHistory.findMany({
        where: {
          encounterId: encounter.id,
          tenantId: context.tenantId,
        },
        select: {
          id: true,
          fromStatus: true,
          toStatus: true,
          reason: true,
          createdAt: true,
          changedByUser: {
            select: {
              id: true,
              displayName: true,
            },
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

    return {
      encounter: {
        id: encounter.id,
        encounterNumber: encounter.encounterNumber,
      },
      data: history,
    };
  }

  async getById(userId: string, encounterId: string) {
    const context = await this.authorization.getContext(userId);

    const encounter = await this.database.client.encounter.findFirst({
      where: {
        id: encounterId,
        tenantId: context.tenantId,
      },
      select: this.encounterSelect(),
    });

    if (!encounter) {
      throw new NotFoundException('Encounter not found');
    }

    return encounter;
  }
}
