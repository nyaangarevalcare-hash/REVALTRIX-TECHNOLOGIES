import { useState } from 'react';
import type { RegistrationDashboardResponse } from '../types/registration-dashboard.types.js';
import { apiRequest } from '../../../lib/api.js';
import { getRegistrationToken } from '../api/registration-dashboard.api.js';

interface ProfileStatusCardProps {
  profile: RegistrationDashboardResponse['profile'];
  onUpdated: () => void;
}

interface UpdateTenantOnboardingResponse {
  registration: RegistrationDashboardResponse['registration'];
  tenant: RegistrationDashboardResponse['profile'] extends {
    type: 'TENANT';
    data: infer T;
  }
    ? T
    : never;
}

export function ProfileStatusCard({ profile, onUpdated }: ProfileStatusCardProps) {
  const isPatient = profile.type === 'PATIENT';
  const isStaff = profile.type === 'STAFF';

  const tenantData = profile.type === 'TENANT' && profile.data ? profile.data : null;

  const [editing, setEditing] = useState(!profile.complete);
  const [legalName, setLegalName] = useState(tenantData?.legalName ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveTenantProfile(): Promise<void> {
    const token = getRegistrationToken();

    if (!token) {
      setError('Registration session is required.');
      return;
    }

    if (!legalName.trim()) {
      setError('Legal name is required.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await apiRequest<UpdateTenantOnboardingResponse>('/v1/onboarding/tenant', {
        method: 'PATCH',
        headers: {
          'X-Registration-Token': token,
        },
        body: JSON.stringify({
          legalName: legalName.trim(),
        }),
      });

      setEditing(false);
      onUpdated();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to update organization profile.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (isPatient) {
    return (
      <section className="dashboard-card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">Profile</p>
            <h2>Patient profile</h2>
          </div>

          <span
            className={`status-badge ${profile.complete ? 'status-success' : 'status-pending'}`}
          >
            {profile.complete ? 'Complete' : 'Incomplete'}
          </span>
        </div>

        {profile.data ? (
          <div className="detail-grid">
            <div>
              <span>First name</span>
              <strong>{profile.data.firstName}</strong>
            </div>

            <div>
              <span>Second name</span>
              <strong>{profile.data.secondName}</strong>
            </div>

            <div>
              <span>Location</span>
              <strong>{profile.data.location ?? 'Not provided'}</strong>
            </div>
          </div>
        ) : (
          <p className="empty-state">Patient profile information is unavailable.</p>
        )}
      </section>
    );
  }

  if (isStaff) {
    return (
      <section className="dashboard-card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">Profile</p>
            <h2>Staff profile</h2>
          </div>
          <span
            className={`status-badge ${profile.complete ? 'status-success' : 'status-pending'}`}
          >
            {profile.complete ? 'Complete' : 'Incomplete'}
          </span>
        </div>
        {profile.data ? (
          <div className="detail-grid">
            <div>
              <span>Name</span>
              <strong>
                {profile.data.firstName} {profile.data.lastName}
              </strong>
            </div>
            <div>
              <span>Work email</span>
              <strong>{profile.data.email}</strong>
            </div>
            <div>
              <span>Staff number</span>
              <strong>{profile.data.staffNumber ?? 'Pending'}</strong>
            </div>
            <div>
              <span>Job title</span>
              <strong>{profile.data.jobTitle ?? 'Not provided'}</strong>
            </div>
          </div>
        ) : (
          <p className="empty-state">Staff profile information is unavailable.</p>
        )}
      </section>
    );
  }

  return (
    <section className="dashboard-card">
      <div className="card-heading">
        <div>
          <p className="eyebrow">Profile</p>
          <h2>Organization profile</h2>
        </div>

        <span className={`status-badge ${profile.complete ? 'status-success' : 'status-pending'}`}>
          {profile.complete ? 'Complete' : 'Incomplete'}
        </span>
      </div>

      {tenantData ? (
        <>
          <div className="detail-grid">
            <div>
              <span>Organization</span>
              <strong>{tenantData.name}</strong>
            </div>

            <div>
              <span>Organization type</span>
              <strong>{tenantData.type}</strong>
            </div>

            <div>
              <span>Organization code</span>
              <strong>{tenantData.code}</strong>
            </div>
          </div>

          {editing ? (
            <div className="profile-edit-form">
              <label>
                <span>Legal name</span>
                <input
                  type="text"
                  value={legalName}
                  onChange={(event) => setLegalName(event.target.value)}
                  autoComplete="organization"
                  placeholder="Enter the registered legal name"
                  disabled={submitting}
                />
              </label>

              {error && (
                <p role="alert" className="form-error">
                  {error}
                </p>
              )}

              <div className="form-actions">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => void saveTenantProfile()}
                  disabled={submitting}
                >
                  {submitting ? 'Saving profile...' : 'Save organization profile'}
                </button>
              </div>
            </div>
          ) : (
            <div className="detail-grid">
              <div>
                <span>Legal name</span>
                <strong>{tenantData.legalName ?? 'Not provided'}</strong>
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setLegalName(tenantData.legalName ?? '');
                    setError(null);
                    setEditing(true);
                  }}
                >
                  Edit profile
                </button>
              </div>
            </div>
          )}

          {!profile.complete && !editing && (
            <button type="button" className="primary-button" onClick={() => setEditing(true)}>
              Complete profile
            </button>
          )}
        </>
      ) : (
        <p className="empty-state">Organization profile information is unavailable.</p>
      )}
    </section>
  );
}
