import { useEffect, useState } from 'react';
import { getDepartmentWorkspace } from '../../departments/api/departments.api.js';
import type { DepartmentWorkspaceResponse } from '../../departments/api/departments.api.js';

interface DepartmentWorkspacePageProps {
  onNavigate: (path: string) => void;
  onLogout?: () => void;
  departmentId?: string | null;
}

function departmentTokenKey(departmentId: string): string {
  return `revaltrix_department_access:${departmentId}`;
}

export function DepartmentWorkspacePage({
  onNavigate,
  onLogout,
  departmentId,
}: DepartmentWorkspacePageProps) {
  const [workspace, setWorkspace] = useState<DepartmentWorkspaceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadWorkspace(): Promise<void> {
      if (!departmentId) {
        setError('No department was selected.');
        setLoading(false);
        return;
      }
      const token = window.sessionStorage.getItem(departmentTokenKey(departmentId));
      if (!token) {
        setError('Department access is missing or expired. Enter the department password again.');
        setLoading(false);
        return;
      }
      try {
        const result = await getDepartmentWorkspace(departmentId, token);
        if (!cancelled) {
          setWorkspace(result);
        }
      } catch (requestError) {
        if (!cancelled) {
          window.sessionStorage.removeItem(departmentTokenKey(departmentId));
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'Unable to load this department workspace.',
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    void loadWorkspace();
    return () => {
      cancelled = true;
    };
  }, [departmentId]);

  if (loading) {
    return (
      <main className="registration-loading">
        <p>Verifying department access and loading live workspace data...</p>
      </main>
    );
  }

  if (!workspace) {
    return (
      <main className="registration-loading">
        <h1>Department workspace unavailable</h1>
        <p role="alert">{error ?? 'Department workspace data is unavailable.'}</p>
        <button type="button" onClick={() => onNavigate('/staff/dashboard')}>
          Return to staff dashboard
        </button>
      </main>
    );
  }

  const { department, metrics, staff } = workspace;
  const metricCards = [
    { label: 'Assigned staff', value: metrics.assignedStaff, color: '#0f766e' },
    { label: 'Active services', value: metrics.activeServices, color: '#15803d' },
    { label: 'Active queues', value: metrics.activeQueues, color: '#b45309' },
    { label: 'Waiting queue entries', value: metrics.waitingQueueEntries, color: '#b91c1c' },
    { label: 'Appointments', value: metrics.appointments, color: '#6d28d9' },
  ];

  function returnToStaffDashboard(): void {
    if (departmentId) {
      window.sessionStorage.removeItem(departmentTokenKey(departmentId));
    }
    onNavigate('/staff/dashboard');
  }

  return (
    <main className="branches-layout">
      <section className="dashboard-page-header">
        <div>
          <p className="dashboard-eyebrow">DEPARTMENT COMMAND CENTER</p>
          <h1>{department.name}</h1>
          <p>
            {department.code}
            {department.type ? ` · ${department.type.replaceAll('_', ' ')}` : ''}
            {` · ${staff.firstName} ${staff.lastName} · ${staff.role}`}
          </p>
        </div>
        <div className="branches-form-actions">
          <button
            type="button"
            className="dashboard-secondary-button"
            onClick={returnToStaffDashboard}
          >
            Back to staff dashboard
          </button>
          <button type="button" className="dashboard-primary-button" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </section>

      <section
        className="tenant-readiness-hero"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '1rem',
        }}
      >
        {metricCards.map((card) => (
          <div
            key={card.label}
            className="dashboard-card"
            style={{
              padding: '1rem',
              borderRadius: '18px',
              borderTop: `5px solid ${card.color}`,
            }}
          >
            <p className="dashboard-eyebrow">{card.label}</p>
            <h2 style={{ margin: '0.35rem 0' }}>{card.value}</h2>
          </div>
        ))}
      </section>

      <section className="dashboard-card">
        <div className="dashboard-card-header">
          <div>
            <h2>Department workspace</h2>
            <p>Operational settings generated for this department.</p>
          </div>
        </div>
        <div className="tenant-form-grid">
          <div>
            <strong>Department type</strong>
            <p>{department.type?.replaceAll('_', ' ') ?? 'Not specified'}</p>
          </div>
          <div>
            <strong>Category</strong>
            <p>{department.category?.replaceAll('_', ' ') ?? 'Not specified'}</p>
          </div>
          <div>
            <strong>Your access level</strong>
            <p>{staff.accessLevel}</p>
          </div>
        </div>
      </section>
    </main>
  );
}
