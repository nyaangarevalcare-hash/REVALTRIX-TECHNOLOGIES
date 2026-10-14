import { useEffect, useState, type FormEvent } from 'react';
import { getDepartments } from '../../departments/api/departments.api.js';
import type { Department } from '../../departments/types/department.types.js';
import { createStaff, getStaff, resendStaffInvitation } from '../api/staff.api.js';
import type { CreateStaffInput, StaffMember } from '../types/staff.types.js';

interface StaffPageProps {
  onNavigate?: (path: string) => void;
}

const EMPTY_FORM: CreateStaffInput = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  departmentId: '',
  role: '',
  accessLevel: 'OPERATE',
  jobTitle: '',
};

export function StaffPage({ onNavigate }: StaffPageProps) {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [form, setForm] = useState<CreateStaffInput>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadData(): Promise<void> {
    try {
      setLoading(true);
      setError(null);
      const [staffResult, departmentResult] = await Promise.all([getStaff(), getDepartments()]);
      setStaff(staffResult);
      setDepartments(departmentResult);
      setForm((current) => ({
        ...current,
        departmentId:
          current.departmentId ||
          departmentResult.find((department) => department.status === 'ACTIVE')?.id ||
          '',
      }));
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to load staff and department data.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  function updateField<K extends keyof CreateStaffInput>(
    field: K,
    value: CreateStaffInput[K],
  ): void {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submitInvite(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setSaving(true);

    try {
      const result = await createStaff({
        ...form,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        phone: form.phone?.trim() || undefined,
        role: form.role.trim(),
        jobTitle: form.jobTitle?.trim() || undefined,
      });
      setForm((current) => ({
        ...EMPTY_FORM,
        departmentId: current.departmentId,
      }));
      setMessage(
        result.invitationStatus === 'VERIFICATION_EMAIL_SENT'
          ? `Verification email sent to ${result.email}.`
          : `Staff member ${result.email} was created, but the verification email could not be delivered. Use Resend invitation after checking email configuration.`,
      );
      await loadData();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to create the staff invitation.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function resendInvitation(member: StaffMember): Promise<void> {
    setError(null);
    setMessage(null);
    setResendingId(member.id);
    try {
      const result = await resendStaffInvitation(member.id);
      setMessage(
        result.invitationStatus === 'EMAIL_DELIVERY_FAILED'
          ? `Email delivery failed for ${member.email}.`
          : `An account setup email was sent to ${member.email}.`,
      );
      await loadData();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : `Unable to resend the invitation to ${member.email}.`,
      );
    } finally {
      setResendingId(null);
    }
  }

  const verifiedCount = staff.filter((member) => member.emailVerified).length;
  const pendingCount = staff.length - verifiedCount;
  const protectedDepartmentCount = departments.filter(
    (department) => department.requiresDepartmentPassword,
  ).length;

  if (loading) {
    return (
      <main className="registration-loading">
        <p>Loading staff and departments...</p>
      </main>
    );
  }

  return (
    <main className="branches-layout">
      <section className="dashboard-page-header">
        <div>
          <p className="dashboard-eyebrow">PEOPLE</p>
          <h1>Staff Management</h1>
          <p>
            Invite staff by email, assign their primary department, and track account verification
            before they access the workspace.
          </p>
        </div>
        <div className="branches-form-actions">
          <button
            type="button"
            className="dashboard-secondary-button"
            onClick={() => onNavigate?.('/tenant/departments')}
          >
            Manage departments
          </button>
        </div>
      </section>

      {error && (
        <div className="registration-error" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="form-success" role="status">
          {message}
        </div>
      )}

      <section
        className="tenant-readiness-hero"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '1rem',
        }}
      >
        {[
          { label: 'Staff members', value: staff.length, color: '#0f766e' },
          { label: 'Email verified', value: verifiedCount, color: '#15803d' },
          { label: 'Awaiting verification', value: pendingCount, color: '#b45309' },
          {
            label: 'Password-protected departments',
            value: protectedDepartmentCount,
            color: '#6d28d9',
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="dashboard-card"
            style={{ padding: '1rem', borderRadius: '16px', borderTop: `4px solid ${stat.color}` }}
          >
            <p className="dashboard-eyebrow">{stat.label}</p>
            <h2 style={{ margin: '0.35rem 0' }}>{stat.value}</h2>
          </div>
        ))}
      </section>

      <section className="dashboard-card">
        <div className="dashboard-card-header">
          <div>
            <h2>Invite a staff member</h2>
            <p>
              The staff member verifies their email and sets their own password using the emailed
              setup link.
            </p>
          </div>
        </div>
        {departments.length === 0 ? (
          <div className="branches-empty-state">
            <h3>Create a department first</h3>
            <p>Staff invitations require an active department assignment.</p>
            <button
              type="button"
              className="dashboard-primary-button"
              onClick={() => onNavigate?.('/tenant/departments')}
            >
              Open departments
            </button>
          </div>
        ) : (
          <form className="tenant-form" onSubmit={(event) => void submitInvite(event)}>
            <div className="tenant-form-grid">
              <label>
                First name
                <input
                  value={form.firstName}
                  onChange={(event) => updateField('firstName', event.target.value)}
                  autoComplete="given-name"
                  required
                  maxLength={100}
                />
              </label>
              <label>
                Last name
                <input
                  value={form.lastName}
                  onChange={(event) => updateField('lastName', event.target.value)}
                  autoComplete="family-name"
                  required
                  maxLength={100}
                />
              </label>
              <label>
                Work email
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => updateField('email', event.target.value)}
                  autoComplete="email"
                  required
                  maxLength={320}
                />
              </label>
              <label>
                Phone (optional)
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(event) => updateField('phone', event.target.value)}
                  autoComplete="tel"
                  maxLength={50}
                />
              </label>
              <label>
                Department
                <select
                  value={form.departmentId}
                  onChange={(event) => updateField('departmentId', event.target.value)}
                  required
                >
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name} ({department.code})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Job title (optional)
                <input
                  value={form.jobTitle}
                  onChange={(event) => updateField('jobTitle', event.target.value)}
                  maxLength={150}
                />
              </label>
              <label>
                Department role
                <input
                  value={form.role}
                  onChange={(event) => updateField('role', event.target.value)}
                  placeholder="e.g. Receptionist"
                  required
                  minLength={2}
                  maxLength={100}
                />
              </label>
              <label>
                Access level
                <select
                  value={form.accessLevel}
                  onChange={(event) =>
                    updateField(
                      'accessLevel',
                      event.target.value as CreateStaffInput['accessLevel'],
                    )
                  }
                >
                  <option value="VIEW">View</option>
                  <option value="OPERATE">Operate</option>
                  <option value="MANAGE">Manage</option>
                  <option value="ADMIN">Administrator</option>
                </select>
              </label>
            </div>
            <div className="branches-form-actions">
              <button type="submit" className="dashboard-primary-button" disabled={saving}>
                {saving ? 'Sending invitation...' : 'Invite staff'}
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="dashboard-card">
        <div className="dashboard-card-header">
          <div>
            <h2>Staff directory</h2>
            <p>
              {staff.length} staff member{staff.length === 1 ? '' : 's'} in this organization
            </p>
          </div>
        </div>
        {staff.length === 0 ? (
          <div className="branches-empty-state">
            <h3>No staff yet</h3>
            <p>
              Invited team members will appear here with their verification and department status.
            </p>
          </div>
        ) : (
          <div className="branches-list">
            {staff.map((member) => (
              <article key={member.id} className="branch-list-item">
                <div className="branch-list-main">
                  <div>
                    <h3>
                      {member.firstName} {member.lastName}
                    </h3>
                    <span className="branch-status">
                      {member.staffNumber ?? 'Staff ID pending'}
                    </span>
                  </div>
                  <div className="branch-list-meta">
                    <span>{member.email}</span>
                    <span>{member.jobTitle ?? 'No job title'}</span>
                    <span>{member.emailVerified ? 'Email verified' : 'Email not verified'}</span>
                    <span>
                      {member.passwordConfigured
                        ? 'Password configured'
                        : 'Password not configured'}
                    </span>
                    <span>
                      {member.assignments
                        .map((assignment) => `${assignment.department.name} — ${assignment.role}`)
                        .join(', ') || 'No active department assignment'}
                    </span>
                  </div>
                </div>
                {!member.passwordConfigured && (
                  <div className="branch-list-actions">
                    <button
                      type="button"
                      className="dashboard-secondary-button"
                      disabled={resendingId === member.id}
                      onClick={() => void resendInvitation(member)}
                    >
                      {resendingId === member.id ? 'Sending...' : 'Resend invitation'}
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
