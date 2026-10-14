import { authenticatedApiRequest } from '../../../lib/auth-api.js';
import { getAuthSession } from '../../auth/api/auth-session.js';
import type {
  PatientDashboardResponse,
  PatientJourneyResponse,
  CareHistoryResponse,
} from '../types/patient-dashboard.types.js';

export async function getMyPatientDashboard(): Promise<PatientDashboardResponse> {
  return authenticatedApiRequest<PatientDashboardResponse>(
    '/v1/patients/me',
  );
}

export async function approvePatientRelationshipRequest(
  requestId: string,
): Promise<void> {
  await authenticatedApiRequest(
    `/v1/patients/relationship-requests/${encodeURIComponent(requestId)}/approve`,
    {
      method: 'POST',
    },
  );
}

export async function declinePatientRelationshipRequest(
  requestId: string,
  reason?: string,
): Promise<void> {
  await authenticatedApiRequest(
    `/v1/patients/relationship-requests/${encodeURIComponent(requestId)}/decline`,
    {
      method: 'POST',
      body: JSON.stringify({
        reason: reason?.trim() || undefined,
      }),
    },
  );
}

export async function getMyPatientJourney(): Promise<PatientJourneyResponse> {
  return authenticatedApiRequest<PatientJourneyResponse>(
    '/v1/patients/me/journey',
  );
}

export async function getMyCareHistory(): Promise<CareHistoryResponse> {
  return authenticatedApiRequest<CareHistoryResponse>(
    '/v1/patients/me/care-history',
  );
}

export async function viewMyCareAttachment(attachmentId: string): Promise<Blob> {
  const session = getAuthSession();

  if (!session) {
    throw new Error('Authentication required.');
  }

  const apiBaseUrl = import.meta.env.VITE_API_URL?.replace(/\/+$/, '') ?? '/api';
  const response = await fetch(
    `${apiBaseUrl}/v1/patients/me/care-attachments/${encodeURIComponent(attachmentId)}/view`,
    {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Unable to view care attachment (status ${response.status})`);
  }

  return response.blob();
}
