export type AppointmentStatus =
  | 'REQUESTED'
  | 'PENDING_APPROVAL'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW'
  | 'REJECTED';

export interface Appointment {
  id: string;
  appointmentNumber: string;
  status: AppointmentStatus;
  startAt: string;
  endAt: string;
  timeZone: string;
  reason: string | null;
  patientNotes?: string | null;
  cancellationReason?: string | null;
  patientTenantRecord: {
    id: string;
    patientNumber: string;
  };
  provider?: {
    id: string;
    providerNumber: string;
    professionalTitle: string;
    specialty: string | null;
  } | null;
  branch?: { id: string; name: string } | null;
  department?: { id: string; name: string } | null;
  service?: { id: string; name: string; code: string } | null;
}

export interface CreateAppointmentInput {
  patientTenantRecordId: string;
  departmentId?: string;
  serviceId?: string;
  startAt: string;
  endAt: string;
  timeZone: string;
  reason?: string;
  patientNotes?: string;
}


export interface AppointmentFacility {
  id: string;
  name: string;
  legalName: string | null;
  type: string;
  profile: {
    businessName: string | null;
    country: string | null;
    county: string | null;
    subcounty: string | null;
    address: string | null;
    description: string | null;
    contactPhone: string | null;
  } | null;
  branches: Array<{ id: string; name: string }>;
  departments: Array<{ id: string; name: string; branchId: string | null }>;
  services: Array<{
    id: string;
    name: string;
    code: string;
    description: string | null;
    category: string | null;
    durationMin: number | null;
    branchId: string | null;
    departmentId: string | null;
  }>;
}

export interface AppointmentSlot {
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
}

export interface CreatePatientAppointmentInput {
  tenantId: string;
  serviceId: string;
  providerId: string;
  branchId?: string;
  departmentId?: string;
  startAt: string;
  endAt: string;
  timeZone: string;
  reason?: string;
  patientNotes?: string;
}
