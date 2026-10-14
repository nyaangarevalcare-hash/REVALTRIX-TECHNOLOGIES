import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AppointmentBookingSource,
  AppointmentStatus,
  Prisma,
  RecordStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { CreateAppointmentDto } from './dto/create-appointment.dto.js';
import { CreatePatientAppointmentDto } from './dto/create-patient-appointment.dto.js';
import { AppointmentQueryDto } from './dto/appointment-query.dto.js';
import { AppointmentSlotsQueryDto } from './dto/appointment-slots-query.dto.js';
import { TransitionAppointmentDto } from './dto/transition-appointment.dto.js';
import { EncountersService } from '../encounters/encounters.service.js';

const TERMINAL_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.COMPLETED,
  AppointmentStatus.CANCELLED,
  AppointmentStatus.NO_SHOW,
  AppointmentStatus.REJECTED,
];

const TRANSITIONS: Partial<Record<AppointmentStatus, AppointmentStatus[]>> = {
  [AppointmentStatus.REQUESTED]: [
    AppointmentStatus.PENDING_APPROVAL,
    AppointmentStatus.CONFIRMED,
    AppointmentStatus.CANCELLED,
    AppointmentStatus.REJECTED,
  ],
  [AppointmentStatus.PENDING_APPROVAL]: [
    AppointmentStatus.CONFIRMED,
    AppointmentStatus.CANCELLED,
    AppointmentStatus.REJECTED,
  ],
  [AppointmentStatus.CONFIRMED]: [
    AppointmentStatus.CHECKED_IN,
    AppointmentStatus.CANCELLED,
    AppointmentStatus.NO_SHOW,
  ],
  [AppointmentStatus.CHECKED_IN]: [
    AppointmentStatus.IN_PROGRESS,
    AppointmentStatus.CANCELLED,
  ],
  [AppointmentStatus.IN_PROGRESS]: [
    AppointmentStatus.COMPLETED,
  ],
};

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly authorization: AuthorizationService,
    private readonly encounters: EncountersService,
  ) {}

  async discoverFacilities() {
    return this.database.client.tenant.findMany({
      where: {
        status: RecordStatus.ACTIVE,
        deletedAt: null,
        setup: { is: { status: 'LIVE' } },
        services: {
          some: {
            status: RecordStatus.ACTIVE,
            deletedAt: null,
          },
        },
        providerAvailabilityRules: {
          some: {
            isActive: true,
            provider: {
              is: {
                status: RecordStatus.ACTIVE,
                deletedAt: null,
              },
            },
          },
        },
      },
      select: {
        id: true,
        name: true,
        legalName: true,
        type: true,
        profile: {
          select: {
            businessName: true,
            country: true,
            county: true,
            subcounty: true,
            address: true,
            description: true,
            contactPhone: true,
          },
        },
        branches: {
          where: { status: RecordStatus.ACTIVE, deletedAt: null },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        },
        departments: {
          where: { status: RecordStatus.ACTIVE, deletedAt: null },
          select: { id: true, name: true, branchId: true },
          orderBy: { name: 'asc' },
        },
        services: {
          where: { status: RecordStatus.ACTIVE, deletedAt: null },
          select: {
            id: true,
            name: true,
            code: true,
            description: true,
            category: true,
            durationMin: true,
            branchId: true,
            departmentId: true,
          },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async discoverSlots(query: AppointmentSlotsQueryDto) {
    const from = new Date(query.from);
    const to = new Date(query.to);
    const now = new Date();

    if (
      !Number.isFinite(from.getTime()) ||
      !Number.isFinite(to.getTime()) ||
      to <= from
    ) {
      throw new BadRequestException('A valid increasing date range is required');
    }

    if (to.getTime() - from.getTime() > 14 * 24 * 60 * 60 * 1000) {
      throw new BadRequestException('Search no more than 14 days at a time');
    }

    const db = this.database.client;
    const service = await db.service.findFirst({
      where: {
        id: query.serviceId,
        tenantId: query.tenantId,
        status: RecordStatus.ACTIVE,
        deletedAt: null,
        tenant: {
          is: {
            status: RecordStatus.ACTIVE,
            deletedAt: null,
            setup: { is: { status: 'LIVE' } },
          },
        },
        ...(query.branchId ? { OR: [{ branchId: null }, { branchId: query.branchId }] } : {}),
        ...(query.departmentId ? { OR: [{ departmentId: null }, { departmentId: query.departmentId }] } : {}),
      },
      select: { id: true, durationMin: true, branchId: true, departmentId: true },
    });

    if (!service) {
      throw new NotFoundException('Bookable service not found at this facility');
    }

    const rules = await db.providerAvailability.findMany({
      where: {
        tenantId: query.tenantId,
        isActive: true,
        ...(query.providerId ? { providerId: query.providerId } : {}),
        ...(query.branchId ? { OR: [{ branchId: null }, { branchId: query.branchId }] } : {}),
        ...(query.departmentId ? { OR: [{ departmentId: null }, { departmentId: query.departmentId }] } : {}),
        OR: [{ serviceId: null }, { serviceId: service.id }],
        provider: {
          is: {
            status: RecordStatus.ACTIVE,
            deletedAt: null,
          },
        },
      },
      include: {
        provider: {
          select: {
            id: true,
            professionalTitle: true,
            specialty: true,
          },
        },
      },
    });

    const slots: Array<{
      tenantId: string;
      serviceId: string;
      providerId: string;
      providerTitle: string | null;
      specialty: string | null;
      branchId: string | null;
      departmentId: string | null;
      startAt: string;
      endAt: string;
      timeZone: string;
    }> = [];

    const slotKeys = new Set<string>();

    for (const rule of rules) {
      const duration = service.durationMin ?? rule.slotDurationMin ?? 30;
      if (
        !Number.isInteger(duration) ||
        duration < 5 ||
        duration > 720 ||
        (rule.slotDurationMin != null && rule.slotDurationMin !== duration)
      ) {
        continue;
      }

      const ruleStart = new Date(rule.effectiveFrom);
      const ruleEnd = rule.effectiveTo ? new Date(rule.effectiveTo) : null;
      const firstDay = new Date(Math.max(from.getTime(), now.getTime()));
      firstDay.setUTCHours(0, 0, 0, 0);

      for (
        let day = new Date(firstDay);
        day.getTime() < to.getTime();
        day.setUTCDate(day.getUTCDate() + 1)
      ) {
        const dateKey = new Intl.DateTimeFormat('en-CA', {
          timeZone: rule.timeZone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(day);

        const [yearPart, monthPart, datePart] = dateKey.split('-');
        const year = Number(yearPart ?? 0);
        const month = Number(monthPart ?? 0);
        const date = Number(datePart ?? 0);

        if (
          !Number.isInteger(year) ||
          !Number.isInteger(month) ||
          !Number.isInteger(date) ||
          year < 1 ||
          month < 1 ||
          month > 12 ||
          date < 1 ||
          date > 31
        ) {
          continue;
        }

        const localDate = new Date(Date.UTC(year, month - 1, date));
        const weekday = localDate.getUTCDay();
        const effectiveStartKey = `${ruleStart.getUTCFullYear()}-${String(ruleStart.getUTCMonth() + 1).padStart(2, '0')}-${String(ruleStart.getUTCDate()).padStart(2, '0')}`;
        const effectiveEndKey = ruleEnd
          ? `${ruleEnd.getUTCFullYear()}-${String(ruleEnd.getUTCMonth() + 1).padStart(2, '0')}-${String(ruleEnd.getUTCDate()).padStart(2, '0')}`
          : null;

        if (
          weekday !== rule.dayOfWeek ||
          dateKey < effectiveStartKey ||
          (effectiveEndKey !== null && dateKey > effectiveEndKey)
        ) {
          continue;
        }

        // Convert each wall-clock minute to a real instant using the rule's IANA timezone.
        const instantForMinute = (minute: number): Date | null => {
          const target = new Date(localDate);
          target.setUTCHours(0, minute, 0, 0);
          const desired = target.getTime();
          let guess = desired;

          for (let i = 0; i < 4; i++) {
            const parts = new Intl.DateTimeFormat('en-GB', {
              timeZone: rule.timeZone,
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              hourCycle: 'h23',
            }).formatToParts(new Date(guess));
            const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '0';
            const actual = Date.UTC(
              Number(get('year')),
              Number(get('month')) - 1,
              Number(get('day')),
              Number(get('hour')),
              Number(get('minute')),
            );
            guess += desired - actual;
          }

          const result = new Date(guess);
          const check = new Intl.DateTimeFormat('en-GB', {
            timeZone: rule.timeZone,
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
          }).format(result);
          const expected = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
          return check === expected ? result : null;
        };

        for (
          let minute = rule.startMinute;
          minute + duration <= rule.endMinute;
          minute += duration
        ) {
          const startAt = instantForMinute(minute);
          const endAt = instantForMinute(minute + duration);
          if (!startAt || !endAt || startAt < from || endAt > to || startAt <= now || endAt <= startAt) {
            continue;
          }

          const branchId = query.branchId ?? rule.branchId ?? service.branchId;
          const departmentId = query.departmentId ?? rule.departmentId ?? service.departmentId;
          const conflict = await db.appointment.findFirst({
            where: {
              tenantId: query.tenantId,
              providerId: rule.providerId,
              status: { notIn: TERMINAL_STATUSES },
              startAt: { lt: endAt },
              endAt: { gt: startAt },
            },
            select: { id: true },
          });
          if (conflict) continue;

          const block = await db.availabilityBlock.findFirst({
            where: {
              tenantId: query.tenantId,
              startAt: { lt: endAt },
              endAt: { gt: startAt },
              AND: [
                { OR: [{ providerId: null }, { providerId: rule.providerId }] },
                { OR: [{ branchId: null }, { branchId }] },
                { OR: [{ departmentId: null }, { departmentId }] },
                { OR: [{ serviceId: null }, { serviceId: service.id }] },
              ],
            },
            select: { id: true },
          });
          if (block) continue;

          const key = `${rule.providerId}:${startAt.toISOString()}`;
          if (slotKeys.has(key)) continue;
          slotKeys.add(key);

          slots.push({
            tenantId: query.tenantId,
            serviceId: service.id,
            providerId: rule.providerId,
            providerTitle: rule.provider.professionalTitle,
            specialty: rule.provider.specialty,
            branchId,
            departmentId,
            startAt: startAt.toISOString(),
            endAt: endAt.toISOString(),
            timeZone: rule.timeZone,
          });
        }
      }
    }

    return slots.sort((a, b) => a.startAt.localeCompare(b.startAt));
  }

  async createForPatient(userId: string, dto: CreatePatientAppointmentDto) {
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    const timeZone = dto.timeZone.trim();

    if (
      !Number.isFinite(startAt.getTime()) ||
      !Number.isFinite(endAt.getTime()) ||
      endAt <= startAt
    ) {
      throw new BadRequestException(
        'Appointment end time must be after its start time',
      );
    }

    if (startAt <= new Date()) {
      throw new BadRequestException(
        'Appointments must be booked for a future time',
      );
    }

    if (endAt.getTime() - startAt.getTime() > 12 * 60 * 60 * 1000) {
      throw new BadRequestException(
        'Appointment duration cannot exceed 12 hours',
      );
    }

    try {
      new Intl.DateTimeFormat('en-US', { timeZone }).format(startAt);
    } catch {
      throw new BadRequestException('A valid IANA time zone is required');
    }

    const db = this.database.client;
    const profile = await db.patientProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!profile) {
      throw new NotFoundException(
        'Create your Revaltrix patient profile before booking an appointment',
      );
    }

    const tenant = await db.tenant.findFirst({
      where: {
        id: dto.tenantId,
        status: RecordStatus.ACTIVE,
        deletedAt: null,
        setup: { is: { status: 'LIVE' } },
      },
      select: { id: true },
    });

    if (!tenant) {
      throw new NotFoundException('This facility is not currently bookable');
    }

    const patient = await db.patientTenantRecord.findFirst({
      where: {
        tenantId: dto.tenantId,
        patientProfileId: profile.id,
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!patient) {
      const existing = await db.patientTenantRecord.findFirst({
        where: {
          tenantId: dto.tenantId,
          patientProfileId: profile.id,
        },
        select: { status: true },
      });

      throw new ConflictException(
        existing
          ? `Your relationship with this facility is ${existing.status}. Contact the facility to complete registration before booking.`
          : 'You are not registered with this facility yet. Request facility registration before booking.',
      );
    }

    if (!dto.providerId) {
      throw new BadRequestException(
        'Select an available provider and appointment slot',
      );
    }
    const providerId = dto.providerId;

    const branchId = dto.branchId ?? null;
    const departmentId = dto.departmentId ?? null;

    await this.validateResources(
      dto.tenantId,
      dto,
      branchId,
      departmentId,
    );

    try {
      return await db.$transaction(
        async (tx) => {
          await this.validateProviderAvailability(
            tx,
            dto.tenantId,
            dto,
            branchId,
            departmentId,
            startAt,
            endAt,
            timeZone,
          );

          const conflict = await tx.appointment.findFirst({
            where: {
              tenantId: dto.tenantId,
              status: { notIn: TERMINAL_STATUSES },
              startAt: { lt: endAt },
              endAt: { gt: startAt },
              OR: [
                { patientTenantRecordId: patient.id },
                { providerId },
              ],
            },
            select: { id: true },
          });

          if (conflict) {
            throw new ConflictException(
              'The selected patient or provider has an overlapping appointment. Refresh availability and choose another slot.',
            );
          }

          const appointmentNumber =
            `APT-${new Date().getUTCFullYear()}-${randomUUID()
              .replace(/-/g, '')
              .slice(0, 12)
              .toUpperCase()}`;

          const appointment = await tx.appointment.create({
            data: {
              tenantId: dto.tenantId,
              patientTenantRecordId: patient.id,
              providerId,
              branchId,
              departmentId,
              serviceId: dto.serviceId,
              appointmentNumber,
              bookingSource: AppointmentBookingSource.PATIENT_PORTAL,
              startAt,
              endAt,
              timeZone,
              reason: dto.reason?.trim() || null,
              patientNotes: dto.patientNotes?.trim() || null,
              createdByUserId: userId,
              statusHistory: {
                create: {
                  tenantId: dto.tenantId,
                  fromStatus: null,
                  toStatus: AppointmentStatus.REQUESTED,
                  reason: 'Appointment requested through patient portal',
                  changedByUserId: userId,
                },
              },
            },
            include: {
              statusHistory: { orderBy: { createdAt: 'asc' } },
            },
          });

          await tx.auditEvent.create({
            data: {
              tenantId: dto.tenantId,
              branchId,
              actorUserId: userId,
              action: 'PATIENT_APPOINTMENT_REQUESTED',
              resourceType: 'APPOINTMENT',
              resourceId: appointment.id,
              outcome: 'SUCCESS',
              reason: 'Patient requested an appointment through the portal',
              metadata: {
                appointmentNumber,
                patientTenantRecordId: patient.id,
                providerId: appointment.providerId,
                branchId: appointment.branchId,
                departmentId: appointment.departmentId,
                serviceId: appointment.serviceId,
                startAt: startAt.toISOString(),
                endAt: endAt.toISOString(),
              },
            },
          });

          return appointment;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 30000,
          maxWait: 15000,
        },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2034') {
          throw new ConflictException(
            'Appointment availability changed concurrently. Refresh and try again.',
          );
        }
        if (error.code === 'P2002') {
          throw new ConflictException(
            'Appointment number collision. Please retry the request.',
          );
        }
      }
      throw error;
    }
  }

  async createForStaff(userId: string, dto: CreateAppointmentDto) {
    const context = await this.authorization.getContext(userId);
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    const timeZone = dto.timeZone.trim();

    if (
      !Number.isFinite(startAt.getTime()) ||
      !Number.isFinite(endAt.getTime()) ||
      endAt <= startAt
    ) {
      throw new BadRequestException(
        'Appointment end time must be after its start time',
      );
    }

    if (startAt <= new Date()) {
      throw new BadRequestException(
        'Appointments must be booked for a future time',
      );
    }

    try {
      new Intl.DateTimeFormat('en-US', { timeZone }).format(startAt);
    } catch {
      throw new BadRequestException('A valid IANA time zone is required');
    }

    const patient = await this.database.client.patientTenantRecord.findFirst({
      where: {
        id: dto.patientTenantRecordId,
        tenantId: context.tenantId,
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!patient) {
      throw new BadRequestException(
        'Patient must be an active patient of this facility',
      );
    }

    if (!dto.providerId && !dto.serviceId && !dto.departmentId) {
      throw new BadRequestException(
        'Select at least a provider, service, or department',
      );
    }

    const branchId = dto.branchId ?? context.branchId ?? null;
    const departmentId = dto.departmentId ?? context.departmentId ?? null;

    await this.validateResources(
      context.tenantId,
      dto,
      branchId,
      departmentId,
    );

    const durationMs = endAt.getTime() - startAt.getTime();
    if (durationMs > 12 * 60 * 60 * 1000) {
      throw new BadRequestException(
        'Appointment duration cannot exceed 12 hours',
      );
    }

    const reason = dto.reason?.trim() || null;
    const patientNotes = dto.patientNotes?.trim() || null;

    try {
      return await this.database.client.$transaction(
        async (tx) => {
          if (dto.providerId) {
            await this.validateProviderAvailability(
              tx,
              context.tenantId,
              dto,
              branchId,
              departmentId,
              startAt,
              endAt,
              timeZone,
            );
          }

          const conflict = await tx.appointment.findFirst({
            where: {
              tenantId: context.tenantId,
              status: { notIn: TERMINAL_STATUSES },
              startAt: { lt: endAt },
              endAt: { gt: startAt },
              OR: [
                { patientTenantRecordId: patient.id },
                ...(dto.providerId ? [{ providerId: dto.providerId }] : []),
              ],
            },
            select: { id: true, appointmentNumber: true },
          });

          if (conflict) {
            throw new ConflictException(
              'The selected patient or provider has an overlapping appointment',
            );
          }

          const appointmentNumber =
            `APT-${new Date().getUTCFullYear()}-${randomUUID()
              .replace(/-/g, '')
              .slice(0, 12)
              .toUpperCase()}`;

          const appointment = await tx.appointment.create({
            data: {
              tenantId: context.tenantId,
              patientTenantRecordId: patient.id,
              providerId: dto.providerId ?? null,
              branchId,
              departmentId,
              serviceId: dto.serviceId ?? null,
              appointmentNumber,
              bookingSource: AppointmentBookingSource.STAFF,
              startAt,
              endAt,
              timeZone,
              reason,
              patientNotes,
              createdByUserId: userId,
              statusHistory: {
                create: {
                  tenantId: context.tenantId,
                  fromStatus: null,
                  toStatus: AppointmentStatus.REQUESTED,
                  reason: 'Appointment created',
                  changedByUserId: userId,
                },
              },
            },
            include: {
              statusHistory: { orderBy: { createdAt: 'asc' } },
            },
          });

          await tx.auditEvent.create({
            data: {
              tenantId: context.tenantId,
              actorUserId: userId,
              branchId,
              action: 'APPOINTMENT_CREATED',
              resourceType: 'APPOINTMENT',
              resourceId: appointment.id,
              outcome: 'SUCCESS',
              reason: 'Appointment created',
              metadata: {
                appointmentNumber,
                patientTenantRecordId: patient.id,
                providerId: appointment.providerId,
                branchId: appointment.branchId,
                departmentId: appointment.departmentId,
                serviceId: appointment.serviceId,
                startAt: startAt.toISOString(),
                endAt: endAt.toISOString(),
              },
            },
          });

          return appointment;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 30000,
          maxWait: 15000,
        },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2034') {
          throw new ConflictException(
            'Appointment availability changed concurrently. Refresh and try again.',
          );
        }
        if (error.code === 'P2002') {
          throw new ConflictException(
            'Appointment number collision. Please retry the request.',
          );
        }
      }
      throw error;
    }
  }

  async listForPatient(userId: string) {
    const profile = await this.database.client.patientProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!profile) {
      throw new NotFoundException('Patient profile not found');
    }

    return this.database.client.appointment.findMany({
      where: {
        patientTenantRecord: {
          is: {
            patientProfileId: profile.id,
            deletedAt: null,
          },
        },
      },
      select: {
        id: true,
        appointmentNumber: true,
        status: true,
        startAt: true,
        endAt: true,
        timeZone: true,
        reason: true,
        createdAt: true,
        tenant: {
          select: {
            id: true,
            name: true,
            legalName: true,
          },
        },
        branch: {
          select: { id: true, name: true },
        },
        department: {
          select: { id: true, name: true },
        },
        service: {
          select: { id: true, name: true, code: true },
        },
        provider: {
          select: {
            professionalTitle: true,
            specialty: true,
          },
        },
      },
      orderBy: { startAt: 'desc' },
      take: 200,
    });
  }

  async listForStaff(userId: string, query: AppointmentQueryDto) {
    const context = await this.authorization.getContext(userId);

    if (
      query.from &&
      query.to &&
      new Date(query.from) > new Date(query.to)
    ) {
      throw new BadRequestException(
        'The from date must be before or equal to the to date',
      );
    }

    return this.database.client.appointment.findMany({
      where: {
        tenantId: context.tenantId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.patientTenantRecordId
          ? { patientTenantRecordId: query.patientTenantRecordId }
          : {}),
        ...(query.providerId ? { providerId: query.providerId } : {}),
        ...(query.branchId ? { branchId: query.branchId } : {}),
        ...(query.departmentId ? { departmentId: query.departmentId } : {}),
        ...(query.from || query.to
          ? {
              startAt: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { startAt: 'asc' },
      include: {
        patientTenantRecord: {
          select: { id: true, patientNumber: true },
        },
        provider: {
          select: {
            id: true,
            providerNumber: true,
            professionalTitle: true,
            specialty: true,
          },
        },
        branch: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        service: { select: { id: true, name: true, code: true } },
      },
      take: 200,
    });
  }

  async getForStaff(userId: string, appointmentId: string) {
    const context = await this.authorization.getContext(userId);

    const appointment = await this.database.client.appointment.findFirst({
      where: { id: appointmentId, tenantId: context.tenantId },
      include: {
        patientTenantRecord: {
          select: { id: true, patientNumber: true },
        },
        provider: {
          select: {
            id: true,
            providerNumber: true,
            professionalTitle: true,
            specialty: true,
          },
        },
        branch: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        service: { select: { id: true, name: true, code: true } },
        statusHistory: { orderBy: { createdAt: 'asc' } },
        encounter: { select: { id: true, encounterNumber: true, status: true } },
      },
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    return appointment;
  }

  async transitionForStaff(
    userId: string,
    appointmentId: string,
    toStatus: AppointmentStatus,
    dto: TransitionAppointmentDto = {},
  ) {
    const context = await this.authorization.getContext(userId);
    const reason = dto.reason?.trim() || null;
    const staffNotes = dto.staffNotes?.trim();

    return this.database.client.$transaction(
      async (tx) => {
        const appointment = await tx.appointment.findFirst({
          where: { id: appointmentId, tenantId: context.tenantId },
        });

        if (!appointment) {
          throw new NotFoundException('Appointment not found');
        }

        if (
          toStatus === AppointmentStatus.CHECKED_IN &&
          appointment.status === AppointmentStatus.CHECKED_IN
        ) {
          await this.encounters.ensureAppointmentEncounterCheckedIn(
            userId,
            tx,
            appointment,
            reason,
          );
          return appointment;
        }

        if (!TRANSITIONS[appointment.status]?.includes(toStatus)) {
          throw new BadRequestException(
            `Cannot transition appointment from ${appointment.status} to ${toStatus}`,
          );
        }

        if (
          toStatus === AppointmentStatus.CANCELLED &&
          !reason
        ) {
          throw new BadRequestException(
            'A cancellation reason is required',
          );
        }

        if (
          toStatus === AppointmentStatus.NO_SHOW &&
          appointment.endAt > new Date()
        ) {
          throw new BadRequestException(
            'An appointment cannot be marked no-show before its scheduled end',
          );
        }

        const updated = await tx.appointment.update({
          where: { id: appointment.id },
          data: {
            status: toStatus,
            ...(staffNotes !== undefined ? { staffNotes } : {}),
            ...(toStatus === AppointmentStatus.CANCELLED
              ? { cancellationReason: reason, cancelledAt: new Date() }
              : {}),
            ...(toStatus === AppointmentStatus.CHECKED_IN
              ? { checkedInAt: new Date() }
              : {}),
            statusHistory: {
              create: {
                tenantId: context.tenantId,
                fromStatus: appointment.status,
                toStatus,
                reason,
                changedByUserId: userId,
              },
            },
          },
        });

        if (toStatus === AppointmentStatus.CHECKED_IN) {
          await this.encounters.ensureAppointmentEncounterCheckedIn(
            userId,
            tx,
            appointment,
            reason,
          );
        }

        await tx.auditEvent.create({
          data: {
            tenantId: context.tenantId,
            actorUserId: userId,
            branchId: appointment.branchId ?? context.branchId,
            action: 'APPOINTMENT_STATUS_CHANGED',
            resourceType: 'APPOINTMENT',
            resourceId: appointment.id,
            outcome: 'SUCCESS',
            reason: reason ?? `Appointment transitioned to ${toStatus}`,
            metadata: {
              appointmentNumber: appointment.appointmentNumber,
              fromStatus: appointment.status,
              toStatus,
            },
          },
        });

        return updated;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 30000,
        maxWait: 15000,
      },
    ).catch((error: unknown) => {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      ) {
        throw new ConflictException(
          'Appointment changed concurrently. Refresh and try again.',
        );
      }
      throw error;
    });
  }

  private async validateResources(
    tenantId: string,
    dto: CreateAppointmentDto | CreatePatientAppointmentDto,
    branchId: string | null,
    departmentId: string | null,
  ) {
    const db = this.database.client;

    if (dto.providerId) {
      const provider = await db.providerProfile.findFirst({
        where: {
          id: dto.providerId,
          tenantId,
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

    if (branchId) {
      const branch = await db.branch.findFirst({
        where: {
          id: branchId,
          tenantId,
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

    if (departmentId) {
      const department = await db.department.findFirst({
        where: {
          id: departmentId,
          tenantId,
          status: RecordStatus.ACTIVE,
          deletedAt: null,
        },
        select: { id: true, branchId: true },
      });
      if (!department) {
        throw new BadRequestException(
          'Department does not belong to this facility or is not active',
        );
      }
      if (branchId && department.branchId && department.branchId !== branchId) {
        throw new BadRequestException(
          'Department does not belong to the selected branch',
        );
      }
    }

    if (dto.serviceId) {
      const service = await db.service.findFirst({
        where: {
          id: dto.serviceId,
          tenantId,
          status: RecordStatus.ACTIVE,
          deletedAt: null,
        },
        select: {
          id: true,
          branchId: true,
          departmentId: true,
          durationMin: true,
        },
      });

      if (!service) {
        throw new BadRequestException(
          'Service does not belong to this facility or is not active',
        );
      }

      if (branchId && service.branchId && service.branchId !== branchId) {
        throw new BadRequestException(
          'Service does not belong to the selected branch',
        );
      }

      if (
        departmentId &&
        service.departmentId &&
        service.departmentId !== departmentId
      ) {
        throw new BadRequestException(
          'Service does not belong to the selected department',
        );
      }

      if (
        service.durationMin &&
        Math.abs(
          new Date(dto.endAt).getTime() -
            new Date(dto.startAt).getTime() -
            service.durationMin * 60000,
        ) > 60000
      ) {
        throw new BadRequestException(
          'Appointment duration does not match the selected service duration',
        );
      }
    }
  }

  private async validateProviderAvailability(
    tx: Prisma.TransactionClient,
    tenantId: string,
    dto: CreateAppointmentDto | CreatePatientAppointmentDto,
    branchId: string | null,
    departmentId: string | null,
    startAt: Date,
    endAt: Date,
    timeZone: string,
  ) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(startAt);

    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((item) => item.type === type)?.value ?? '';

    const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      .indexOf(part('weekday'));
    const startMinute = Number(part('hour')) * 60 + Number(part('minute'));

    const endParts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(endAt);

    const endPart = (type: Intl.DateTimeFormatPartTypes) =>
      endParts.find((item) => item.type === type)?.value ?? '';

    const localStartDate = `${part('year')}-${part('month')}-${part('day')}`;
    const localEndDate =
      `${endPart('year')}-${endPart('month')}-${endPart('day')}`;

    if (
      localStartDate !== localEndDate ||
      weekday < 0 ||
      endAt.getTime() <= startAt.getTime()
    ) {
      throw new BadRequestException(
        'Appointments must fit within one local calendar day',
      );
    }

    const endMinute = Number(endPart('hour')) * 60 + Number(endPart('minute'));

    const rules = await tx.providerAvailability.findMany({
      where: {
        tenantId,
        providerId: dto.providerId!,
        isActive: true,
        // Filter by tenant/provider and active status here.
        // Day-of-week and effective dates are validated per rule time zone below.

        AND: [
          { OR: [{ branchId: null }, { branchId }] },
          { OR: [{ departmentId: null }, { departmentId }] },
          { OR: [{ serviceId: null }, { serviceId: dto.serviceId ?? null }] },
        ],
      },
    });

    const matchingRule = rules.find((rule) => {
      const ruleParts = new Intl.DateTimeFormat('en-CA', {
        timeZone: rule.timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(startAt);
      const getRulePart = (type: Intl.DateTimeFormatPartTypes) =>
        ruleParts.find((item) => item.type === type)?.value ?? '';
      const ruleDate =
        `${getRulePart('year')}-${getRulePart('month')}-${getRulePart('day')}`;
      const ruleWeekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
        .indexOf(getRulePart('weekday'));
      const ruleStartMinute =
        Number(getRulePart('hour')) * 60 + Number(getRulePart('minute'));

      const endRuleParts = new Intl.DateTimeFormat('en-CA', {
        timeZone: rule.timeZone,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(endAt);
      const endRuleMinute =
        Number(endRuleParts.find((item) => item.type === 'hour')?.value ?? '0') *
          60 +
        Number(endRuleParts.find((item) => item.type === 'minute')?.value ?? '0');

      const ruleEndDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: rule.timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(endAt);

      const effectiveDate = (date: Date) =>
        `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;

      const effectiveStart = effectiveDate(rule.effectiveFrom);
      const effectiveEnd = rule.effectiveTo
        ? effectiveDate(rule.effectiveTo)
        : null;

      return (
        ruleDate === ruleEndDate &&
        ruleWeekday === rule.dayOfWeek &&
        ruleDate >= effectiveStart &&
        (effectiveEnd === null || ruleDate <= effectiveEnd) &&
        ruleStartMinute >= rule.startMinute &&
        endRuleMinute <= rule.endMinute &&
        (rule.slotDurationMin == null ||
          durationMinutes(startAt, endAt) === rule.slotDurationMin)
      );
    });

    if (!matchingRule || endMinute <= startMinute) {
      throw new BadRequestException(
        'The selected provider has no matching availability for this time',
      );
    }

    const block = await tx.availabilityBlock.findFirst({
      where: {
        tenantId,
        startAt: { lt: endAt },
        endAt: { gt: startAt },
        AND: [
          { OR: [{ providerId: null }, { providerId: dto.providerId! }] },
          { OR: [{ branchId: null }, { branchId }] },
          { OR: [{ departmentId: null }, { departmentId }] },
          { OR: [{ serviceId: null }, { serviceId: dto.serviceId ?? null }] },
        ],
      },
      select: { id: true, reason: true },
    });

    if (block) {
      throw new ConflictException(
        block.reason || 'The requested time is blocked for scheduling',
      );
    }
  }
}

function durationMinutes(startAt: Date, endAt: Date): number {
  return (endAt.getTime() - startAt.getTime()) / 60000;
}
