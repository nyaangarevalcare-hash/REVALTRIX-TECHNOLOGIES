import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { getBranches } from '../../branches/api/branches.api.js';
import type { Branch } from '../../branches/types/branch.types.js';
import { getDepartments } from '../../departments/api/departments.api.js';
import type { Department } from '../../departments/types/department.types.js';
import {
  approveStaffInvitation,
  assignStaffDepartment,
  createStaff,
  createStaffShift,
  getStaff,
  getStaffAccessHistory,
  requestStaffPasswordReset,
  resendStaffInvitation,
  updateStaffStatus,
} from '../api/staff.api.js';
import type { CreateStaffInput, StaffAccessAttempt, StaffMember } from '../types/staff.types.js';

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
  employmentType: 'FULL_TIME',
};

const WEEKDAYS = [
  ['MON', 'Mon'],
  ['TUE', 'Tue'],
  ['WED', 'Wed'],
  ['THU', 'Thu'],
  ['FRI', 'Fri'],
  ['SAT', 'Sat'],
  ['SUN', 'Sun'],
] as const;

function displayStatus(status: string): string {
  return status
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function downloadCsv(staff: StaffMember[]): void {
  const columns = [
    'Staff number',
    'First name',
    'Last name',
    'Email',
    'Phone',
    'Job title',
    'Employment type',
    'Status',
    'Branch',
    'Departments',
    'Roles',
    'Email verified',
  ];
  const rows = staff.map((member) => [
    member.staffNumber ?? '',
    member.firstName,
    member.lastName,
    member.email,
    member.phone ?? '',
    member.jobTitle ?? '',
    member.employmentType,
    member.status,
    member.branch?.name ?? '',
    member.assignments.map((assignment) => assignment.department.name).join('; '),
    member.assignments.map((assignment) => assignment.role).join('; '),
    member.emailVerified ? 'Yes' : 'No',
  ]);
  const csv = [columns, ...rows]
    .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','))
    .join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'revaltrix-staff.csv';
  link.click();
  URL.revokeObjectURL(url);
}

