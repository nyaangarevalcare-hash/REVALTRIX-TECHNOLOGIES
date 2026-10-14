export type EncounterType =
  | 'OUTPATIENT'
  | 'INPATIENT'
  | 'EMERGENCY'
  | 'WALK_IN'
  | 'FOLLOW_UP'
  | 'PROCEDURE'
  | 'TELEMEDICINE'
  | 'HOME_CARE';

export type EncounterStatus =
  | 'DRAFT'
  | 'CREATED'
  | 'CHECKED_IN'
  | 'TRIAGED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW'
  | 'REFERRED';

export interface Encounter {
  id: string;
  tenantId: string;
  patientTenantRecordId: string;
  providerId: string | null;
  branchId: string | null;
  departmentId: string | null;
  createdByUserId: string;
  encounterNumber: string;
  type: EncounterType;
  status: EncounterStatus;
  reason: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelledReason: string | null;
  createdAt: string;
  updatedAt: string;
  queueEntries?: Array<{
    id: string;
    queueNumber: string;
    status: string;
    position: number | null;
    reason: string | null;
    queue?: {
      id: string;
      name: string;
      code: string;
      department?: {
        id: string;
        name: string;
        code: string;
      } | null;
    } | null;
  }>;
  department?: {
    id: string;
    name: string;
    code: string;
  } | null;
  patientTenantRecord?: {
    id: string;
    patientNumber: string;
    status: string;
    patientProfile?: {
      id: string;
      firstName: string;
      secondName: string;
    };
  };
}

export interface EncounterStatusHistory {
  id: string;
  encounterId: string;
  fromStatus: EncounterStatus | null;
  toStatus: EncounterStatus;
  changedByUserId: string;
  reason: string | null;
  createdAt: string;
}

export interface CreateEncounterInput {
  patientTenantRecordId: string;
  type: EncounterType;
  providerId?: string;
  branchId?: string;
  departmentId?: string;
  reason?: string;
}

export interface EncounterListResponse {
  data: Encounter[];
}
