import { authenticatedApiRequest } from '../../../lib/auth-api.js';
import type {
  CreateStaffInput,
  CreateStaffResponse,
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
