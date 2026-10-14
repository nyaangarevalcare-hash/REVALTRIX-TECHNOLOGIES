import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import type {
  PatientListResponse,
  PatientTenantContext,
} from './types/patient.types.js';
import type { EnrollPatientDto } from './dto/enroll-patient.dto.js';
import type { RegisterPatientDto } from './dto/register-patient.dto.js';
import { VerificationService } from '../verification/verification.service.js';
import { QueuesService } from '../queues/queues.service.js';
import { PrivateObjectStorageService } from '../storage/private-object-storage.service.js';

@Injectable()
export class PatientsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly authorizationService: AuthorizationService,
    private readonly verificationService: VerificationService,
    private readonly queuesService: QueuesService,
    private readonly storage: PrivateObjectStorageService,
  ) {}

  private async getContext(
    userId: string,
  ): Promise<PatientTenantContext> {
    return this.authorizationService.getContext(userId);
  }

  private async generateUniquePatientNumber(
    tenantId: string,
  ): Promise<string> {
    const tenant = await this.database.client.tenant.findUnique({
      where: {
        id: tenantId,
      },
      select: {
        legalName: true,
        name: true,
      },
    });

    const rawName =
      tenant?.legalName?.trim() || tenant?.name?.trim() || 'HOSPITAL';
    const letters = rawName
      .replace(/[^A-Za-z]/g, '')
      .slice(0, 2)
      .toUpperCase();
    const prefix = letters.padEnd(2, 'X');

    for (let attempt = 0; attempt < 50; attempt += 1) {
      const suffix = String(Math.floor(10000 + Math.random() * 90000));
      const candidate = `${prefix}${suffix}`;

      const existing = await this.database.client.patientTenantRecord.findFirst({
        where: {
          tenantId,
          patientNumber: candidate,
          deletedAt: null,
        },
        select: { id: true },
      });

      if (!existing) {
        return candidate;
      }
    }

    throw new ConflictException(
      'Unable to generate a unique patient number for this organization',
    );
  }

  async getMyPatientProfile(userId: string) {
    const patient = await this.database.client.patientProfile.findUnique({
      where: {
        userId,
      },
      select: {
        id: true,
        platformPatientId: true,
        firstName: true,
        secondName: true,
        location: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
                displayName: true,
                status: true,
                identities: {
                  where: {
                    status: 'ACTIVE',
                  },
              select: {
                type: true,
                verifiedAt: true,
              },
              orderBy: {
                type: 'asc',
              },
            },
          },
        },
        tenantRecords: {
          where: {
            deletedAt: null,
          },
          select: {
            id: true,
            patientNumber: true,
            status: true,
            registeredAt: true,
            tenant: {
              select: {
                id: true,
                name: true,
                legalName: true,
                code: true,
                type: true,
                status: true,
              },
            },
          },
          orderBy: {
            registeredAt: 'desc',
          },
        },
        relationshipRequests: {
          where: {
            status: 'PENDING',
          },
          select: {
            id: true,
            status: true,
            reason: true,
            requestedAt: true,
            patientTenantRecord: {
              select: {
                id: true,
                patientNumber: true,
                status: true,
              },
            },
            requestingTenant: {
              select: {
                id: true,
                name: true,
                legalName: true,
                code: true,
                type: true,
                status: true,
              },
            },
            requestedByUser: {
              select: {
                displayName: true,
              },
            },
          },
          orderBy: {
            requestedAt: 'desc',
          },
        },
      },
    });

    if (!patient) {
      throw new NotFoundException(
        'Authenticated user is not a Revaltrix patient',
      );
    }

    if (
      patient.user.status !== 'ACTIVE'
    ) {
      throw new NotFoundException(
        'Patient account is not active',
      );
    }

    return {
      patient: {
        profileId: patient.id,
        platformPatientId: patient.platformPatientId,
        userId: patient.user.id,
        displayName: patient.user.displayName,
        firstName: patient.firstName,
        secondName: patient.secondName,
        location: patient.location,
        createdAt: patient.createdAt,
        updatedAt: patient.updatedAt,
      },
      identities: patient.user.identities.map((identity) => ({
        type: identity.type,
        verified: identity.verifiedAt !== null,
        verifiedAt: identity.verifiedAt,
      })),
      facilities: patient.tenantRecords.map((record) => ({
        patientRecordId: record.id,
        patientNumber: record.patientNumber,
        relationshipStatus: record.status,
        registeredAt: record.registeredAt,
        facility: {
          id: record.tenant.id,
          name: record.tenant.name,
          legalName: record.tenant.legalName,
          code: record.tenant.code,
          type: record.tenant.type,
          status: record.tenant.status,
        },
      })),
      pendingRelationshipRequests:
        patient.relationshipRequests.map((request) => ({
          id: request.id,
          status: request.status,
          reason: request.reason,
          requestedAt: request.requestedAt,
          patientRecord: {
            id: request.patientTenantRecord.id,
            patientNumber: request.patientTenantRecord.patientNumber,
            status: request.patientTenantRecord.status,
          },
          facility: {
            id: request.requestingTenant.id,
            name: request.requestingTenant.name,
            legalName: request.requestingTenant.legalName,
            code: request.requestingTenant.code,
            type: request.requestingTenant.type,
            status: request.requestingTenant.status,
          },
          requestedBy: {
            displayName: request.requestedByUser.displayName,
          },
        })),
    };
  }

  async getMyJourney(userId: string) {
    const patient = await this.database.client.patientProfile.findUnique({
      where: { userId },
      select: {
        id: true,
        user: {
          select: {
            status: true,
          },
        },
      },
    });

    if (!patient) {
      throw new NotFoundException(
        'Authenticated user is not a Revaltrix patient',
      );
    }

    if (patient.user.status !== 'ACTIVE') {
      throw new NotFoundException(
        'Patient account is not active',
      );
    }

    await this.queuesService.reconcilePatientJourneyEntries(userId);

    const journeys = await this.database.client.patientJourney.findMany({
      where: {
        patientTenantRecord: {
          patientProfileId: patient.id,
          deletedAt: null,
        },
        status: {
          in: ['ACTIVE', 'COMPLETED'],
        },
      },
      orderBy: {
        startedAt: 'desc',
      },
      select: {
        id: true,
        tenantId: true,
        tenant: {
          select: {
            id: true,
            name: true,
            legalName: true,
            code: true,
          },
        },
        status: true,
        startedAt: true,
        encounterId: true,
        steps: {
          orderBy: {
            sequence: 'asc',
          },
          select: {
            id: true,
            sequence: true,
            type: true,
            status: true,
            name: true,
            description: true,
            location: true,
            instruction: true,
            estimatedWaitMinutes: true,
            estimatedDurationMinutes: true,
            readyAt: true,
            startedAt: true,
            completedAt: true,
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
            queue: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
            queueEntry: {
              select: {
                id: true,
                queueId: true,
                queueNumber: true,
                priority: true,
                status: true,
                position: true,
                checkedInAt: true,
                calledAt: true,
                startedAt: true,
                completedAt: true,
                reason: true,
              },
            },
            handoffsTo: {
              orderBy: {
                createdAt: 'desc',
              },
              take: 1,
              select: {
                id: true,
                status: true,
                reason: true,
                instruction: true,
                createdAt: true,
                acceptedAt: true,
                fromDepartment: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
                toDepartment: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const queueScopes = journeys.flatMap((journey) => {
      const queueIds = [
        ...new Set(
          journey.steps.flatMap((step) =>
            step.queueEntry ? [step.queueEntry.queueId] : [],
          ),
        ),
      ];

      return queueIds.length
        ? [{ tenantId: journey.tenantId, queueId: { in: queueIds } }]
        : [];
    });
    const waitingEntries = queueScopes.length
      ? await this.database.client.queueEntry.findMany({
          where: {
            OR: queueScopes,
            status: {
              in: ['CREATED', 'WAITING'],
            },
          },
          orderBy: [
            { queueId: 'asc' },
            { position: 'asc' },
            { createdAt: 'asc' },
            { id: 'asc' },
          ],
          select: {
            id: true,
            queueId: true,
          },
        })
      : [];
    const currentPositions = new Map<string, number>();
    const queuePositions = new Map<string, number>();

    /*
     * Patient-visible clinical/care history.
     *
     * These records are deliberately loaded separately from the journey
     * query so the journey query remains efficient and the patient only
     * receives records belonging to their own patient profile.
     */
    const encounterIds = [
      ...new Set(
        journeys
          .map((journey) => journey.encounterId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const queueEntryIds = [
      ...new Set(
        journeys.flatMap((journey) =>
          journey.steps.flatMap((step) =>
            step.queueEntry ? [step.queueEntry.id] : [],
          ),
        ),
      ),
    ];

    const [careRecords, clinicalNotes] = await Promise.all([
      queueEntryIds.length
        ? this.database.client.queueCareRecord.findMany({
            where: {
              queueEntryId: {
                in: queueEntryIds,
              },
              tenantId: {
                in: journeys.map((journey) => journey.tenantId),
              },
              queueEntry: {
                patientTenantRecord: {
                  patientProfileId: patient.id,
                  deletedAt: null,
                },
              },
            },
            orderBy: {
              createdAt: 'asc',
            },
            select: {
              id: true,
              queueEntryId: true,
              encounterId: true,
              departmentId: true,
              note: true,
              procedures: true,
              documentUrl: true,
              createdAt: true,
              updatedAt: true,
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
          })
        : [],
      encounterIds.length
        ? this.database.client.clinicalNote.findMany({
            where: {
              encounterId: {
                in: encounterIds,
              },
              tenantId: {
                in: journeys.map((journey) => journey.tenantId),
              },
              patientTenantRecord: {
                patientProfileId: patient.id,
                deletedAt: null,
              },
              status: {
                in: ['SIGNED', 'FINAL', 'AMENDED'],
              },
            },
            orderBy: {
              createdAt: 'asc',
            },
            select: {
              id: true,
              encounterId: true,
              noteNumber: true,
              type: true,
              status: true,
              chiefComplaint: true,
              subjective: true,
              objective: true,
              assessment: true,
              plan: true,
              signedAt: true,
              finalizedAt: true,
              createdAt: true,
              updatedAt: true,
              authorProvider: {
                select: {
                  id: true,
                  providerNumber: true,
                },
              },
              versions: {
                orderBy: {
                  versionNumber: 'asc',
                },
                select: {
                  id: true,
                  versionNumber: true,
                  chiefComplaint: true,
                  subjective: true,
                  objective: true,
                  assessment: true,
                  plan: true,
                  amendmentReason: true,
                  signedAt: true,
                  finalizedAt: true,
                  createdAt: true,
                },
              },
            },
          })
        : [],
    ]);

    const careRecordsByQueueEntry = new Map<string, typeof careRecords>();
    for (const record of careRecords) {
      const existing = careRecordsByQueueEntry.get(record.queueEntryId) ?? [];
      existing.push(record);
      careRecordsByQueueEntry.set(record.queueEntryId, existing);
    }

    const clinicalNotesByEncounter = new Map<string, typeof clinicalNotes>();
    for (const note of clinicalNotes) {
      const existing = clinicalNotesByEncounter.get(note.encounterId) ?? [];
      existing.push(note);
      clinicalNotesByEncounter.set(note.encounterId, existing);
    }


    for (const entry of waitingEntries) {
      const position = (queuePositions.get(entry.queueId) ?? 0) + 1;
      queuePositions.set(entry.queueId, position);
      currentPositions.set(entry.id, position);
    }

    return {
      data: journeys.map((journey) => {
        const steps = journey.steps.map((step) => {
          if (!step.queueEntry) {
            return step;
          }

          return {
            ...step,
            queueEntry: {
              ...step.queueEntry,
              position:
                step.queueEntry.status === 'WAITING' ||
                step.queueEntry.status === 'CREATED'
                  ? currentPositions.get(step.queueEntry.id) ?? null
                  : null,
            },
            careRecords: careRecordsByQueueEntry.get(
              step.queueEntry.id,
            ) ?? [],
            clinicalNotes: journey.encounterId
              ? clinicalNotesByEncounter.get(journey.encounterId) ?? []
              : [],
          };
        });
        const currentIndex = journey.steps.findIndex(
          (step) =>
            step.status !== 'COMPLETED' &&
            step.status !== 'SKIPPED' &&
            step.status !== 'CANCELLED',
        );

        const current =
          currentIndex >= 0 ? steps[currentIndex] : null;

        if (
          current?.queueEntry &&
          current.queueEntry.status !== 'COMPLETED' &&
          current.queueEntry.status !== 'SKIPPED' &&
          current.queueEntry.status !== 'CANCELLED'
        ) {
          const queueEntry = current.queueEntry;

          if (
            queueEntry.status === 'WAITING' ||
            queueEntry.status === 'CREATED'
          ) {
            const position = queueEntry.position ?? 1;

            current.estimatedWaitMinutes =
              Math.max(position, 1) * 10;
            current.estimatedDurationMinutes = 10;
          } else if (
            queueEntry.status === 'CALLED' ||
            queueEntry.status === 'IN_SERVICE'
          ) {
            current.estimatedWaitMinutes = 0;
            current.estimatedDurationMinutes = 10;
          }
        }

        const next =
          currentIndex >= 0
            ? steps
                .slice(currentIndex + 1)
                .find(
                  (step) =>
                    step.status !== 'COMPLETED' &&
                    step.status !== 'SKIPPED' &&
                    step.status !== 'CANCELLED',
                ) ?? null
            : null;

        return {
          journey: {
            id: journey.id,
            status: journey.status,
            startedAt: journey.startedAt,
            encounterId: journey.encounterId,
            facility: journey.tenant,
          },
          current,
          next,
          future: next
            ? steps.filter(
                (step) => step.sequence > next.sequence,
              )
            : [],
          steps,
        };
      }),
    };
  }

  async getMyCareHistory(userId: string) {
    const patient = await this.database.client.patientProfile.findUnique({
      where: { userId },
      select: {
        id: true,
        user: {
          select: {
            status: true,
          },
        },
      },
    });

    if (!patient) {
      throw new NotFoundException(
        'Authenticated user is not a Revaltrix patient',
      );
    }

    if (patient.user.status !== 'ACTIVE') {
      throw new NotFoundException(
        'Patient account is not active',
      );
    }

    const journeys = await this.database.client.patientJourney.findMany({
      where: {
        patientTenantRecord: {
          patientProfileId: patient.id,
          deletedAt: null,
        },
        status: {
          in: ['ACTIVE', 'COMPLETED'],
        },
      },
      orderBy: {
        startedAt: 'desc',
      },
      select: {
        id: true,
        tenantId: true,
        status: true,
        startedAt: true,
        completedAt: true,
        encounterId: true,
        tenant: {
          select: {
            id: true,
            name: true,
            legalName: true,
            code: true,
          },
        },
        steps: {
          orderBy: {
            sequence: 'asc',
          },
          select: {
            id: true,
            sequence: true,
            type: true,
            status: true,
            name: true,
            description: true,
            location: true,
            instruction: true,
            readyAt: true,
            startedAt: true,
            completedAt: true,
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
            queueEntry: {
              select: {
                id: true,
                encounterId: true,
              },
            },
            handoffsFrom: {
              orderBy: {
                createdAt: 'asc',
              },
              select: {
                id: true,
                status: true,
                reason: true,
                instruction: true,
                createdAt: true,
                acceptedAt: true,
                completedAt: true,
                fromDepartment: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
                toDepartment: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
        handoffs: {
          orderBy: {
            createdAt: 'asc',
          },
          select: {
            id: true,
            status: true,
            reason: true,
            instruction: true,
            createdAt: true,
            acceptedAt: true,
            completedAt: true,
            fromDepartment: {
              select: {
                id: true,
                name: true,
              },
            },
            toDepartment: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    const queueEntryIds = [
      ...new Set(
        journeys.flatMap((journey) =>
          journey.steps.flatMap((step) =>
            step.queueEntry ? [step.queueEntry.id] : [],
          ),
        ),
      ),
    ];

    const encounterIds = [
      ...new Set(
        journeys
          .map((journey) => journey.encounterId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const [careRecords, clinicalNotes] = await Promise.all([
      queueEntryIds.length
        ? this.database.client.queueCareRecord.findMany({
            where: {
              queueEntryId: {
                in: queueEntryIds,
              },
              queueEntry: {
                patientTenantRecord: {
                  patientProfileId: patient.id,
                  deletedAt: null,
                },
              },
            },
            orderBy: {
              createdAt: 'asc',
            },
            select: {
              id: true,
              queueEntryId: true,
              encounterId: true,
              departmentId: true,
              note: true,
              procedures: true,
              createdAt: true,
              updatedAt: true,
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
          })
        : [],
      encounterIds.length
        ? this.database.client.clinicalNote.findMany({
            where: {
              encounterId: {
                in: encounterIds,
              },
              patientTenantRecord: {
                patientProfileId: patient.id,
                deletedAt: null,
              },
              status: {
                in: ['SIGNED', 'FINAL', 'AMENDED'],
              },
            },
            orderBy: {
              createdAt: 'asc',
            },
            select: {
              id: true,
              encounterId: true,
              type: true,
              status: true,
              chiefComplaint: true,
              subjective: true,
              objective: true,
              assessment: true,
              plan: true,
              signedAt: true,
              finalizedAt: true,
              createdAt: true,
              updatedAt: true,
              versions: {
                orderBy: {
                  versionNumber: 'asc',
                },
                select: {
                  versionNumber: true,
                  chiefComplaint: true,
                  subjective: true,
                  objective: true,
                  assessment: true,
                  plan: true,
                  amendmentReason: true,
                  signedAt: true,
                  finalizedAt: true,
                  createdAt: true,
                },
              },
            },
          })
        : [],
    ]);

    const careRecordsByQueueEntry = new Map<string, typeof careRecords>();

    for (const record of careRecords) {
      const records =
        careRecordsByQueueEntry.get(record.queueEntryId) ?? [];

      records.push(record);
      careRecordsByQueueEntry.set(record.queueEntryId, records);
    }

    const clinicalNotesByEncounter = new Map<
      string,
      typeof clinicalNotes
    >();

    for (const note of clinicalNotes) {
      const notes =
        clinicalNotesByEncounter.get(note.encounterId) ?? [];

      notes.push(note);
      clinicalNotesByEncounter.set(note.encounterId, notes);
    }

    return {
      data: journeys.map((journey) => {
        const departmentSteps = journey.steps
          .filter(
            (step) =>
              step.type === 'SERVICE' ||
              step.type === 'CHECK_IN',
          )
          .map((step) => {
            const care =
              step.queueEntry
                ? careRecordsByQueueEntry.get(
                    step.queueEntry.id,
                  ) ?? []
                : [];

            return {
              sequence: step.sequence,
              type: step.type,
              status: step.status,
              name: step.name,
              description: step.description,
              location: step.location,
              instruction: step.instruction,
              branch: step.branch,
              department: step.department,

              startedAt: step.startedAt,
              completedAt: step.completedAt,

              care: care.map((record) => ({
                department: record.department,
                note: record.note,
                procedures: record.procedures,
                recordedAt: record.createdAt,
                updatedAt: record.updatedAt,
                attachments: record.attachments.map(
                  (attachment) => ({
                    id: attachment.id,
                    fileName: attachment.fileName,
                    contentType: attachment.contentType,
                    byteSize: attachment.byteSize,
                    createdAt: attachment.createdAt,
                  }),
                ),
              })),

              referrals: step.handoffsFrom.map((handoff) => ({
                status: handoff.status,
                fromDepartment:
                  handoff.fromDepartment?.name ?? null,
                toDepartment:
                  handoff.toDepartment?.name ?? null,
                reason: handoff.reason,
                instruction: handoff.instruction,
                createdAt: handoff.createdAt,
                acceptedAt: handoff.acceptedAt,
                completedAt: handoff.completedAt,
              })),
            };
          });

        return {
          journeyId: journey.id,
          facility: {
            name: journey.tenant.name,
            legalName: journey.tenant.legalName,
            code: journey.tenant.code,
          },

          date: journey.startedAt,
          status: journey.status,

          clinicalNotes: journey.encounterId
            ? (
                clinicalNotesByEncounter.get(
                  journey.encounterId,
                ) ?? []
              ).map((note) => ({
                type: note.type,
                status: note.status,
                chiefComplaint: note.chiefComplaint,
                subjective: note.subjective,
                objective: note.objective,
                assessment: note.assessment,
                plan: note.plan,
                signedAt: note.signedAt,
                finalizedAt: note.finalizedAt,
                createdAt: note.createdAt,
                updatedAt: note.updatedAt,
                versions: note.versions.map((version) => ({
                  versionNumber: version.versionNumber,
                  chiefComplaint: version.chiefComplaint,
                  subjective: version.subjective,
                  objective: version.objective,
                  assessment: version.assessment,
                  plan: version.plan,
                  amendmentReason: version.amendmentReason,
                  signedAt: version.signedAt,
                  finalizedAt: version.finalizedAt,
                  createdAt: version.createdAt,
                })),
              }))
            : [],

          departments: departmentSteps,

          referrals: journey.handoffs.map((handoff) => ({
            status: handoff.status,
            fromDepartment:
              handoff.fromDepartment?.name ?? null,
            toDepartment:
              handoff.toDepartment?.name ?? null,
            reason: handoff.reason,
            instruction: handoff.instruction,
            createdAt: handoff.createdAt,
            acceptedAt: handoff.acceptedAt,
            completedAt: handoff.completedAt,
          })),
        };
      }),
    };
  }

  async viewMyCareAttachment(userId: string, attachmentId: string) {
    const patient = await this.database.client.patientProfile.findUnique({
      where: { userId },
      select: {
        id: true,
        user: {
          select: {
            status: true,
          },
        },
      },
    });

    if (!patient || patient.user.status !== 'ACTIVE') {
      throw new NotFoundException('Patient account is not available');
    }

    const attachment = await this.database.client.queueCareAttachment.findFirst({
      where: {
        id: attachmentId,
        careRecord: {
          queueEntry: {
            patientTenantRecord: {
              patientProfileId: patient.id,
              deletedAt: null,
            },
          },
        },
      },
      select: {
        storageKey: true,
        fileName: true,
        contentType: true,
        byteSize: true,
      },
    });

    if (!attachment) {
      throw new NotFoundException('Care attachment not found');
    }

    return {
      ...attachment,
      buffer: await this.storage.get(attachment.storageKey),
    };
  }

  async list(
    userId: string,
    query: {
      search?: string;
      status?: 'ALL' | 'PENDING' | 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'ARCHIVED';
      page?: number;
      pageSize?: number;
    },
  ): Promise<PatientListResponse> {
    const context = await this.getContext(userId);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const search = query.search?.trim();

    const where = {
      tenantId: context.tenantId,
      ...(query.status && query.status !== 'ALL'
        ? { status: query.status }
        : {}),
      deletedAt: null,
      ...(search
        ? {
            OR: [
              {
                patientNumber: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
              {
                patientProfile: {
                  firstName: {
                    contains: search,
                    mode: 'insensitive' as const,
                  },
                },
              },
              {
                patientProfile: {
                  secondName: {
                    contains: search,
                    mode: 'insensitive' as const,
                  },
                },
              },
              {
                patientProfile: {
                  user: {
                    displayName: {
                      contains: search,
                      mode: 'insensitive' as const,
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [total, records] = await Promise.all([
      this.database.client.patientTenantRecord.count({ where }),
      this.database.client.patientTenantRecord.findMany({
        where,
        select: {
          id: true,
          patientNumber: true,
          status: true,
          registeredAt: true,
          patientProfile: {
            select: {
              id: true,
              userId: true,
              platformPatientId: true,
              firstName: true,
              secondName: true,
              location: true,
              user: {
                select: {
                  displayName: true,
                },
              },
            },
          },
        },
        orderBy: {
          registeredAt: 'desc',
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      data: records.map((record) => ({
        id: record.id,
        patientNumber: record.patientNumber,
        status: record.status,
        registeredAt: record.registeredAt,
        patient: {
          profileId: record.patientProfile.id,
          platformPatientId: record.patientProfile.platformPatientId,
          userId: record.patientProfile.userId,
          firstName: record.patientProfile.firstName,
          secondName: record.patientProfile.secondName,
          location: record.patientProfile.location,
          displayName: record.patientProfile.user.displayName,
        },
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async search(
    userId: string,
    query: string,
  ) {
    const context = await this.getContext(userId);
    const search = query.trim();

    if (search.length < 2) {
      return {
        data: [],
      };
    }

    const records = await this.database.client.patientTenantRecord.findMany({
      where: {
        tenantId: context.tenantId,
        status: 'ACTIVE',
        deletedAt: null,
        OR: [
          {
            patientNumber: {
              contains: search,
              mode: 'insensitive',
            },
          },
          {
            patientProfile: {
              firstName: {
                contains: search,
                mode: 'insensitive',
              },
            },
          },
          {
            patientProfile: {
              secondName: {
                contains: search,
                mode: 'insensitive',
              },
            },
          },
          {
            patientProfile: {
              user: {
                displayName: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
            },
          },
          {
            patientProfile: {
              user: {
                identities: {
                  some: {
                    status: 'ACTIVE',
                    value: {
                      contains: search,
                      mode: 'insensitive',
                    },
                  },
                },
              },
            },
          },
        ],
      },
      select: {
        id: true,
        patientNumber: true,
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
      orderBy: {
        registeredAt: 'desc',
      },
      take: 20,
    });

    return {
      data: records.map((record) => ({
        id: record.id,
        patientNumber: record.patientNumber,
        patient: {
          profileId: record.patientProfile.id,
          firstName: record.patientProfile.firstName,
          secondName: record.patientProfile.secondName,
          displayName: record.patientProfile.user.displayName,
        },
      })),
    };
  }

  async getById(
    userId: string,
    patientRecordId: string,
  ) {
    const context = await this.getContext(userId);

    const record =
      await this.database.client.patientTenantRecord.findFirst({
        where: {
          id: patientRecordId,
          tenantId: context.tenantId,
          deletedAt: null,
        },
        select: {
          id: true,
          patientNumber: true,
          status: true,
          registeredAt: true,
          createdAt: true,
          updatedAt: true,
          patientProfile: {
            select: {
              id: true,
              userId: true,
              platformPatientId: true,
              firstName: true,
              secondName: true,
              location: true,
              user: {
                select: {
                  id: true,
                  displayName: true,
                  username: true,
                  status: true,
                  identities: {
                    where: {
                      status: 'ACTIVE',
                    },
                    select: {
                      type: true,
                      value: true,
                      verifiedAt: true,
                    },
                    orderBy: {
                      type: 'asc',
                    },
                  },
                },
              },
            },
          },
          relationshipRequests: {
            where: { status: 'PENDING' },
            select: { id: true },
          },
        },
      });

    if (!record) {
      throw new NotFoundException('Patient record not found');
    }

    const registration =
      await this.database.client.registration.findFirst({
        where: {
          userId: record.patientProfile.userId,
          tenantId: context.tenantId,
          type: 'PATIENT',
          status: 'VERIFICATION_REQUIRED',
          verificationStatus: 'PENDING',
        },
        select: { id: true },
      });

    return {
      ...record,
      registrationVerificationPending: Boolean(registration),
      relationshipApprovalPending: record.relationshipRequests.length > 0,
    };
  }

  async sendPatientRegistrationVerification(
    userId: string,
    patientRecordId: string,
  ) {
    const context = await this.getContext(userId);

    return this.verificationService.sendStaffPatientRegistrationVerification(
      patientRecordId,
      context.tenantId,
    );
  }

  async registerPatient(
    userId: string,
    dto: RegisterPatientDto,
  ) {
    const context = await this.getContext(userId);

    const firstName = dto.firstName.trim();
    const secondName = dto.secondName.trim();
    const email = dto.email?.trim().toLowerCase();
    const phone = dto.phone?.trim().replace(/[^\\d+]/g, '');
    const patientNumber =
      (dto.patientNumber?.trim() ||
        (await this.generateUniquePatientNumber(context.tenantId)))
        .toUpperCase();

    if (!firstName || !secondName) {
      throw new ConflictException(
        'Patient first name and second name are required',
      );
    }

    if (!email) {
      throw new ConflictException(
        'Patient email is required for registration verification',
      );
    }

    if (dto.verificationChannel !== 'EMAIL') {
      throw new ConflictException(
        'Patient registration verification must use email',
      );
    }

    const identityChecks = [];

    if (email) {
      identityChecks.push({
        type: 'EMAIL' as const,
        normalizedValue: email,
      });
    }

    if (phone) {
      identityChecks.push({
        type: 'PHONE' as const,
        normalizedValue: phone,
      });
    }

    const existingIdentity =
      await this.database.client.identity.findFirst({
        where: {
          OR: identityChecks,
          status: 'ACTIVE',
        },
        select: {
          type: true,
        },
      });

    if (existingIdentity) {
      throw new ConflictException(
        `${existingIdentity.type === 'EMAIL' ? 'Email' : 'Phone'} is already registered`,
      );
    }

    const numberExists =
      await this.database.client.patientTenantRecord.findFirst({
        where: {
          tenantId: context.tenantId,
          patientNumber,
          deletedAt: null,
        },
        select: {
          id: true,
        },
      });

    if (numberExists) {
      throw new ConflictException(
        'Patient number is already in use by this organization',
      );
    }

    const result =
      await this.database.client.$transaction(
        async (transaction) => {
          const user = await transaction.user.create({
            data: {
              displayName: `${firstName} ${secondName}`,
            },
            select: {
              id: true,
              displayName: true,
            },
          });

          if (email) {
            await transaction.identity.create({
              data: {
                userId: user.id,
                type: 'EMAIL',
                value: dto.email!.trim(),
                normalizedValue: email,
              },
            });
          }

          if (phone) {
            await transaction.identity.create({
              data: {
                userId: user.id,
                type: 'PHONE',
                value: dto.phone!.trim(),
                normalizedValue: phone,
              },
            });
          }

          const profile =
            await transaction.patientProfile.create({
              data: {
                userId: user.id,
                firstName,
                secondName,
                location: dto.location?.trim() || null,
              },
              select: {
                id: true,
              },
            });

          const patientRecord =
            await transaction.patientTenantRecord.create({
              data: {
                patientProfileId: profile.id,
                tenantId: context.tenantId,
                patientNumber,
                status: 'PENDING',
                createdByUserId: userId,
              },
              select: {
                id: true,
                patientNumber: true,
                status: true,
                registeredAt: true,
              },
            });

          const registration =
            await transaction.registration.create({
              data: {
                userId: user.id,
                tenantId: context.tenantId,
                type: 'PATIENT',
                status: 'VERIFICATION_REQUIRED',
                verificationStatus: 'PENDING',
                onboardingStatus: 'NOT_STARTED',
                expiresAt: new Date(
                  Date.now() + 24 * 60 * 60 * 1000,
                ),
              },
              select: {
                id: true,
                status: true,
                verificationStatus: true,
                onboardingStatus: true,
                expiresAt: true,
              },
            });

          await transaction.patientDataSubmission.create({
            data: {
              patientProfileId: profile.id,
              patientTenantRecordId: patientRecord.id,
              tenantId: context.tenantId,
              submittedByUserId: userId,
              source: 'RECEPTION_REGISTRATION',
              data: {
                firstName,
                secondName,
                email: email ?? null,
                phone: phone ?? null,
                location: dto.location?.trim() || null,
                patientNumber,
                verificationChannel:
                  dto.verificationChannel,
              },
            },
          });

          await transaction.auditEvent.create({
            data: {
              tenantId: context.tenantId,
              actorUserId: userId,
              branchId: context.branchId,
              action: 'PATIENT_REGISTRATION_CREATED',
              resourceType: 'PATIENT_TENANT_RECORD',
              resourceId: patientRecord.id,
              outcome: 'SUCCESS',
              reason: 'New patient registered by authorized hospital staff',
              metadata: {
                patientProfileId: profile.id,
                registrationId: registration.id,
                verificationChannel:
                  dto.verificationChannel,
              },
            },
          });

          return {
            userId: user.id,
            patientProfileId: profile.id,
            patientRecord,
            registration,
          };
        },
      );

    let verification;

    try {
      verification =
        await this.verificationService.createRegistrationVerification(
          result.userId,
          dto.verificationChannel,
        );
    } catch (error) {
      await this.database.client.$transaction(async (transaction) => {
        await transaction.patientTenantRecord.update({
          where: {
            id: result.patientRecord.id,
          },
          data: {
            status: 'SUSPENDED',
          },
        });

        await transaction.registration.update({
          where: {
            id: result.registration.id,
          },
          data: {
            status: 'CANCELLED',
          },
        });

        await transaction.auditEvent.create({
          data: {
            tenantId: context.tenantId,
            actorUserId: userId,
            branchId: context.branchId,
            action: 'PATIENT_REGISTRATION_VERIFICATION_FAILED',
            resourceType: 'PATIENT_TENANT_RECORD',
            resourceId: result.patientRecord.id,
            outcome: 'FAILURE',
            reason: 'Verification challenge could not be created or delivered',
            metadata: {
              registrationId: result.registration.id,
            },
          },
        });
      });

      throw error;
    }

    return {
      patientRecordId: result.patientRecord.id,
      patientProfileId: result.patientProfileId,
      patientNumber: result.patientRecord.patientNumber,
      status: result.patientRecord.status,
      registrationId: result.registration.id,
      verificationStatus: result.registration.verificationStatus,
      verification: {
        challengeId: verification.challengeId,
        channel: verification.channel,
        target: verification.target,
        expiresAt: verification.expiresAt,
        deliveryStatus: verification.deliveryStatus,
      },
    };
  }

  async listPatientRelationshipRequests(
    userId: string,
  ) {
    const profile =
      await this.database.client.patientProfile.findUnique({
        where: {
          userId,
        },
        select: {
          id: true,
          platformPatientId: true,
        },
      });

    if (!profile) {
      throw new NotFoundException(
        'Authenticated user is not a Revaltrix patient',
      );
    }

    const requests =
      await this.database.client.patientTenantRelationshipRequest.findMany({
        where: {
          patientProfileId: profile.id,
          status: 'PENDING',
        },
        orderBy: {
          requestedAt: 'desc',
        },
        select: {
          id: true,
          status: true,
          reason: true,
          requestedAt: true,
          patientTenantRecord: {
            select: {
              id: true,
              patientNumber: true,
              status: true,
            },
          },
          requestingTenant: {
            select: {
              id: true,
              name: true,
              legalName: true,
              code: true,
              type: true,
            },
          },
          requestedByUser: {
            select: {
              id: true,
              displayName: true,
            },
          },
        },
      });

    return {
      data: requests.map((request) => ({
        id: request.id,
        status: request.status,
        reason: request.reason,
        requestedAt: request.requestedAt,
        patientRecord: {
          id: request.patientTenantRecord.id,
          patientNumber:
            request.patientTenantRecord.patientNumber,
          status: request.patientTenantRecord.status,
        },
        facility: {
          id: request.requestingTenant.id,
          name: request.requestingTenant.name,
          legalName: request.requestingTenant.legalName,
          code: request.requestingTenant.code,
          type: request.requestingTenant.type,
        },
        requestedBy: {
          id: request.requestedByUser.id,
          displayName:
            request.requestedByUser.displayName,
        },
      })),
    };
  }

  async approvePatientRelationshipRequest(
    userId: string,
    requestId: string,
  ) {
    const profile =
      await this.database.client.patientProfile.findUnique({
        where: {
          userId,
        },
        select: {
          id: true,
          platformPatientId: true,
        },
      });

    if (!profile) {
      throw new NotFoundException(
        'Authenticated user is not a Revaltrix patient',
      );
    }

    const result =
      await this.database.client.$transaction(
        async (transaction) => {
          const request =
            await transaction.patientTenantRelationshipRequest.findFirst({
              where: {
                id: requestId,
                patientProfileId: profile.id,
                status: 'PENDING',
              },
              select: {
                id: true,
                patientProfileId: true,
                patientTenantRecordId: true,
                requestingTenantId: true,
              },
            });

          if (!request) {
            throw new NotFoundException(
              'Pending patient relationship request was not found',
            );
          }

          const claimed =
            await transaction.patientTenantRelationshipRequest.updateMany({
              where: {
                id: request.id,
                patientProfileId: profile.id,
                status: 'PENDING',
              },
              data: {
                status: 'APPROVED',
                respondedByUserId: userId,
                respondedAt: new Date(),
              },
            });

          if (claimed.count !== 1) {
            throw new ConflictException(
              'Patient relationship request has already been processed',
            );
          }

          const patientRecord =
            await transaction.patientTenantRecord.updateMany({
              where: {
                id: request.patientTenantRecordId,
                patientProfileId: profile.id,
                tenantId: request.requestingTenantId,
                status: 'PENDING',
                deletedAt: null,
              },
              data: {
                status: 'ACTIVE',
              },
            });

          if (patientRecord.count !== 1) {
            throw new ConflictException(
              'The pending patient facility relationship is no longer available',
            );
          }

          await transaction.auditEvent.create({
            data: {
              tenantId: request.requestingTenantId,
              actorUserId: userId,
              action:
                'PATIENT_RELATIONSHIP_REQUEST_APPROVED',
              resourceType:
                'PATIENT_TENANT_RELATIONSHIP_REQUEST',
              resourceId: request.id,
              outcome: 'SUCCESS',
              reason:
                'Patient approved the facility relationship request.',
              metadata: {
                patientProfileId: profile.id,
                platformPatientId:
                  profile.platformPatientId,
                patientTenantRecordId:
                  request.patientTenantRecordId,
              },
            },
          });

          return {
            requestId: request.id,
            patientTenantRecordId:
              request.patientTenantRecordId,
            tenantId: request.requestingTenantId,
          };
        },
      );

    return {
      requestId: result.requestId,
      status: 'APPROVED',
      patientTenantRecordId:
        result.patientTenantRecordId,
      relationshipStatus: 'ACTIVE',
    };
  }

  async declinePatientRelationshipRequest(
    userId: string,
    requestId: string,
    reason?: string,
  ) {
    const profile =
      await this.database.client.patientProfile.findUnique({
        where: {
          userId,
        },
        select: {
          id: true,
          platformPatientId: true,
        },
      });

    if (!profile) {
      throw new NotFoundException(
        'Authenticated user is not a Revaltrix patient',
      );
    }

    const responseReason = reason?.trim() || null;

    const result =
      await this.database.client.$transaction(
        async (transaction) => {
          const request =
            await transaction.patientTenantRelationshipRequest.findFirst({
              where: {
                id: requestId,
                patientProfileId: profile.id,
                status: 'PENDING',
              },
              select: {
                id: true,
                patientTenantRecordId: true,
                requestingTenantId: true,
              },
            });

          if (!request) {
            throw new NotFoundException(
              'Pending patient relationship request was not found',
            );
          }

          const claimed =
            await transaction.patientTenantRelationshipRequest.updateMany({
              where: {
                id: request.id,
                patientProfileId: profile.id,
                status: 'PENDING',
              },
              data: {
                status: 'DENIED',
                respondedByUserId: userId,
                respondedAt: new Date(),
                ...(responseReason !== null
                  ? { responseReason }
                  : {}),
              },
            });

          if (claimed.count !== 1) {
            throw new ConflictException(
              'Patient relationship request has already been processed',
            );
          }

          const patientRecord =
            await transaction.patientTenantRecord.updateMany({
              where: {
                id: request.patientTenantRecordId,
                patientProfileId: profile.id,
                tenantId: request.requestingTenantId,
                status: 'PENDING',
                deletedAt: null,
              },
              data: {
                status: 'INACTIVE',
              },
            });

          if (patientRecord.count !== 1) {
            throw new ConflictException(
              'The pending patient facility relationship is no longer available',
            );
          }

          await transaction.auditEvent.create({
            data: {
              tenantId: request.requestingTenantId,
              actorUserId: userId,
              action:
                'PATIENT_RELATIONSHIP_REQUEST_DECLINED',
              resourceType:
                'PATIENT_TENANT_RELATIONSHIP_REQUEST',
              resourceId: request.id,
              outcome: 'SUCCESS',
              reason:
                responseReason ??
                'Patient declined the facility relationship request.',
              metadata: {
                patientProfileId: profile.id,
                platformPatientId:
                  profile.platformPatientId,
                patientTenantRecordId:
                  request.patientTenantRecordId,
              },
            },
          });

          return {
            requestId: request.id,
            patientTenantRecordId:
              request.patientTenantRecordId,
          };
        },
      );

    return {
      requestId: result.requestId,
      status: 'DENIED',
      patientTenantRecordId:
        result.patientTenantRecordId,
      relationshipStatus: 'INACTIVE',
    };
  }

  async findExistingPatient(
    userId: string,
    identifier: string,
  ) {
    const context = await this.getContext(userId);

    const rawIdentifier = identifier.trim();

    if (!rawIdentifier) {
      throw new ConflictException(
        'Patient email or phone number is required',
      );
    }

    const normalizedIdentifiers = [
      rawIdentifier.toLowerCase(),
      rawIdentifier.replace(/[^\d+]/g, ''),
    ].filter((value, index, values) => values.indexOf(value) === index);

    const identity =
      await this.database.client.identity.findFirst({
        where: {
          normalizedValue: {
            in: normalizedIdentifiers,
          },
          status: 'ACTIVE',
          user: {
            status: 'ACTIVE',
            deletedAt: null,
            patientProfile: {
              isNot: null,
            },
          },
        },
        select: {
          type: true,
          user: {
            select: {
              id: true,
              displayName: true,
              patientProfile: {
                select: {
                  id: true,
                  platformPatientId: true,
                  firstName: true,
                  secondName: true,
                  location: true,
                  tenantRecords: {
                    where: {
                      tenantId: context.tenantId,
                      deletedAt: null,
                    },
                    select: {
                      id: true,
                      patientNumber: true,
                      status: true,
                      relationshipRequests: {
                        where: {
                          status: 'PENDING',
                        },
                        select: {
                          id: true,
                        },
                        take: 1,
                      },
                    },
                    take: 1,
                  },
                },
              },
            },
          },
        },
      });

    if (!identity?.user.patientProfile) {
      throw new NotFoundException(
        'No Revaltrix patient was found with that email or phone number',
      );
    }

    const profile = identity.user.patientProfile;

    const existingFacilityRecord =
      profile.tenantRecords[0] ?? null;

    return {
      found: true,
      alreadyRegisteredWithOrganization:
        existingFacilityRecord !== null &&
        existingFacilityRecord.relationshipRequests.length === 0,
      relationshipPending:
        (existingFacilityRecord?.relationshipRequests.length ?? 0) > 0,
      patient: {
        patientProfileId: profile.id,
        platformPatientId: profile.platformPatientId,
        firstName: profile.firstName,
        secondName: profile.secondName,
        displayName: identity.user.displayName,
        location: profile.location,
      },
      existingFacilityRecord: existingFacilityRecord
        ? {
            id: existingFacilityRecord.id,
            patientNumber:
              existingFacilityRecord.patientNumber,
            status: existingFacilityRecord.status,
          }
        : null,
    };
  }

  async enrollPatient(
    userId: string,
    dto: EnrollPatientDto,
  ) {
    const context = await this.getContext(userId);

    const platformPatientId = dto.platformPatientId.trim();
    const patientNumber =
      dto.patientNumber?.trim() ||
      (await this.generateUniquePatientNumber(context.tenantId));

    if (!platformPatientId) {
      throw new ConflictException(
        'Platform patient ID is required',
      );
    }

    const result = await this.database.client.$transaction(
      async (transaction) => {
        const profile =
          await transaction.patientProfile.findUnique({
            where: {
              platformPatientId,
            },
            select: {
              id: true,
              platformPatientId: true,
              firstName: true,
              secondName: true,
              userId: true,
              user: {
                select: {
                  id: true,
                  displayName: true,
                  status: true,
                  deletedAt: true,
                },
              },
            },
          });

        if (
          !profile ||
          profile.user.status !== 'ACTIVE' ||
          profile.user.deletedAt !== null
        ) {
          throw new NotFoundException(
            'Revaltrix patient could not be found',
          );
        }

        const existing =
          await transaction.patientTenantRecord.findFirst({
            where: {
              tenantId: context.tenantId,
              patientProfileId: profile.id,
              deletedAt: null,
            },
            select: {
              id: true,
              status: true,
              relationshipRequests: {
                where: {
                  status: 'PENDING',
                },
                select: {
                  id: true,
                },
                take: 1,
              },
            },
          });

        if (existing) {
          throw new ConflictException(
            existing.relationshipRequests.length > 0
              ? 'A patient relationship request is already pending for this organization'
              : 'Patient is already registered with this organization',
          );
        }

        const numberExists =
          await transaction.patientTenantRecord.findFirst({
            where: {
              tenantId: context.tenantId,
              patientNumber,
              deletedAt: null,
            },
            select: {
              id: true,
            },
          });

        if (numberExists) {
          throw new ConflictException(
            'Patient number is already in use by this organization',
          );
        }

        const record =
          await transaction.patientTenantRecord.create({
            data: {
              patientProfileId: profile.id,
              tenantId: context.tenantId,
              patientNumber,
              status: 'PENDING',
              createdByUserId: userId,
            },
            select: {
              id: true,
              patientNumber: true,
              status: true,
              registeredAt: true,
              patientProfile: {
                select: {
                  id: true,
                  platformPatientId: true,
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
          });

        const relationshipRequest =
          await transaction.patientTenantRelationshipRequest.create({
            data: {
              patientProfileId: profile.id,
              patientTenantRecordId: record.id,
              requestingTenantId: context.tenantId,
              requestedByUserId: userId,
              status: 'PENDING',
              reason:
                'Facility requested a relationship with this existing Revaltrix patient.',
            },
            select: {
              id: true,
              status: true,
              requestedAt: true,
            },
          });

        await transaction.patientDataSubmission.create({
          data: {
            patientProfileId: profile.id,
            patientTenantRecordId: record.id,
            tenantId: context.tenantId,
            submittedByUserId: userId,
            source: 'FACILITY_ENROLLMENT_REQUEST',
            data: {
              platformPatientId,
              patientNumber,
              relationshipStatus: 'PENDING',
              relationshipRequestId: relationshipRequest.id,
            },
          },
        });

        await transaction.auditEvent.create({
          data: {
            tenantId: context.tenantId,
            actorUserId: userId,
            branchId: context.branchId,
            action: 'PATIENT_ENROLLMENT_REQUESTED',
            resourceType: 'PATIENT_TENANT_RECORD',
            resourceId: record.id,
            outcome: 'SUCCESS',
            reason:
              'Facility requested a relationship with an existing Revaltrix patient',
            metadata: {
              patientProfileId: profile.id,
              platformPatientId,
              patientNumber,
              relationshipStatus: 'PENDING',
              relationshipRequestId: relationshipRequest.id,
            },
          },
        });

        return {
          record,
          relationshipRequest,
        };
      },
    );

    return {
      patientRecordId: result.record.id,
      patientProfileId: result.record.patientProfile.id,
      platformPatientId:
        result.record.patientProfile.platformPatientId,
      patientNumber: result.record.patientNumber,
      status: result.record.status,
      registeredAt: result.record.registeredAt,
      relationshipRequestId: result.relationshipRequest.id,
      relationshipRequestedAt:
        result.relationshipRequest.requestedAt,
      patient: {
        firstName: result.record.patientProfile.firstName,
        secondName: result.record.patientProfile.secondName,
        displayName: result.record.patientProfile.user.displayName,
      },
      relationship: {
        status: 'PENDING',
        requiresPatientConfirmation: true,
      },
    };
  }

}
