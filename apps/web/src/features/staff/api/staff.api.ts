import { authenticatedApiRequest } from '../../../lib/auth-api.js';
import type {
  CreateStaffInput,
  CreateStaffResponse,
  AssignStaffDepartmentInput,
  CreateStaffShiftInput,
  StaffAccessAttempt,
  StaffMeResponse,
  StaffMember,
} from '../types/staff.types.js';

export function getStaff(): Promise<StaffMember[]> {
  return authenticatedApiRequest<StaffMember[]>('/v1/staff');
}

export function getMyStaffProfile(): Promise<StaffMeResponse> {
  return authenticatedApiRequest<StaffMeResponse>('/v1/staff/me');
}

export function createStaff(input: CreateStaffInput): Promise<CreateStaffResponse> {
  return authenticatedApiRequest<CreateStaffResponse>('/v1/staff', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function resendStaffInvitation(
  staffProfileId: string,
): Promise<{ invitationStatus: string }> {
  return authenticatedApiRequest<{ invitationStatus: string }>(
    `/v1/staff/${staffProfileId}/resend-invitation`,
    { method: 'POST' },
  );
}

export function approveStaffInvitation(
  staffProfileId: string,
): Promise<{ approvalStatus: 'APPROVED'; passwordSetupEmailStatus: 'SENT' }> {
  return authenticatedApiRequest(`/v1/staff/${staffProfileId}/approve`, { method: 'POST' });
}

export function assignStaffDepartment(
  staffProfileId: string,
  input: AssignStaffDepartmentInput,
): Promise<unknown> {
  return authenticatedApiRequest(`/v1/staff/${staffProfileId}/assignments`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function createStaffShift(
  staffProfileId: string,
  input: CreateStaffShiftInput,
): Promise<unknown> {
  return authenticatedApiRequest(`/v1/staff/${staffProfileId}/shifts`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateStaffStatus(
  staffProfileId: string,
  status: StaffMember['status'],
): Promise<StaffMember> {
  return authenticatedApiRequest<StaffMember>(`/v1/staff/${staffProfileId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function requestStaffPasswordReset(
  staffProfileId: string,
): Promise<{ resetEmailStatus: 'SENT' }> {
  return authenticatedApiRequest<{ resetEmailStatus: 'SENT' }>(
    `/v1/staff/${staffProfileId}/reset-password`,
    { method: 'POST' },
  );
}

export function getStaffAccessHistory(staffProfileId: string): Promise<StaffAccessAttempt[]> {
  return authenticatedApiRequest<StaffAccessAttempt[]>(
    `/v1/staff/${staffProfileId}/access-history`,
  );
}
