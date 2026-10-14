import {
  FormEvent,
  useEffect,
  useState,
} from 'react';
import {
  cancelEncounter,
  checkInEncounter,
  completeEncounter,
  createEncounter,
  getEncounters,
  noShowEncounter,
  referEncounter,
  startEncounter,
  triageEncounter,
} from '../api/encounters.api.js';
import {
  createClinicalNote,
  finalizeClinicalNote,
  getClinicalNotes,
  signClinicalNote,
  updateClinicalNote,
} from '../../clinical-notes/api/clinical-notes.api.js';
import type {
  ClinicalNote,
  ClinicalNoteType,
} from '../../clinical-notes/types/clinical-note.types.js';
import type {
  CreateEncounterInput,
  Encounter,
  EncounterType,
} from '../types/encounter.types.js';
import {
  getPatients,
} from '../../patients/api/patients.api.js';
import type {
  PatientListItem,
} from '../../patients/types/patient.types.js';
import { getDepartments } from '../../departments/api/departments.api.js';
import type { Department } from '../../departments/types/department.types.js';

const encounterTypes: EncounterType[] = [
  'OUTPATIENT',
  'INPATIENT',
  'EMERGENCY',
  'WALK_IN',
  'FOLLOW_UP',
  'PROCEDURE',
  'TELEMEDICINE',
  'HOME_CARE',
];

const clinicalNoteTypes: ClinicalNoteType[] = [
  'CONSULTATION',
  'PROGRESS',
  'EMERGENCY',
  'ADMISSION',
  'DISCHARGE',
  'PROCEDURE',
  'FOLLOW_UP',
  'TELEMEDICINE',
];