export function StaffPage({ onNavigate }: StaffPageProps) {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [form, setForm] = useState<CreateStaffInput>(EMPTY_FORM);
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAssignmentFor, setShowAssignmentFor] = useState<string | null>(null);
  const [showShiftFor, setShowShiftFor] = useState<string | null>(null);
  const [assignment, setAssignment] = useState({
    departmentId: '',
    branchId: '',
    role: '',
    accessLevel: 'OPERATE' as 'VIEW' | 'OPERATE' | 'MANAGE' | 'ADMIN',
    isPrimaryDepartment: false,
  });
  const [shift, setShift] = useState({
    departmentId: '',
    branchId: '',
    shiftName: '',
    startTime: '09:00',
    endTime: '17:00',
    daysOfWeek: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
  });
  const [accessHistory, setAccessHistory] = useState<StaffAccessAttempt[] | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionFor, setActionFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadData(): Promise<void> {
    try {
      setLoading(true);
      setError(null);
      const [staffResult, departmentResult, branchResult] = await Promise.all([
        getStaff(),
        getDepartments(),
        getBranches(),
      ]);
      setStaff(staffResult);
      setDepartments(departmentResult);
      setBranches(branchResult);
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
          : 'Unable to load staff, departments, and branches.',
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

  function clearNotifications(): void {
    setError(null);
    setMessage(null);
  }

  async function submitInvite(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    clearNotifications();
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
        licenseNumber: form.licenseNumber?.trim() || undefined,
        specialty: form.specialty?.trim() || undefined,
        qualifications: form.qualifications?.trim() || undefined,
      });
      setForm((current) => ({ ...EMPTY_FORM, departmentId: current.departmentId }));
      setMessage(
        result.invitationStatus === 'VERIFICATION_EMAIL_SENT'
          ? `Verification email sent to ${result.email}.`
          : `Staff account ${result.email} was created, but verification email delivery failed.`,
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
    clearNotifications();
    setActionFor(member.id);
    try {
      const result = await resendStaffInvitation(member.id);
      setMessage(
        result.invitationStatus === 'ADMIN_APPROVAL_REQUIRED'
          ? `${member.email} is verified. Approve the account to send the password setup link.`
          : result.invitationStatus === 'EMAIL_DELIVERY_FAILED'
            ? `Email delivery failed for ${member.email}.`
            : `A verification code was sent to ${member.email}.`,
      );
      await loadData();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Unable to resend invitation.',
      );
    } finally {
      setActionFor(null);
    }
  }

  async function approveInvitation(member: StaffMember): Promise<void> {
    clearNotifications();
    setActionFor(member.id);
    try {
      await approveStaffInvitation(member.id);
      setMessage(`Staff account approved. A password setup link was sent to ${member.email}.`);
      await loadData();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to approve the staff account.',
      );
    } finally {
      setActionFor(null);
    }
  }

  async function changeStatus(member: StaffMember): Promise<void> {
    clearNotifications();
    setActionFor(member.id);
    const nextStatus = member.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      await updateStaffStatus(member.id, nextStatus);
      setMessage(`${member.firstName} ${member.lastName} is now ${displayStatus(nextStatus)}.`);
      await loadData();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Unable to update staff status.',
      );
    } finally {
      setActionFor(null);
    }
  }

  async function resetPassword(member: StaffMember): Promise<void> {
    clearNotifications();
    setActionFor(member.id);
    try {
      await requestStaffPasswordReset(member.id);
      setMessage(`A secure password reset email was sent to ${member.email}.`);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to send a password reset email.',
      );
    } finally {
      setActionFor(null);
    }
  }

  async function submitAssignment(
    event: FormEvent<HTMLFormElement>,
    member: StaffMember,
  ): Promise<void> {
    event.preventDefault();
    clearNotifications();
    setSaving(true);
    try {
      await assignStaffDepartment(member.id, {
        ...assignment,
        branchId: assignment.branchId || undefined,
        role: assignment.role.trim(),
      });
      setShowAssignmentFor(null);
      setAssignment({
        departmentId: '',
        branchId: '',
        role: '',
        accessLevel: 'OPERATE',
        isPrimaryDepartment: false,
      });
      setMessage(`Department assignment saved for ${member.firstName} ${member.lastName}.`);
      await loadData();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Unable to assign department.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function submitShift(
    event: FormEvent<HTMLFormElement>,
    member: StaffMember,
  ): Promise<void> {
    event.preventDefault();
    clearNotifications();
    setSaving(true);
    try {
      await createStaffShift(member.id, {
        ...shift,
        branchId: shift.branchId || undefined,
      });
      setShowShiftFor(null);
      setMessage(`Shift assigned to ${member.firstName} ${member.lastName}.`);
      await loadData();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to assign shift.');
    } finally {
      setSaving(false);
    }
  }

  async function showAccessHistory(member: StaffMember): Promise<void> {
    clearNotifications();
    setActionFor(member.id);
    try {
      const entries = await getStaffAccessHistory(member.id);
      setHistoryFor(member.id);
      setAccessHistory(entries);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Unable to load access history.',
      );
    } finally {
      setActionFor(null);
    }
  }

  const filteredStaff = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return staff.filter((member) => {
      const matchesSearch =
        !normalizedSearch ||
        [
          member.firstName,
          member.lastName,
          member.email,
          member.staffNumber,
          member.jobTitle,
          member.phone,
        ]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(normalizedSearch));
      const matchesDepartment =
        !departmentFilter ||
        member.assignments.some((assignment) => assignment.department.id === departmentFilter);
      const matchesStatus = !statusFilter || member.status === statusFilter;
      return matchesSearch && matchesDepartment && matchesStatus;
    });
  }, [staff, search, departmentFilter, statusFilter]);

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
            Manage verified staff accounts, department and branch assignments, shift schedules, and
            department access history.
          </p>
        </div>
        <div className="branches-form-actions">
          <button
            type="button"
            className="dashboard-secondary-button"
            onClick={() => downloadCsv(filteredStaff)}
            disabled={!filteredStaff.length}
          >
            Export filtered staff
          </button>
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
          { label: 'Protected departments', value: protectedDepartmentCount, color: '#6d28d9' },
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
            <h2>Add and invite staff</h2>
            <p>
              New staff verify their work email and create their own password from a one-time email
              link. Existing login credentials are never set by an administrator.
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
                Phone
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(event) => updateField('phone', event.target.value)}
                  autoComplete="tel"
                  maxLength={50}
                />
              </label>
              <label>
                Job title
                <input
                  value={form.jobTitle}
                  onChange={(event) => updateField('jobTitle', event.target.value)}
                  maxLength={150}
                />
              </label>
              <label>
                Employment type
                <select
                  value={form.employmentType}
                  onChange={(event) =>
                    updateField(
                      'employmentType',
                      event.target.value as CreateStaffInput['employmentType'],
                    )
                  }
                >
                  <option value="FULL_TIME">Full time</option>
                  <option value="PART_TIME">Part time</option>
                  <option value="LOCUM">Locum</option>
                  <option value="CONTRACTOR">Contractor</option>
                  <option value="VOLUNTEER">Volunteer</option>
                </select>
              </label>
              <label>
                Primary department
                <select
                  value={form.departmentId}
                  onChange={(event) => updateField('departmentId', event.target.value)}
                  required
                >
                  {departments
                    .filter((department) => department.status === 'ACTIVE')
                    .map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name} ({department.code})
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Primary branch
                <select
                  value={form.branchId ?? ''}
                  onChange={(event) => updateField('branchId', event.target.value || undefined)}
                >
                  <option value="">Use department branch / no branch</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name} ({branch.code})
                    </option>
                  ))}
                </select>
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
              <label>
                Reports to
                <select
                  value={form.reportsToId ?? ''}
                  onChange={(event) => updateField('reportsToId', event.target.value || undefined)}
                >
                  <option value="">No reporting manager</option>
                  {staff
                    .filter((member) => member.status === 'ACTIVE')
                    .map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.firstName} {member.lastName} ({member.staffNumber ?? member.email})
                      </option>
                    ))}
                </select>
              </label>
              <label>
                License number
                <input
                  value={form.licenseNumber ?? ''}
                  onChange={(event) => updateField('licenseNumber', event.target.value)}
                  maxLength={150}
                />
              </label>
              <label>
                Specialty
                <input
                  value={form.specialty ?? ''}
                  onChange={(event) => updateField('specialty', event.target.value)}
                  maxLength={200}
                />
              </label>
              <label>
                Qualifications
                <input
                  value={form.qualifications ?? ''}
                  onChange={(event) => updateField('qualifications', event.target.value)}
                  maxLength={1000}
                />
              </label>
            </div>
            <div className="branches-form-actions">
              <button type="submit" className="dashboard-primary-button" disabled={saving}>
                {saving ? 'Creating and inviting...' : 'Add and invite staff'}
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
              Showing {filteredStaff.length} of {staff.length} staff members
            </p>
          </div>
        </div>
        <div className="tenant-form-grid">
          <label>
            Search staff
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, email, staff number, job title or phone"
            />
          </label>
          <label>
            Department
            <select
              value={departmentFilter}
              onChange={(event) => setDepartmentFilter(event.target.value)}
            >
              <option value="">All departments</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Staff status
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="ON_LEAVE">On leave</option>
              <option value="OFFBOARDED">Offboarded</option>
            </select>
          </label>
        </div>
        {filteredStaff.length === 0 ? (
          <div className="branches-empty-state">
            <h3>{staff.length ? 'No staff match these filters' : 'No staff yet'}</h3>
            <p>Adjust your search or filters, or add and invite a team member above.</p>
          </div>
        ) : (
          <div className="branches-list">
            {filteredStaff.map((member) => {
              const expanded = expandedId === member.id;
              const assignments = member.assignments;
              return (
                <article key={member.id} className="branch-list-item">
                  <div className="branch-list-main">
                    <div>
                      <h3>
                        {member.firstName} {member.lastName}
                      </h3>
                      <span className="branch-status">
                        {member.staffNumber ?? 'Staff ID pending'} · {displayStatus(member.status)}
                      </span>
                    </div>
                    <div className="branch-list-meta">
                      <span>{member.email}</span>
                      <span>
                        {member.jobTitle ?? 'No job title'} · {displayStatus(member.employmentType)}
                      </span>
                      <span>
                        {member.branch ? `Branch: ${member.branch.name}` : 'No primary branch'}
                      </span>
                      <span>{member.emailVerified ? 'Email verified' : 'Email not verified'}</span>
                      <span>
                        {member.passwordConfigured
                          ? 'Password configured'
                          : 'Password not configured'}
                      </span>
                      <span>
                        {assignments
                          .map((item) => `${item.department.name} — ${item.role}`)
                          .join(', ') || 'No department assignment'}
                      </span>
                    </div>
                  </div>
                  <div className="branch-list-actions">
                    <button
                      type="button"
                      className="dashboard-secondary-button"
                      onClick={() => {
                        setExpandedId(expanded ? null : member.id);
                        setShowAssignmentFor(null);
                        setShowShiftFor(null);
                        setHistoryFor(null);
                        setAccessHistory(null);
                      }}
                    >
                      {expanded ? 'Hide profile' : 'View profile'}
                    </button>
                    {!member.emailVerified ? (
                      <button
                        type="button"
                        className="dashboard-secondary-button"
                        disabled={actionFor === member.id}
                        onClick={() => void resendInvitation(member)}
                      >
                        {actionFor === member.id ? 'Sending...' : 'Resend invitation'}
                      </button>
                    ) : member.status === 'ACTIVE' && !member.passwordConfigured ? (
                      <button
                        type="button"
                        className="dashboard-primary-button"
                        disabled={actionFor === member.id}
                        onClick={() => void approveInvitation(member)}
                      >
                        {actionFor === member.id ? 'Approving...' : 'Approve & send password setup'}
                      </button>
                    ) : member.status === 'ACTIVE' ? (
                      <button
                        type="button"
                        className="dashboard-secondary-button"
                        disabled={actionFor === member.id}
                        onClick={() => void resetPassword(member)}
                      >
                        {actionFor === member.id ? 'Sending...' : 'Reset password'}
                      </button>
                    ) : null}
                    {member.status !== 'OFFBOARDED' && (
                      <button
                        type="button"
                        className="dashboard-secondary-button"
                        disabled={actionFor === member.id}
                        onClick={() => void changeStatus(member)}
                      >
                        {member.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
                      </button>
                    )}
                  </div>
                  {expanded && (
                    <div style={{ flexBasis: '100%', width: '100%' }}>
                      <div className="detail-grid">
                        <div>
                          <span>Phone</span>
                          <strong>{member.phone ?? 'Not provided'}</strong>
                        </div>
                        <div>
                          <span>License</span>
                          <strong>{member.licenseNumber ?? 'Not provided'}</strong>
                        </div>
                        <div>
                          <span>Specialty</span>
                          <strong>{member.specialty ?? 'Not provided'}</strong>
                        </div>
                        <div>
                          <span>Qualifications</span>
                          <strong>{member.qualifications ?? 'Not provided'}</strong>
                        </div>
                        <div>
                          <span>Reports to</span>
                          <strong>
                            {member.reportsTo
                              ? `${member.reportsTo.firstName} ${member.reportsTo.lastName}`
                              : 'Not assigned'}
                          </strong>
                        </div>
                        <div>
                          <span>Joined</span>
                          <strong>
                            {member.joinedAt
                              ? new Date(member.joinedAt).toLocaleDateString()
                              : 'Not recorded'}
                          </strong>
                        </div>
                      </div>
                      <h4>Department assignments</h4>
                      {assignments.length ? (
                        <div className="branches-list">
                          {assignments.map((item) => (
                            <div key={item.id} className="branch-list-item">
                              <div className="branch-list-meta">
                                <strong>
                                  {item.department.name}
                                  {item.isPrimaryDepartment ? ' · Primary' : ''}
                                </strong>
                                <span>
                                  Role: {item.role} · Access: {item.accessLevel}
                                </span>
                                <span>
                                  Branch: {item.branch?.name ?? 'Not assigned'} ·{' '}
                                  {displayStatus(item.status ?? 'ACTIVE')}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p>No department assignments.</p>
                      )}
                      <h4>Active shifts</h4>
                      {member.shifts.length ? (
                        <div className="branches-list">
                          {member.shifts.map((item) => (
                            <div key={item.id} className="branch-list-item">
                              <div className="branch-list-meta">
                                <strong>
                                  {item.shiftName} · {item.department.name}
                                </strong>
                                <span>
                                  {item.startTime}–{item.endTime} ·{' '}
                                  {(item.daysOfWeek ?? []).join(', ')}
                                </span>
                                <span>Branch: {item.branch?.name ?? 'Not assigned'}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p>No active shifts assigned.</p>
                      )}
                      <div className="branches-form-actions">
                        {member.status === 'ACTIVE' && (
                          <>
                            <button
                              type="button"
                              className="dashboard-secondary-button"
                              onClick={() => {
                                setShowAssignmentFor(
                                  showAssignmentFor === member.id ? null : member.id,
                                );
                                setAssignment((current) => ({
                                  ...current,
                                  departmentId:
                                    departments.find(
                                      (d) => !assignments.some((a) => a.department.id === d.id),
                                    )?.id ?? '',
                                }));
                              }}
                            >
                              Assign department and branch
                            </button>
                            <button
                              type="button"
                              className="dashboard-secondary-button"
                              onClick={() => {
                                setShowShiftFor(showShiftFor === member.id ? null : member.id);
                                setShift((current) => ({
                                  ...current,
                                  departmentId:
                                    assignments.find((a) => a.status === 'ACTIVE')?.department.id ??
                                    '',
                                }));
                              }}
                            >
                              Assign shift
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          className="dashboard-secondary-button"
                          disabled={actionFor === member.id}
                          onClick={() => void showAccessHistory(member)}
                        >
                          {actionFor === member.id ? 'Loading...' : 'View access history'}
                        </button>
                      </div>
                      {showAssignmentFor === member.id && (
                        <form
                          className="tenant-form"
                          onSubmit={(event) => void submitAssignment(event, member)}
                        >
                          <h4>Assign department</h4>
                          <div className="tenant-form-grid">
                            <label>
                              Department
                              <select
                                required
                                value={assignment.departmentId}
                                onChange={(event) =>
                                  setAssignment({ ...assignment, departmentId: event.target.value })
                                }
                              >
                                <option value="">Select department</option>
                                {departments
                                  .filter((d) => d.status === 'ACTIVE')
                                  .map((d) => (
                                    <option key={d.id} value={d.id}>
                                      {d.name}
                                    </option>
                                  ))}
                              </select>
                            </label>
                            <label>
                              Branch
                              <select
                                value={assignment.branchId}
                                onChange={(event) =>
                                  setAssignment({ ...assignment, branchId: event.target.value })
                                }
                              >
                                <option value="">Use department / staff branch</option>
                                {branches.map((branch) => (
                                  <option key={branch.id} value={branch.id}>
                                    {branch.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Role
                              <input
                                required
                                minLength={2}
                                maxLength={100}
                                value={assignment.role}
                                onChange={(event) =>
                                  setAssignment({ ...assignment, role: event.target.value })
                                }
                              />
                            </label>
                            <label>
                              Access level
                              <select
                                value={assignment.accessLevel}
                                onChange={(event) =>
                                  setAssignment({
                                    ...assignment,
                                    accessLevel: event.target
                                      .value as typeof assignment.accessLevel,
                                  })
                                }
                              >
                                <option value="VIEW">View</option>
                                <option value="OPERATE">Operate</option>
                                <option value="MANAGE">Manage</option>
                                <option value="ADMIN">Administrator</option>
                              </select>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                              <input
                                type="checkbox"
                                checked={assignment.isPrimaryDepartment}
                                onChange={(event) =>
                                  setAssignment({
                                    ...assignment,
                                    isPrimaryDepartment: event.target.checked,
                                  })
                                }
                              />
                              Make primary department
                            </label>
                          </div>
                          <button
                            type="submit"
                            className="dashboard-primary-button"
                            disabled={saving || !assignment.departmentId}
                          >
                            {saving ? 'Saving...' : 'Save assignment'}
                          </button>
                        </form>
                      )}
                      {showShiftFor === member.id && (
                        <form
                          className="tenant-form"
                          onSubmit={(event) => void submitShift(event, member)}
                        >
                          <h4>Assign shift</h4>
                          {assignments.filter((item) => item.status === 'ACTIVE').length === 0 ? (
                            <p>Assign the staff member to a department before creating a shift.</p>
                          ) : (
                            <>
                              <div className="tenant-form-grid">
                                <label>
                                  Department
                                  <select
                                    required
                                    value={shift.departmentId}
                                    onChange={(event) =>
                                      setShift({ ...shift, departmentId: event.target.value })
                                    }
                                  >
                                    {assignments
                                      .filter((item) => item.status === 'ACTIVE')
                                      .map((item) => (
                                        <option key={item.id} value={item.department.id}>
                                          {item.department.name}
                                        </option>
                                      ))}
                                  </select>
                                </label>
                                <label>
                                  Shift name
                                  <input
                                    required
                                    maxLength={100}
                                    value={shift.shiftName}
                                    onChange={(event) =>
                                      setShift({ ...shift, shiftName: event.target.value })
                                    }
                                    placeholder="Day shift"
                                  />
                                </label>
                                <label>
                                  Branch
                                  <select
                                    value={shift.branchId}
                                    onChange={(event) =>
                                      setShift({ ...shift, branchId: event.target.value })
                                    }
                                  >
                                    <option value="">Use department / staff branch</option>
                                    {branches.map((branch) => (
                                      <option key={branch.id} value={branch.id}>
                                        {branch.name}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label>
                                  Starts
                                  <input
                                    type="time"
                                    required
                                    value={shift.startTime}
                                    onChange={(event) =>
                                      setShift({ ...shift, startTime: event.target.value })
                                    }
                                  />
                                </label>
                                <label>
                                  Ends
                                  <input
                                    type="time"
                                    required
                                    value={shift.endTime}
                                    onChange={(event) =>
                                      setShift({ ...shift, endTime: event.target.value })
                                    }
                                  />
                                </label>
                              </div>
                              <fieldset>
                                <legend>Days of week</legend>
                                <div className="branches-form-actions">
                                  {WEEKDAYS.map(([day, label]) => (
                                    <label
                                      key={day}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '.35rem',
                                      }}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={shift.daysOfWeek.includes(day)}
                                        onChange={(event) =>
                                          setShift({
                                            ...shift,
                                            daysOfWeek: event.target.checked
                                              ? [...shift.daysOfWeek, day]
                                              : shift.daysOfWeek.filter(
                                                  (selected) => selected !== day,
                                                ),
                                          })
                                        }
                                      />
                                      {label}
                                    </label>
                                  ))}
                                </div>
                              </fieldset>
                              <button
                                type="submit"
                                className="dashboard-primary-button"
                                disabled={saving || !shift.daysOfWeek.length}
                              >
                                {saving ? 'Saving...' : 'Save shift'}
                              </button>
                            </>
                          )}
                        </form>
                      )}
                      {historyFor === member.id && accessHistory && (
                        <section>
                          <h4>Department access history (latest 100)</h4>
                          {accessHistory.length ? (
                            <div className="branches-list">
                              {accessHistory.map((attempt) => (
                                <div key={attempt.id} className="branch-list-item">
                                  <div className="branch-list-meta">
                                    <strong>
                                      {displayStatus(attempt.status)} ·{' '}
                                      {attempt.department?.name ?? 'Department unavailable'}
                                    </strong>
                                    <span>{new Date(attempt.createdAt).toLocaleString()}</span>
                                    <span>
                                      {attempt.ipAddress ?? 'IP unavailable'} ·{' '}
                                      {attempt.userAgent ?? 'Device unavailable'}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p>No department access attempts have been recorded.</p>
                          )}
                        </section>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
