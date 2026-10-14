import { authenticatedApiRequest } from '../../../lib/auth-api.js';
import type {
  Appointment,
  AppointmentStatus,
  CreateAppointmentInput,
  CreatePatientAppointmentInput,
  AppointmentFacility,
  AppointmentSlot,
} from '../types/appointment.types.js';



export async function discoverAppointmentFacilities(): Promise<AppointmentFacility[]> {
  return authenticatedApiRequest<AppointmentFacility[]>(
    '/v1/appointments/discovery/facilities',
  );
}

export interface DiscoverAppointmentSlotsInput {
  tenantId: string;
  serviceId: string;
  from: string;
  to: string;
  providerId?: string;
  branchId?: string;
  departmentId?: string;
}

export async function discoverAppointmentSlots(
  input: DiscoverAppointmentSlotsInput,
): Promise<AppointmentSlot[]> {
  const params = new URLSearchParams({
    tenantId: input.tenantId,
    serviceId: input.serviceId,
    from: input.from,
    to: input.to,
  });

  if (input.providerId) params.set('providerId', input.providerId);
  if (input.branchId) params.set('branchId', input.branchId);
  if (input.departmentId) params.set('departmentId', input.departmentId);

  return authenticatedApiRequest<AppointmentSlot[]>(
    `/v1/appointments/discovery/slots?${params.toString()}`,
  );
}

export async function bookPatientAppointment(
  input: CreatePatientAppointmentInput,
): Promise<Appointment> {
  return authenticatedApiRequest<Appointment>('/v1/appointments/my/book', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function getAppointments(): Promise<Appointment[]> {
  return authenticatedApiRequest<Appointment[]>('/v1/appointments');
}

export async function createAppointment(
  input: CreateAppointmentInput,
): Promise<Appointment> {
  return authenticatedApiRequest<Appointment>('/v1/appointments', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

const transitionRoutes: Partial<Record<AppointmentStatus, string>> = {
  CONFIRMED: 'confirm',
  CHECKED_IN: 'check-in',
  IN_PROGRESS: 'start',
  COMPLETED: 'complete',
  CANCELLED: 'cancel',
  NO_SHOW: 'no-show',
  REJECTED: 'reject',
};

export async function transitionAppointment(
  appointmentId: string,
  status: AppointmentStatus,
  reason?: string,
): Promise<Appointment> {
  const action = transitionRoutes[status];
  if (!action) {
    throw new Error(`Unsupported appointment action: ${status}`);
  }

  return authenticatedApiRequest<Appointment>(
    `/v1/appointments/${encodeURIComponent(appointmentId)}/${action}`,
    {
      method: 'POST',
      body: JSON.stringify(reason ? { reason } : {}),
    },
  );
}