export function EncountersPage({
  onNavigate,
}: {
  onNavigate: (path: string) => void;
}) {
  const [encounters, setEncounters] =
    useState<Encounter[]>([]);
  const [patients, setPatients] =
    useState<PatientListItem[]>([]);
  const [departments, setDepartments] =
    useState<Department[]>([]);
  const [patientTenantRecordId, setPatientTenantRecordId] =
    useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [type, setType] =
    useState<EncounterType>('OUTPATIENT');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionEncounterId, setActionEncounterId] =
    useState<string | null>(null);
  const [intakeEncounter, setIntakeEncounter] =
    useState<Encounter | null>(null);
  const [intakeDepartmentId, setIntakeDepartmentId] =
    useState('');
  const [intakeReason, setIntakeReason] = useState('');
  const [selectedEncounter, setSelectedEncounter] =
    useState<Encounter | null>(null);
  const [clinicalNotes, setClinicalNotes] =
    useState<ClinicalNote[]>([]);
  const [clinicalNotesLoading, setClinicalNotesLoading] =
    useState(false);
  const [clinicalNoteSaving, setClinicalNoteSaving] =
    useState(false);
  const [clinicalNoteType, setClinicalNoteType] =
    useState<ClinicalNoteType>('CONSULTATION');
  const [chiefComplaint, setChiefComplaint] =
    useState('');
  const [subjective, setSubjective] =
    useState('');
  const [objective, setObjective] =
    useState('');
  const [assessment, setAssessment] =
    useState('');
  const [plan, setPlan] =
    useState('');
  const [editingClinicalNoteId, setEditingClinicalNoteId] =
    useState<string | null>(null);
  const [error, setError] =
    useState<string | null>(null);
  const [success, setSuccess] =
    useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const [encountersResult, patientsResult, departmentResult] =
        await Promise.all([
          getEncounters(),
          getPatients({
            status: 'ACTIVE',
            page: 1,
            pageSize: 100,
          }),
          getDepartments(),
        ]);

      setEncounters(encountersResult.data);
      setPatients(patientsResult.data);
      setDepartments(departmentResult);

      if (
        !patientTenantRecordId &&
        patientsResult.data.length > 0
      ) {
        setPatientTenantRecordId(
          patientsResult.data[0].id,
        );
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Unable to load encounters.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function submitCheckIn(): Promise<void> {
    if (!intakeEncounter) {
      return;
    }

    if (!intakeDepartmentId || intakeReason.trim().length < 5) {
      setError('Select a department and describe the presenting concern in at least 5 characters.');
      return;
    }

    setActionEncounterId(intakeEncounter.id);
    setError(null);
    setSuccess(null);

    try {
      await checkInEncounter(intakeEncounter.id, {
        departmentId: intakeDepartmentId,
        reason: intakeReason.trim(),
      });
      setSuccess(
        `Encounter ${intakeEncounter.encounterNumber} checked in and queued for ${
          departments.find((department) => department.id === intakeDepartmentId)?.name ??
          'the selected department'
        }.`,
      );
      setIntakeEncounter(null);
      await loadData();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to check in this encounter.',
      );
    } finally {
      setActionEncounterId(null);
    }
  }

  async function handleTransition(
    encounter: Encounter,
    action:
      | 'check-in'
      | 'triage'
      | 'start'
      | 'complete'
      | 'cancel'
      | 'no-show'
      | 'refer',
  ) {
    if (action === 'check-in') {
      setIntakeEncounter(encounter);
      setIntakeDepartmentId(
        encounter.department?.id ?? encounter.departmentId ?? '',
      );
      setIntakeReason(encounter.reason ?? '');
      setError(null);
      return;
    }

    if (action === 'cancel' && !window.confirm(
      `Cancel encounter ${encounter.encounterNumber}?`,
    )) {
      return;
    }

    if (action === 'no-show' && !window.confirm(
      `Mark encounter ${encounter.encounterNumber} as no-show?`,
    )) {
      return;
    }

    let transitionReason: string | undefined;

    if (action === 'cancel' || action === 'refer') {
      transitionReason =
        window.prompt(
          action === 'cancel'
            ? 'Enter the cancellation reason:'
            : 'Enter the referral reason (optional):',
        )?.trim() || undefined;

      if (action === 'cancel' && !transitionReason) {
        setError('A cancellation reason is required.');
        return;
      }
    }

    setActionEncounterId(encounter.id);
    setError(null);
    setSuccess(null);

    try {
      switch (action) {
        case 'triage':
          await triageEncounter(encounter.id);
          break;
        case 'start':
          await startEncounter(encounter.id);
          break;
        case 'complete':
          await completeEncounter(encounter.id);
          break;
        case 'cancel':
          await cancelEncounter(
            encounter.id,
            transitionReason!,
          );
          break;
        case 'no-show':
          await noShowEncounter(encounter.id);
          break;
        case 'refer':
          await referEncounter(
            encounter.id,
            transitionReason,
          );
          break;
      }

      setSuccess(
        `Encounter ${encounter.encounterNumber} updated successfully.`,
      );
      await loadData();
    } catch (transitionError) {
      setError(
        transitionError instanceof Error
          ? transitionError.message
          : 'Unable to update encounter.',
      );
    } finally {
      setActionEncounterId(null);
    }
  }

  function renderActions(encounter: Encounter) {
    const busy = actionEncounterId === encounter.id;

    if (
      encounter.status === 'CANCELLED' ||
      encounter.status === 'NO_SHOW' ||
      encounter.status === 'COMPLETED' ||
      encounter.status === 'REFERRED'
    ) {
      return <span>—</span>;
    }

    return (
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.4rem',
        }}
      >
        {encounter.status === 'CREATED' ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void handleTransition(
                  encounter,
                  'check-in',
                )
              }
            >
              {busy ? 'Updating...' : 'Check in'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void handleTransition(
                  encounter,
                  'no-show',
                )
              }
            >
              No-show
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void handleTransition(
                  encounter,
                  'cancel',
                )
              }
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void handleTransition(
                  encounter,
                  'refer',
                )
              }
            >
              Refer
            </button>
          </>
        ) : null}

        {encounter.status === 'CHECKED_IN' ? (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void handleTransition(
                encounter,
                'triage',
              )
            }
          >
            {busy ? 'Updating...' : 'Triage'}
          </button>
        ) : null}

        {encounter.status === 'TRIAGED' ? (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void handleTransition(
                encounter,
                'start',
              )
            }
          >
            {busy ? 'Updating...' : 'Start'}
          </button>
        ) : null}

        {encounter.status === 'IN_PROGRESS' ? (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void handleTransition(
                encounter,
                'complete',
              )
            }
          >
            {busy ? 'Updating...' : 'Complete'}
          </button>
        ) : null}

        {encounter.status === 'CHECKED_IN' ||
        encounter.status === 'TRIAGED' ||
        encounter.status === 'IN_PROGRESS' ? (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void handleTransition(
                encounter,
                'cancel',
              )
            }
          >
            Cancel
          </button>
        ) : null}
      </div>
    );
  }

  async function loadClinicalNotes(
    encounterId: string,
  ) {
    setClinicalNotesLoading(true);
    setError(null);

    try {
      const result = await getClinicalNotes(encounterId);
      setClinicalNotes(result.data);
    } catch (notesError) {
      setError(
        notesError instanceof Error
          ? notesError.message
          : 'Unable to load clinical notes.',
      );
    } finally {
      setClinicalNotesLoading(false);
    }
  }

  function openClinicalWorkspace(encounter: Encounter) {
    setSelectedEncounter(encounter);
    setEditingClinicalNoteId(null);
    setChiefComplaint('');
    setSubjective('');
    setObjective('');
    setAssessment('');
    setPlan('');
    void loadClinicalNotes(encounter.id);
  }

  function populateClinicalNote(note: ClinicalNote) {
    setEditingClinicalNoteId(note.id);
    setClinicalNoteType(note.type);
    setChiefComplaint(note.chiefComplaint ?? '');
    setSubjective(note.subjective ?? '');
    setObjective(note.objective ?? '');
    setAssessment(note.assessment ?? '');
    setPlan(note.plan ?? '');
  }

  function clearClinicalNoteForm() {
    setEditingClinicalNoteId(null);
    setClinicalNoteType('CONSULTATION');
    setChiefComplaint('');
    setSubjective('');
    setObjective('');
    setAssessment('');
    setPlan('');
  }

  async function handleClinicalNoteSave() {
    if (!selectedEncounter) {
      return;
    }

    setClinicalNoteSaving(true);
    setError(null);
    setSuccess(null);

    try {
      if (editingClinicalNoteId) {
        await updateClinicalNote(
          editingClinicalNoteId,
          {
            chiefComplaint: chiefComplaint.trim(),
            subjective: subjective.trim(),
            objective: objective.trim(),
            assessment: assessment.trim(),
            plan: plan.trim(),
          },
        );

        setSuccess('Clinical note draft updated.');
      } else {
        await createClinicalNote({
          patientTenantRecordId:
            selectedEncounter.patientTenantRecordId,
          encounterId: selectedEncounter.id,
          type: clinicalNoteType,
          chiefComplaint:
            chiefComplaint.trim() || undefined,
          subjective:
            subjective.trim() || undefined,
          objective:
            objective.trim() || undefined,
          assessment:
            assessment.trim() || undefined,
          plan:
            plan.trim() || undefined,
        });

        setSuccess('Clinical note draft created.');
        clearClinicalNoteForm();
      }

      await loadClinicalNotes(selectedEncounter.id);
    } catch (noteError) {
      setError(
        noteError instanceof Error
          ? noteError.message
          : 'Unable to save clinical note.',
      );
    } finally {
      setClinicalNoteSaving(false);
    }
  }

  async function handleClinicalNoteAction(
    note: ClinicalNote,
    action: 'sign' | 'finalize',
  ) {
    setClinicalNoteSaving(true);
    setError(null);
    setSuccess(null);

    try {
      if (action === 'sign') {
        await signClinicalNote(note.id);
        setSuccess(`${note.noteNumber} signed.`);
      } else {
        await finalizeClinicalNote(note.id);
        setSuccess(`${note.noteNumber} finalized.`);
      }

      if (selectedEncounter) {
        await loadClinicalNotes(selectedEncounter.id);
      }
    } catch (noteError) {
      setError(
        noteError instanceof Error
          ? noteError.message
          : 'Unable to update clinical note.',
      );
    } finally {
      setClinicalNoteSaving(false);
    }
  }

  async function handleCreate(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!patientTenantRecordId) {
      setError(
        'Select an active patient before creating the encounter.',
      );
      return;
    }

    if (!departmentId) {
      setError(
        "Select the department that best matches the patient's treatment need.",
      );
      return;
    }

    if (reason.trim().length < 5) {
      setError(
        'Describe the presenting concern in at least 5 characters so the patient can be routed appropriately.',
      );
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const input: CreateEncounterInput = {
        patientTenantRecordId,
        type,
        departmentId,
        reason: reason.trim(),
      };

      const created =
        await createEncounter(input);

      setSuccess(
        `Encounter ${created.encounterNumber} created successfully.`,
      );
      setReason('');
      setDepartmentId('');
      await loadData();
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : 'Unable to create encounter.',
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="registration-loading">
        <p>Loading encounters...</p>
      </section>
    );
  }

  return (
    <main>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <div>
          <p
            style={{
              margin: 0,
              fontSize: '0.8rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
            }}
          >
            CLINICAL OPERATIONS
          </p>
          <h1 style={{ margin: '0.25rem 0' }}>
            Encounters
          </h1>
          <p style={{ margin: 0 }}>
            Manage real patient encounters and their
            clinical record lifecycle.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('/tenant/patients')}
        >
          Patients
        </button>
      </div>

      {error ? (
        <div
          role="alert"
          style={{
            padding: '0.75rem',
            marginBottom: '1rem',
          }}
        >
          {error}
        </div>
      ) : null}

      {success ? (
        <div
          role="status"
          style={{
            padding: '0.75rem',
            marginBottom: '1rem',
          }}
        >
          {success}
        </div>
      ) : null}

      <section
        style={{
          border: '1px solid currentColor',
          borderRadius: '8px',
          padding: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <h2>Create Encounter</h2>

        <form onSubmit={handleCreate}>
          <div
            style={{
              display: 'grid',
              gap: '1rem',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(220px, 1fr))',
            }}
          >
            <label>
              Patient
              <select
                value={patientTenantRecordId}
                onChange={(event) =>
                  setPatientTenantRecordId(
                    event.target.value,
                  )
                }
                required
              >
                <option value="">
                  Select active patient
                </option>
                {patients.map((patient) => (
                  <option
                    key={patient.id}
                    value={patient.id}
                  >
                    {patient.patient.displayName} —{' '}
                    {patient.patientNumber}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Encounter type
              <select
                value={type}
                onChange={(event) =>
                  setType(
                    event.target.value as EncounterType,
                  )
                }
              >
                {encounterTypes.map(
                  (encounterType) => (
                    <option
                      key={encounterType}
                      value={encounterType}
                    >
                      {encounterType.replace(
                        /_/g,
                        ' ',
                      )}
                    </option>
                  ),
                )}
              </select>
            </label>

            <label>
              First department
              <select
                value={departmentId}
                onChange={(event) =>
                  setDepartmentId(event.target.value)
                }
                required
              >
                <option value="">Select treatment department</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ gridColumn: '1 / -1' }}>
              Presenting concern / reason for visit
              <textarea
                value={reason}
                onChange={(event) =>
                  setReason(event.target.value)
                }
                maxLength={1000}
                minLength={5}
                required
                placeholder="Describe the main symptom or treatment need, when it started, how long it has lasted, and any relevant details."
              />
              <small>
                This is the clinical reason for today's visit. Staff use it with the selected department to route the patient to the right care team.
              </small>
            </label>
          </div>

          <button
            type="submit"
            disabled={
              saving ||
              !patientTenantRecordId ||
              !departmentId ||
              reason.trim().length < 5
            }
            style={{ marginTop: '1rem' }}
          >
            {saving
              ? 'Creating...'
              : 'Create Encounter'}
          </button>
        </form>
      </section>

      <section>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h2>Encounter Register</h2>
          <span>
            {encounters.length} encounter
            {encounters.length === 1 ? '' : 's'}
          </span>
        </div>

        {encounters.length === 0 ? (
          <p>
            No encounters have been created for this
            organization yet.
          </p>
        ) : (
          <div
            style={{
              overflowX: 'auto',
            }}
          >
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
              }}
            >
              <thead>
                <tr>
                  <th align="left">
                    Encounter
                  </th>
                  <th align="left">
                    Patient
                  </th>
                  <th align="left">
                    Type
                  </th>
                  <th align="left">
                    Status
                  </th>
                  <th align="left">
                    Created
                  </th>
                  <th align="left">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {encounters.map((encounter) => {
                  const patient =
                    patients.find(
                      (item) =>
                        item.id ===
                        encounter.patientTenantRecordId,
                    );
                  const activeQueueEntry =
                    encounter.queueEntries?.[0] ?? null;

                  return (
                    <tr key={encounter.id}>
                      <td>
                        <div>
                          {encounter.encounterNumber}
                        </div>
                        {activeQueueEntry ? (
                          <small>
                            Queue: {activeQueueEntry.queue?.department?.name ?? activeQueueEntry.queue?.name ?? 'Department queue'}
                            <br />
                            Number: {activeQueueEntry.queueNumber}
                            <br />
                            Position: {activeQueueEntry.position ?? '—'}
                          </small>
                        ) : null}
                      </td>
                      <td>
                        <div>
                          {patient?.patient.displayName ??
                            encounter.patientTenantRecordId}
                        </div>
                        {activeQueueEntry?.queue?.department?.name ? (
                          <small>
                            Routed to {activeQueueEntry.queue.department.name}
                          </small>
                        ) : null}
                      </td>
                      <td>
                        {encounter.type.replace(
                          /_/g,
                          ' ',
                        )}
                      </td>
                      <td>
                        {encounter.status}
                      </td>
                      <td>
                        {new Date(
                          encounter.createdAt,
                        ).toLocaleString()}
                      </td>
                      <td>
                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '0.4rem',
                          }}
                        >
                          {renderActions(encounter)}
                          <button
                            type="button"
                            onClick={() =>
                              openClinicalWorkspace(
                                encounter,
                              )
                            }
                          >
                            Clinical record
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedEncounter ? (
        <section
          style={{
            border: '1px solid currentColor',
            borderRadius: '8px',
            padding: '1rem',
            marginTop: '1.5rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '1rem',
              marginBottom: '1rem',
            }}
          >
            <div>
              <p
                style={{
                  margin: 0,
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                }}
              >
                CLINICAL RECORD
              </p>
              <h2 style={{ margin: '0.25rem 0' }}>
                {selectedEncounter.encounterNumber}
              </h2>
              <p style={{ margin: 0 }}>
                {selectedEncounter.type.replace(/_/g, ' ')}
                {' · '}
                {selectedEncounter.status}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setSelectedEncounter(null);
                clearClinicalNoteForm();
              }}
            >
              Close
            </button>
          </div>

          <div
            style={{
              borderTop: '1px solid currentColor',
              paddingTop: '1rem',
            }}
          >
            <h3>
              {editingClinicalNoteId
                ? 'Edit Draft Clinical Note'
                : 'Create Clinical Note'}
            </h3>

            {!editingClinicalNoteId ? (
              <label>
                Note type
                <select
                  value={clinicalNoteType}
                  onChange={(event) =>
                    setClinicalNoteType(
                      event.target.value as ClinicalNoteType,
                    )
                  }
                >
                  {clinicalNoteTypes.map((noteType) => (
                    <option
                      key={noteType}
                      value={noteType}
                    >
                      {noteType.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <div
              style={{
                display: 'grid',
                gap: '1rem',
                marginTop: '1rem',
              }}
            >
              <label>
                Chief complaint
                <textarea
                  value={chiefComplaint}
                  onChange={(event) =>
                    setChiefComplaint(event.target.value)
                  }
                  maxLength={2000}
                  rows={3}
                />
              </label>

              <label>
                Subjective
                <textarea
                  value={subjective}
                  onChange={(event) =>
                    setSubjective(event.target.value)
                  }
                  rows={5}
                />
              </label>

              <label>
                Objective
                <textarea
                  value={objective}
                  onChange={(event) =>
                    setObjective(event.target.value)
                  }
                  rows={5}
                />
              </label>

              <label>
                Assessment
                <textarea
                  value={assessment}
                  onChange={(event) =>
                    setAssessment(event.target.value)
                  }
                  rows={5}
                />
              </label>

              <label>
                Plan
                <textarea
                  value={plan}
                  onChange={(event) =>
                    setPlan(event.target.value)
                  }
                  rows={5}
                />
              </label>
            </div>

            <div
              style={{
                display: 'flex',
                gap: '0.5rem',
                flexWrap: 'wrap',
                marginTop: '1rem',
              }}
            >
              <button
                type="button"
                disabled={clinicalNoteSaving}
                onClick={() =>
                  void handleClinicalNoteSave()
                }
              >
                {clinicalNoteSaving
                  ? 'Saving...'
                  : editingClinicalNoteId
                    ? 'Save Draft'
                    : 'Create Draft'}
              </button>

              {editingClinicalNoteId ? (
                <button
                  type="button"
                  disabled={clinicalNoteSaving}
                  onClick={clearClinicalNoteForm}
                >
                  Cancel Edit
                </button>
              ) : null}
            </div>
          </div>

          <div
            style={{
              borderTop: '1px solid currentColor',
              marginTop: '1.5rem',
              paddingTop: '1rem',
            }}
          >
            <h3>Clinical Notes</h3>

            {clinicalNotesLoading ? (
              <p>Loading clinical notes...</p>
            ) : clinicalNotes.length === 0 ? (
              <p>No clinical notes have been created for this encounter.</p>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gap: '1rem',
                }}
              >
                {clinicalNotes.map((note) => (
                  <article
                    key={note.id}
                    style={{
                      border: '1px solid currentColor',
                      borderRadius: '8px',
                      padding: '1rem',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: '1rem',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <strong>{note.noteNumber}</strong>
                        <div>
                          {note.type.replace(/_/g, ' ')}
                          {' · '}
                          {note.status}
                        </div>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          gap: '0.5rem',
                          flexWrap: 'wrap',
                        }}
                      >
                        {note.status === 'DRAFT' ? (
                          <>
                            <button
                              type="button"
                              disabled={clinicalNoteSaving}
                              onClick={() =>
                                populateClinicalNote(note)
                              }
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              disabled={clinicalNoteSaving}
                              onClick={() =>
                                void handleClinicalNoteAction(
                                  note,
                                  'sign',
                                )
                              }
                            >
                              Sign
                            </button>
                          </>
                        ) : null}

                        {note.status === 'SIGNED' ? (
                          <button
                            type="button"
                            disabled={clinicalNoteSaving}
                            onClick={() =>
                              void handleClinicalNoteAction(
                                note,
                                'finalize',
                              )
                            }
                          >
                            Finalize
                          </button>
                        ) : null}

                        {note.status === 'AMENDED' ? (
                          <button
                            type="button"
                            disabled={clinicalNoteSaving}
                            onClick={() =>
                              void handleClinicalNoteAction(
                                note,
                                'sign',
                              )
                            }
                          >
                            Sign Amendment
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <dl
                      style={{
                        display: 'grid',
                        gridTemplateColumns:
                          'max-content 1fr',
                        gap: '0.5rem 1rem',
                        marginTop: '1rem',
                      }}
                    >
                      <dt>Chief complaint</dt>
                      <dd>{note.chiefComplaint || '—'}</dd>

                      <dt>Subjective</dt>
                      <dd style={{ whiteSpace: 'pre-wrap' }}>
                        {note.subjective || '—'}
                      </dd>

                      <dt>Objective</dt>
                      <dd style={{ whiteSpace: 'pre-wrap' }}>
                        {note.objective || '—'}
                      </dd>

                      <dt>Assessment</dt>
                      <dd style={{ whiteSpace: 'pre-wrap' }}>
                        {note.assessment || '—'}
                      </dd>

                      <dt>Plan</dt>
                      <dd style={{ whiteSpace: 'pre-wrap' }}>
                        {note.plan || '—'}
                      </dd>
                    </dl>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      ) : null}

      {intakeEncounter ? (
        <div
          role="presentation"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'grid',
            placeItems: 'center',
            padding: '1rem',
            background: 'rgba(15, 23, 42, 0.55)',
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="encounter-checkin-title"
            style={{
              width: 'min(620px, 100%)',
              maxHeight: '90vh',
              overflowY: 'auto',
              border: '1px solid currentColor',
              borderRadius: '8px',
              padding: '1.25rem',
              background: 'var(--background, white)',
            }}
          >
            <h2 id="encounter-checkin-title">
              Confirm check-in and department routing
            </h2>
            <p>
              The presenting concern and department decide which clinical queue receives this patient.
            </p>
            {error ? <p role="alert">{error}</p> : null}

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submitCheckIn();
              }}
              style={{ display: 'grid', gap: '1rem' }}
            >
              <label>
                First treatment department
                <select
                  value={intakeDepartmentId}
                  onChange={(event) =>
                    setIntakeDepartmentId(event.target.value)
                  }
                  required
                >
                  <option value="">Select department</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Presenting concern / reason for visit
                <textarea
                  value={intakeReason}
                  onChange={(event) => setIntakeReason(event.target.value)}
                  minLength={5}
                  maxLength={1000}
                  required
                  rows={5}
                  placeholder="Describe the main symptom or need, when it started, how long it has lasted, and relevant details."
                />
              </label>

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="submit"
                  disabled={
                    actionEncounterId === intakeEncounter.id ||
                    !intakeDepartmentId ||
                    intakeReason.trim().length < 5
                  }
                >
                  {actionEncounterId === intakeEncounter.id
                    ? 'Checking in...'
                    : 'Check in and queue patient'}
                </button>
                <button
                  type="button"
                  disabled={actionEncounterId === intakeEncounter.id}
                  onClick={() => setIntakeEncounter(null)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  );
}
