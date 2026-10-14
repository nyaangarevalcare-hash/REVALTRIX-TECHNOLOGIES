import { useEffect, useState } from 'react';
import { accessDepartment } from '../../departments/api/departments.api.js';
import { getMyStaffProfile } from '../api/staff.api.js';
import type { StaffMeResponse } from '../types/staff.types.js';

interface StaffDashboardPageProps {
  onNavigate: (path: string) => void;
  onLogout?: () => void;
}

function departmentTokenKey(departmentId: string): string {
  return `revaltrix_department_access:${departmentId}`;
}

export function StaffDashboardPage({ onNavigate, onLogout }: StaffDashboardPageProps) {
  const [staffData, setStaffData] = useState<StaffMeResponse | null>(null);
  const [departmentId, setDepartmentId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadProfile(): Promise<void> {
      try {
        const result = await getMyStaffProfile();
        if (!cancelled) {
          setStaffData(result);
          const defaultDepartment =
            result.assignments.find((assignment) => assignment.isPrimaryDepartment) ??
            result.assignments[0];
          setDepartmentId(defaultDepartment?.department.id ?? '');
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'Unable to load your staff profile.',
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedAssignment = staffData?.assignments.find(
    (assignment) => assignment.department.id === departmentId,
  );
  const assignments = staffData?.assignments ?? [];

  async function openDepartment(): Promise<void> {
    if (!selectedAssignment) {
      setError('Choose a department assigned to your staff account.');
      return;
    }
    setError(null);
    setOpening(true);
    try {
      const result = await accessDepartment(selectedAssignment.department.id, password);
      window.sessionStorage.setItem(
        departmentTokenKey(result.department.id),
        result.departmentAccessToken,
      );
      onNavigate(`/staff/department?department=${encodeURIComponent(result.department.id)}`);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to open the department workspace.',
      );
    } finally {
      setOpening(false);
    }
  }

  if (loading) {
    return (
      <main className="registration-loading">
        <p>Loading your staff workspace...</p>
      </main>
    );
  }

  if (!staffData?.profile) {
    return (
      <main className="registration-loading">
        <h1>Staff workspace unavailable</h1>
        <p>{error ?? 'This signed-in account is not linked to an active staff profile.'}</p>
        <button type="button" onClick={onLogout}>
          Sign out
        </button>
      </main>
    );
  }

  return (
    <main className="branches-layout">
      <section className="dashboard-page-header">
        <div>
          <p className="dashboard-eyebrow">STAFF WORKSPACE</p>
          <h1>Welcome, {staffData.profile.firstName}</h1>
          <p>
            {staffData.profile.tenant.name}
            {staffData.profile.jobTitle ? ` · ${staffData.profile.jobTitle}` : ''}
          </p>
        </div>
        <div className="branches-form-actions">
          <button type="button" className="dashboard-secondary-button" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </section>

      {error && (
        <div className="registration-error" role="alert">
          {error}
        </div>
      )}

      <section className="dashboard-card">
        <div className="dashboard-card-header">
          <div>
            <h2>Go to your department</h2>
            <p>
              Your work email signs you into Revaltrix. Department access is separately checked
              against your active assignment and the department password.
            </p>
          </div>
        </div>
        {assignments.length === 0 ? (
          <div className="branches-empty-state">
            <h3>No active department assignment</h3>
            <p>Contact your organization administrator to be assigned to a department.</p>
          </div>
        ) : (
          <>
            <div className="tenant-form-grid">
              <label>
                Assigned department
                <select
                  value={departmentId}
                  onChange={(event) => {
                    setDepartmentId(event.target.value);
                    setPassword('');
                    setError(null);
                  }}
                >
                  {assignments.map((assignment) => (
                    <option key={assignment.id} value={assignment.department.id}>
                      {assignment.department.name} ({assignment.department.code})
                    </option>
                  ))}
                </select>
              </label>
              {selectedAssignment?.department.requiresDepartmentPassword && (
                <label>
                  Department password
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    placeholder="Enter the password set by your department administrator"
                    required
                  />
                </label>
              )}
              <div style={{ display: 'flex', alignItems: 'end' }}>
                <button
                  type="button"
                  className="dashboard-primary-button"
                  onClick={() => void openDepartment()}
                  disabled={opening}
                >
                  {opening ? 'Verifying access...' : 'Go to your department'}
                </button>
              </div>
            </div>
            <div className="branches-list" style={{ marginTop: '1.5rem' }}>
              {assignments.map((assignment) => (
                <article key={assignment.id} className="branch-list-item">
                  <div className="branch-list-main">
                    <div>
                      <h3>{assignment.department.name}</h3>
                      <span className="branch-status">{assignment.department.code}</span>
                    </div>
                    <div className="branch-list-meta">
                      <span>Role: {assignment.role}</span>
                      <span>Access: {assignment.accessLevel}</span>
                      <span>
                        {assignment.department.requiresDepartmentPassword
                          ? 'Password protected'
                          : 'Staff assignment required'}
                      </span>
                    </div>
                  </div>
                  <div className="branch-list-actions">
                    <button
                      type="button"
                      className="dashboard-secondary-button"
                      onClick={() => {
                        setDepartmentId(assignment.department.id);
                        setPassword('');
                        setError(null);
                      }}
                    >
                      Select
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
