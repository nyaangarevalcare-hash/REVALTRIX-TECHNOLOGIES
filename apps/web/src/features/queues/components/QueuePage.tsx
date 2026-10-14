import { Badge } from '@/components/ui/badge';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  callQueueEntry,
  cancelQueueEntry,
  completeQueueEntry,
  createPatientJourneyHandoff,
  createQueueCareRecord,
  createQueue,
  downloadQueueCareAttachment,
  getQueueEntries,
  getQueueCareRecords,
  getQueues,
  noShowQueueEntry,
  reconcileTodayQueues,
  skipQueueEntry,
  startQueueEntry,
  uploadQueueCareAttachment,
} from '../api/queues.api.js';
import type { QueueCareRecord } from '../api/queues.api.js';
import type { Queue, QueueEntry } from '../types/queue.types.js';
import { getDepartments } from '../../departments/api/departments.api.js';
import type { Department } from '../../departments/types/department.types.js';

interface QueuePageProps {
  onNavigate: (path: string) => void;
}

type QueueAction = 'call' | 'start' | 'skip' | 'no-show' | 'cancel' | 'care-record' | 'view-record';

type CarePurpose = 'record' | 'refer' | 'view';

function patientName(entry: QueueEntry): string {
  const name = [
    entry.patientTenantRecord.patientProfile.firstName,
    entry.patientTenantRecord.patientProfile.secondName,
  ]
    .filter(Boolean)
    .join(' ')
    .trim();

  return name || 'Unnamed patient';
}

function referredHandoff(entry: QueueEntry) {
  if (entry.status !== 'COMPLETED') {
    return null;
  }

  const handoff = entry.journeySteps?.[0]?.handoffsFrom?.[0];

  if (!handoff || !['PENDING', 'ACCEPTED', 'COMPLETED'].includes(handoff.status)) {
    return null;
  }

  return handoff;
}

function isReferredEntry(entry: QueueEntry): boolean {
  return referredHandoff(entry) !== null;
}

function statusLabel(status: QueueEntry['status']): string {
  switch (status) {
    case 'WAITING':
      return 'Waiting';
    case 'CALLED':
      return 'Called';
    case 'IN_SERVICE':
      return 'In service';
    case 'COMPLETED':
      return 'Completed';
    case 'SKIPPED':
      return 'Skipped';
    case 'NO_SHOW':
      return 'No-show';
    case 'CANCELLED':
      return 'Cancelled';
    case 'CREATED':
      return 'Created';
    default:
      return status;
  }
}

function priorityLabel(priority: QueueEntry['priority']): string {
  switch (priority) {
    case 'EMERGENCY':
      return 'Emergency';
    case 'PRIORITY':
      return 'Priority';
    case 'URGENT':
      return 'Urgent';
    case 'ROUTINE':
    default:
      return 'Routine';
  }
}

function isTerminal(entry: QueueEntry): boolean {
  if (isReferredEntry(entry)) {
    return false;
  }

  return (
    entry.status === 'COMPLETED' ||
    entry.status === 'SKIPPED' ||
    entry.status === 'CANCELLED' ||
    entry.status === 'NO_SHOW'
  );
}

function formatTime(value: string | null): string {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function renderActions(
  entry: QueueEntry,
  busy: boolean,
  onAction: (entry: QueueEntry, action: QueueAction) => void,
) {
  if (isReferredEntry(entry)) {
    return (
      <button
        type="button"
        className="queue-action-button queue-action-button--record"
        disabled={busy}
        onClick={() => onAction(entry, 'care-record')}
      >
        Open clinical record
      </button>
    );
  }

  if (isTerminal(entry)) {
    return <span>—</span>;
  }

  return (
    <div className="queue-entry-actions">
      {entry.status === 'WAITING' ? (
        <button
          type="button"
          className="queue-action-button queue-action-button--call"
          disabled={busy}
          onClick={() => onAction(entry, 'call')}
        >
          {busy ? 'Calling...' : 'Call'}
        </button>
      ) : null}

      {entry.status === 'CALLED' ? (
        <>
          <button
            type="button"
            className="queue-action-button queue-action-button--start"
            disabled={busy}
            onClick={() => onAction(entry, 'start')}
          >
            {busy ? 'Starting...' : 'Start'}
          </button>
          <button
            type="button"
            className="queue-action-button queue-action-button--recall"
            disabled={busy}
            onClick={() => onAction(entry, 'call')}
          >
            {busy ? 'Recalling...' : 'Recall'}
          </button>
          <button
            type="button"
            className="queue-action-button queue-action-button--no-show"
            disabled={busy}
            onClick={() => onAction(entry, 'no-show')}
          >
            No-show
          </button>
        </>
      ) : null}

      {entry.status === 'IN_SERVICE' ? (
        <button
          type="button"
          className="queue-action-button queue-action-button--record"
          disabled={busy}
          onClick={() => onAction(entry, 'care-record')}
        >
          {(entry._count?.careRecords ?? 0) > 0 ? 'Open clinical record' : 'Record care'}
        </button>
      ) : null}

      {entry.status === 'WAITING' ? (
        <details>
          <summary>More actions</summary>
          <div style={{ display: 'grid', gap: '0.4rem', paddingTop: '0.4rem' }}>
            <button
              type="button"
              className="queue-action-button queue-action-button--secondary"
              disabled={busy}
              onClick={() => onAction(entry, 'skip')}
            >
              Skip
            </button>
            <button
              type="button"
              className="queue-action-button queue-action-button--no-show"
              disabled={busy}
              onClick={() => onAction(entry, 'cancel')}
            >
              Cancel
            </button>
          </div>
        </details>
      ) : null}
    </div>
  );
}

export function QueuePage({ onNavigate }: QueuePageProps) {
  const [queues, setQueues] = useState<Queue[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedQueueId, setSelectedQueueId] = useState(
    () => new URLSearchParams(window.location.search).get('queueId') ?? '',
  );
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [manageEntryId, setManageEntryId] = useState<string | null>(null);

  const [queueName, setQueueName] = useState('');
  const [queueCode, setQueueCode] = useState('');
  const [queueDescription, setQueueDescription] = useState('');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingQueue, setSavingQueue] = useState(false);
  const [busyEntryId, setBusyEntryId] = useState<string | null>(null);
  const [careEntry, setCareEntry] = useState<QueueEntry | null>(null);
  const [careRecords, setCareRecords] = useState<QueueCareRecord[]>([]);
  const [careNote, setCareNote] = useState('');
  const [careProcedures, setCareProcedures] = useState('');
  const [careFiles, setCareFiles] = useState<File[]>([]);
  const [careDocumentUrl, setCareDocumentUrl] = useState('');
  const [carePurpose, setCarePurpose] = useState<CarePurpose>('record');
  const [loadingCareRecords, setLoadingCareRecords] = useState(false);
  const [savingCare, setSavingCare] = useState(false);
  const [destinationDepartmentId, setDestinationDepartmentId] = useState('');
  const [referralReason, setReferralReason] = useState('');
  const [referralInstruction, setReferralInstruction] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selectedQueue = queues.find((queue) => queue.id === selectedQueueId) ?? null;
  const manageEntry = entries.find((entry) => entry.id === manageEntryId) ?? null;

  const activeEntries = useMemo(() => entries.filter((entry) => !isTerminal(entry)), [entries]);

  const waitingEntries = useMemo(
    () => entries.filter((entry) => entry.status === 'WAITING'),
    [entries],
  );

  const calledEntries = useMemo(
    () => entries.filter((entry) => entry.status === 'CALLED'),
    [entries],
  );

  const inServiceEntries = useMemo(
    () => entries.filter((entry) => entry.status === 'IN_SERVICE'),
    [entries],
  );

  const loadEntries = useCallback(async (queueId: string): Promise<void> => {
    if (!queueId) {
      setEntries([]);
      return;
    }

    const result = await getQueueEntries(queueId);
    setEntries(result);
  }, []);

  const loadWorkspace = useCallback(
    async (showLoading = false): Promise<void> => {
      if (showLoading) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      setError(null);

      try {
        await reconcileTodayQueues();

        const [queueResult, departmentResult] = await Promise.all([getQueues(), getDepartments()]);

        setQueues(queueResult);
        setDepartments(departmentResult);

        let nextQueueId = selectedQueueId;

        if (!nextQueueId || !queueResult.some((queue) => queue.id === nextQueueId)) {
          nextQueueId = queueResult[0]?.id ?? '';
          setSelectedQueueId(nextQueueId);
        }

        if (nextQueueId) {
          await loadEntries(nextQueueId);
        } else {
          setEntries([]);
        }
      } catch (requestError) {
        setError(
          requestError instanceof Error ? requestError.message : 'Unable to load queue workspace.',
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [loadEntries, selectedQueueId],
  );

  useEffect(() => {
    void loadWorkspace(true);
  }, []);

  useEffect(() => {
    if (!selectedQueueId) {
      return;
    }

    void loadEntries(selectedQueueId);

    const interval = window.setInterval(() => {
      void loadEntries(selectedQueueId);
    }, 5000);

    return () => {
      window.clearInterval(interval);
    };
  }, [loadEntries, selectedQueueId]);

  async function handleCreateQueue(): Promise<void> {
    const name = queueName.trim();
    const code = queueCode.trim();

    if (!name || !code) {
      setError('Queue name and queue code are required.');
      return;
    }

    setSavingQueue(true);
    setError(null);
    setSuccess(null);

    try {
      const queue = await createQueue({
        name,
        code,
        description: queueDescription.trim() || undefined,
      });

      setQueues((current) => [...current, queue]);
      setSelectedQueueId(queue.id);

      setQueueName('');
      setQueueCode('');
      setQueueDescription('');

      setSuccess(`${queue.code} — ${queue.name} created successfully.`);

      await loadEntries(queue.id);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to create queue.');
    } finally {
      setSavingQueue(false);
    }
  }

  async function openCareWorkspace(
    entry: QueueEntry,
    purpose: CarePurpose = 'record',
  ): Promise<void> {
    setCareEntry(entry);
    setCarePurpose(purpose);
    setCareRecords([]);
    setCareNote('');
    setCareProcedures('');
    setCareFiles([]);
    setCareDocumentUrl('');
    setDestinationDepartmentId('');
    setReferralReason('');
    setReferralInstruction('');
    setError(null);
    setSuccess(null);
    setLoadingCareRecords(true);

    try {
      setCareRecords(await getQueueCareRecords(entry.id));
    } catch (requestError) {
      setCareEntry(null);
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to load this department care record.',
      );
    } finally {
      setLoadingCareRecords(false);
    }
  }

  async function submitCareRecord(): Promise<void> {
    if (!careEntry || loadingCareRecords || savingCare) {
      return;
    }

    const note = careNote.trim();
    const procedures = careProcedures.trim();
    const documentUrl = careDocumentUrl.trim();
    const currentStep = careEntry.journeySteps?.[0];
    const isRecording = carePurpose === 'record';

    if (carePurpose === 'refer' && (!destinationDepartmentId || !referralReason.trim())) {
      setError('Select a destination department and enter a clinical referral reason.');
      return;
    }

    if (carePurpose === 'refer' && careRecords.length === 0) {
      setError('Save a clinical record before referring this patient.');
      return;
    }

    if (carePurpose === 'refer' && !currentStep) {
      setError(
        'This queue entry is not linked to an active care-journey step and cannot be referred.',
      );
      return;
    }

    if (
      isRecording &&
      careRecords.length === 0 &&
      !note &&
      !procedures &&
      !documentUrl &&
      careFiles.length === 0
    ) {
      setError(
        'Enter a clinical note, describe procedures, provide a document URL, or attach a file.',
      );
      return;
    }

    if (isRecording && careRecords.length > 0 && careFiles.length === 0) {
      setError('A clinical record is already saved for this department step.');
      return;
    }

    setSavingCare(true);
    setError(null);
    setSuccess(null);

    try {
      let destinationStaffNotified = 0;
      const destinationName =
        departments.find((department) => department.id === destinationDepartmentId)?.name ??
        'the selected department';

      if (isRecording) {
        let recordId = careRecords[careRecords.length - 1]?.id;

        if (!recordId) {
          const createdRecord = await createQueueCareRecord(careEntry.id, {
            note: note || (careFiles.length > 0 ? 'Clinical attachment uploaded.' : undefined),
            procedures: procedures || undefined,
            documentUrl: documentUrl || undefined,
          });
          recordId = createdRecord.id;
        }

        for (const file of careFiles) {
          await uploadQueueCareAttachment(recordId, file);
        }

        const refreshedCareRecords = await getQueueCareRecords(careEntry.id);
        setCareRecords(refreshedCareRecords);
        setCareNote('');
        setCareProcedures('');
        setCareFiles([]);
        setCareDocumentUrl('');
        setSuccess('Department clinical record saved.');
      } else if (carePurpose === 'refer') {
        if (!currentStep) {
          throw new Error(
            'This queue entry is not linked to an active care-journey step and cannot be referred.',
          );
        }

        const handoffResult = await createPatientJourneyHandoff(currentStep.journeyId, {
          fromStepId: currentStep.id,
          toDepartmentId: destinationDepartmentId,
          reason: referralReason.trim(),
          instruction: referralInstruction.trim() || undefined,
        });

        destinationStaffNotified = handoffResult.data.destinationStaffNotified;
        setSuccess(
          destinationStaffNotified > 0
            ? `${careEntry.queueNumber} referred to ${destinationName} and added to its queue. ${destinationStaffNotified} destination staff member(s) notified.`
            : `${careEntry.queueNumber} was added to ${destinationName}'s queue, but no active department staff received a notification. Check the department's staff assignments.`,
        );
        setCareEntry(null);
      }

      try {
        await loadEntries(selectedQueueId);
      } catch (refreshError) {
        const refreshMessage =
          refreshError instanceof Error ? refreshError.message : 'Unable to refresh the queue.';
        setError(`The action succeeded, but the queue could not be refreshed: ${refreshMessage}`);
      }
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : 'Unable to save the clinical record and complete the requested action.';

      try {
        setCareRecords(await getQueueCareRecords(careEntry.id));
      } catch (refreshError) {
        const refreshMessage =
          refreshError instanceof Error
            ? refreshError.message
            : 'Unable to refresh saved care records.';
        setError(`${message} ${refreshMessage}`);
        return;
      }

      setError(message);
    } finally {
      setSavingCare(false);
    }
  }

  async function completeCareEntry(): Promise<void> {
    if (!careEntry || careRecords.length === 0 || savingCare) {
      return;
    }

    setSavingCare(true);
    setError(null);
    setSuccess(null);

    try {
      await completeQueueEntry(careEntry.id);
      setSuccess(`${careEntry.queueNumber} department service completed successfully.`);
      setCareEntry(null);

      try {
        await loadEntries(selectedQueueId);
      } catch (refreshError) {
        const refreshMessage =
          refreshError instanceof Error ? refreshError.message : 'Unable to refresh the queue.';
        setError(`The action succeeded, but the queue could not be refreshed: ${refreshMessage}`);
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to complete this department service.',
      );
    } finally {
      setSavingCare(false);
    }
  }

  async function handleDownloadAttachment(attachmentId: string, fileName: string): Promise<void> {
    setError(null);

    try {
      const blob = await downloadQueueCareAttachment(attachmentId);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(objectUrl);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to download the clinical attachment.',
      );
    }
  }

  async function handleAction(entry: QueueEntry, action: QueueAction): Promise<void> {
    if (action === 'care-record') {
      setManageEntryId(null);
      await openCareWorkspace(entry, isReferredEntry(entry) ? 'view' : 'record');
      return;
    }

    if (action === 'view-record') {
      setManageEntryId(null);
      await openCareWorkspace(entry, 'view');
      return;
    }

    const confirmationMessage =
      action === 'no-show'
        ? `Mark ${entry.queueNumber} as no-show?`
        : action === 'cancel'
          ? `Cancel ${entry.queueNumber}?`
          : action === 'skip'
            ? `Skip ${entry.queueNumber}?`
            : null;

    if (confirmationMessage && !window.confirm(confirmationMessage)) {
      return;
    }

    setBusyEntryId(entry.id);
    setError(null);
    setSuccess(null);

    try {
      switch (action) {
        case 'call':
          await callQueueEntry(entry.id);
          setSuccess(`${entry.queueNumber} called successfully.`);
          break;

        case 'start':
          await startQueueEntry(entry.id);
          setSuccess(`${entry.queueNumber} is now in service.`);
          break;

        case 'skip':
          await skipQueueEntry(entry.id);
          setSuccess(`${entry.queueNumber} skipped.`);
          break;

        case 'no-show':
          await noShowQueueEntry(entry.id);
          setSuccess(`${entry.queueNumber} marked as no-show.`);
          break;

        case 'cancel':
          await cancelQueueEntry(entry.id);
          setSuccess(`${entry.queueNumber} cancelled.`);
          break;
      }

      await loadEntries(selectedQueueId);
      if (action !== 'call' && action !== 'start') {
        setManageEntryId(null);
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Unable to update queue entry.',
      );
    } finally {
      setBusyEntryId(null);
    }
  }

  async function handleRefresh(): Promise<void> {
    setSuccess(null);
    await loadWorkspace(false);
  }

  if (loading) {
    return (
      <main className="registration-loading">
        <p>Loading queue workspace...</p>
      </main>
    );
  }

  return (
    <main className="queue-page">
      <header className="queue-page-header">
        <div>
          <p className="patient-dashboard-eyebrow">OPERATIONS</p>

          <h1>Queue Management</h1>

          <p>Manage today's patient flow from check-in through service completion.</p>
        </div>

        <div className="queue-page-actions">
          <button type="button" onClick={() => void handleRefresh()} disabled={refreshing}>
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>

          <button type="button" onClick={() => onNavigate('/tenant/hospital')}>
            Back to dashboard
          </button>
        </div>
      </header>

      {error ? (
        <section className="patient-dashboard-error" style={{ marginBottom: '1rem' }}>
          <p>{error}</p>
        </section>
      ) : null}

      {success ? (
        <section style={{ marginBottom: '1rem' }}>
          <p>{success}</p>
        </section>
      ) : null}

      <section className="queue-summary-grid">
        <article className="queue-summary-card">
          <strong>{activeEntries.length}</strong>
          <p>Active patients</p>
        </article>

        <article className="queue-summary-card">
          <strong>{waitingEntries.length}</strong>
          <p>Waiting</p>
        </article>

        <article className="queue-summary-card">
          <strong>{calledEntries.length}</strong>
          <p>Called</p>
        </article>

        <article className="queue-summary-card">
          <strong>{inServiceEntries.length}</strong>
          <p>In service</p>
        </article>
      </section>

      <section className="queue-workspace-grid">
        <article className="queue-panel">
          <h2>Active queues</h2>

          {queues.length === 0 ? (
            <div>
              <p>No active queues exist yet.</p>

              <p>
                The system will automatically create the General Queue when a checked-in patient
                needs to enter today's queue.
              </p>
            </div>
          ) : (
            <div className="queue-list">
              {queues.map((queue) => (
                <button
                  key={queue.id}
                  type="button"
                  className={`queue-list-item${queue.id === selectedQueueId ? ' active' : ''}`}
                  onClick={() => setSelectedQueueId(queue.id)}
                >
                  <strong>{queue.code}</strong>
                  {' — '}
                  {queue.name}

                  {queue.department ? <span>{queue.department.name}</span> : null}

                  {queue.branch ? <span>{queue.branch.name}</span> : null}
                </button>
              ))}
            </div>
          )}
        </article>

        <article className="queue-panel">
          <h2>Create operational queue</h2>

          <p>
            Queue creation is configuration. Patients are not manually added here; check-in creates
            queue entries automatically.
          </p>

          <div className="queue-form">
            <label>
              Queue name
              <input
                value={queueName}
                onChange={(event) => setQueueName(event.target.value)}
                maxLength={200}
                placeholder="Outpatient"
              />
            </label>

            <label>
              Queue code
              <input
                value={queueCode}
                onChange={(event) => setQueueCode(event.target.value)}
                maxLength={50}
                placeholder="OPD"
              />
            </label>

            <label>
              Description
              <textarea
                value={queueDescription}
                onChange={(event) => setQueueDescription(event.target.value)}
                maxLength={1000}
                placeholder="Main outpatient queue"
              />
            </label>

            <button type="button" onClick={() => void handleCreateQueue()} disabled={savingQueue}>
              {savingQueue ? 'Creating...' : 'Create queue'}
            </button>
          </div>
        </article>
      </section>

      <section>
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '1rem',
            marginBottom: '1rem',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h2>
              {selectedQueue
                ? `${selectedQueue.code} — ${selectedQueue.name}`
                : "Today's patient queue"}
            </h2>

            <p>Patients are added automatically after encounter check-in.</p>
          </div>

          {selectedQueue ? <span>{activeEntries.length} active</span> : null}
        </header>

        {!selectedQueue ? (
          <article>
            <h3>No active queue</h3>
            <p>
              There are currently no active queues with patients. Check in a patient with an
              encounter to trigger automatic queueing.
            </p>
          </article>
        ) : entries.length === 0 ? (
          <article>
            <h3>No patients waiting</h3>
            <p>No queue entries are currently recorded for this queue.</p>

            <p>A patient will appear automatically when reception checks in today's encounter.</p>
          </article>
        ) : (
          <div className="queue-table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Position</th>
                  <th>Queue No.</th>
                  <th>Patient</th>
                  <th>Status</th>
                  <th>Manage</th>
                </tr>
              </thead>

              <tbody>
                {entries.map((entry) => {
                  const busy = busyEntryId === entry.id;

                  return (
                    <tr key={entry.id}>
                      <td>
                        <span className="queue-position">{entry.position ?? '—'}</span>
                      </td>

                      <td>
                        <strong className="queue-number">{entry.queueNumber}</strong>
                      </td>

                      <td>
                        <span className="queue-patient-name">{patientName(entry)}</span>
                      </td>

                      <td>
                        {(() => {
                          const handoff = referredHandoff(entry);

                          if (handoff) {
                            return (
                              <Badge>
                                Referred
                                {handoff.toDepartment?.name
                                  ? ` from ${handoff.fromDepartment?.name ?? entry.queue.department?.name ?? 'department'} → ${handoff.toDepartment.name}`
                                  : ''}
                              </Badge>
                            );
                          }

                          return <Badge>{statusLabel(entry.status)}</Badge>;
                        })()}
                      </td>

                      <td>
                        <button
                          type="button"
                          className="queue-action-button queue-action-button--secondary"
                          disabled={busy}
                          onClick={() => {
                            setError(null);
                            setManageEntryId(entry.id);
                          }}
                        >
                          Manage
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {manageEntry ? (
        <div
          className="queue-dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && busyEntryId !== manageEntry.id) {
              setManageEntryId(null);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="queue-manage-title"
            className="queue-panel queue-manage-dialog"
          >
            <header className="queue-dialog-header">
              <div>
                <p className="patient-dashboard-eyebrow">
                  {manageEntry.queue.department?.name ?? manageEntry.queue.name}
                </p>
                <h2 id="queue-manage-title">Manage {manageEntry.queueNumber}</h2>
              </div>
              <button
                type="button"
                className="queue-action-button queue-action-button--secondary"
                disabled={busyEntryId === manageEntry.id}
                onClick={() => setManageEntryId(null)}
              >
                Close
              </button>
            </header>

            <dl className="queue-manage-details">
              <div>
                <dt>Encounter</dt>
                <dd>{manageEntry.encounter.encounterNumber}</dd>
              </div>
              <div>
                <dt>Presenting concern</dt>
                <dd>{manageEntry.reason ?? manageEntry.encounter.reason ?? 'Not recorded'}</dd>
              </div>
              <div>
                <dt>Priority</dt>
                <dd>
                  <Badge variant="outline">{priorityLabel(manageEntry.priority)}</Badge>
                </dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  {isReferredEntry(manageEntry)
                    ? `Referred to ${referredHandoff(manageEntry)?.toDepartment?.name ?? 'another department'}`
                    : statusLabel(manageEntry.status)}
                </dd>
              </div>
              <div>
                <dt>Checked in</dt>
                <dd>{formatTime(manageEntry.checkedInAt)}</dd>
              </div>
              <div>
                <dt>Patient No.</dt>
                <dd>{manageEntry.patientTenantRecord.patientNumber}</dd>
              </div>
            </dl>

            <div className="queue-manage-actions">
              {renderActions(
                manageEntry,
                busyEntryId === manageEntry.id,
                (selectedEntry, action) => void handleAction(selectedEntry, action),
              )}
            </div>
          </section>
        </div>
      ) : null}

      {careEntry ? (
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
            aria-labelledby="queue-care-title"
            className="queue-panel"
            style={{
              width: 'min(760px, 100%)',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
              <div>
                <p className="patient-dashboard-eyebrow">
                  {careEntry.queue.department?.name ?? careEntry.queue.name}
                </p>
                <h2 id="queue-care-title">
                  {carePurpose === 'refer'
                    ? `Refer ${careEntry.queueNumber}`
                    : `Clinical record — ${careEntry.queueNumber}`}
                </h2>
                <p>
                  {carePurpose === 'view'
                    ? 'Review the department clinical record and referral details.'
                    : carePurpose === 'record'
                      ? careRecords.length > 0
                        ? 'The clinical record is saved. You can now refer the patient or complete this department step.'
                        : 'Save the department clinical record once. After saving, referral and completion actions will appear here.'
                      : 'Complete the referral form to send the patient to another department.'}
                </p>
              </div>
              <button type="button" disabled={savingCare} onClick={() => setCareEntry(null)}>
                Close
              </button>
            </div>
            {error ? <p role="alert">{error}</p> : null}
            {loadingCareRecords ? <p role="status">Checking saved clinical records…</p> : null}
            {success ? (
              <p className="queue-care-success" role="status">
                {success}
              </p>
            ) : null}

            {carePurpose !== 'view' ? (
              <div className="queue-form">
                {carePurpose === 'record' && careRecords.length === 0 ? (
                  <>
                    <label>
                      Clinical note
                      <textarea
                        value={careNote}
                        onChange={(event) => setCareNote(event.target.value)}
                        maxLength={10000}
                        rows={4}
                        placeholder="Document findings, advice, or other care delivered in this department."
                      />
                    </label>

                    <label>
                      Procedures, tests, or services performed
                      <textarea
                        value={careProcedures}
                        onChange={(event) => setCareProcedures(event.target.value)}
                        maxLength={10000}
                        rows={4}
                        placeholder="Record the procedure, test, medication dispensing, imaging, or other department service."
                      />
                    </label>

                    <label>
                      Clinical document URL (optional)
                      <input
                        type="url"
                        value={careDocumentUrl}
                        onChange={(event) => setCareDocumentUrl(event.target.value)}
                        maxLength={2048}
                        placeholder="https://..."
                      />
                    </label>
                  </>
                ) : null}

                {carePurpose === 'record' ? (
                  <>
                    <label>
                      Attach clinical files (PDF, DICOM, JPEG, PNG, WebP; up to 25 MB each)
                      <input
                        type="file"
                        accept=".pdf,.dcm,application/pdf,application/dicom,image/jpeg,image/png,image/webp"
                        multiple
                        onChange={(event) => {
                          const files = Array.from(event.target.files ?? []);
                          const oversized = files.find((file) => file.size > 25 * 1024 * 1024);

                          if (oversized) {
                            setError(`${oversized.name} exceeds the 25 MB per-file limit.`);
                            event.target.value = '';
                            setCareFiles([]);
                            return;
                          }

                          setError(null);
                          setCareFiles(files);
                        }}
                      />
                    </label>
                    {careFiles.length ? <p>{careFiles.length} file(s) ready to upload.</p> : null}
                  </>
                ) : null}

                {carePurpose === 'refer' ? (
                  <>
                    <label>
                      Destination department
                      <select
                        value={destinationDepartmentId}
                        onChange={(event) => setDestinationDepartmentId(event.target.value)}
                        required
                      >
                        <option value="">Select department</option>
                        {departments
                          .filter((department) => department.id !== careEntry.queue.department?.id)
                          .map((department) => (
                            <option key={department.id} value={department.id}>
                              {department.name}
                            </option>
                          ))}
                      </select>
                    </label>

                    <label>
                      Clinical reason for referral
                      <textarea
                        value={referralReason}
                        onChange={(event) => setReferralReason(event.target.value)}
                        maxLength={1000}
                        required
                        placeholder="Explain the clinical need and what the receiving department should assess or do."
                      />
                    </label>

                    <label>
                      Instructions for the patient / receiving team (optional)
                      <textarea
                        value={referralInstruction}
                        onChange={(event) => setReferralInstruction(event.target.value)}
                        maxLength={1000}
                        placeholder="Add preparation or wayfinding instructions."
                      />
                    </label>
                  </>
                ) : null}

                <div className="queue-care-actions">
                  {carePurpose === 'record' && careRecords.length === 0 ? (
                    <button
                      type="button"
                      className="queue-action-button queue-action-button--record"
                      disabled={
                        loadingCareRecords ||
                        savingCare ||
                        (!careNote.trim() &&
                          !careProcedures.trim() &&
                          !careDocumentUrl.trim() &&
                          careFiles.length === 0)
                      }
                      onClick={() => void submitCareRecord()}
                    >
                      {savingCare ? 'Saving clinical record…' : 'Save clinical record'}
                    </button>
                  ) : null}
                  {carePurpose === 'record' && careRecords.length > 0 ? (
                    <>
                      {careFiles.length > 0 ? (
                        <button
                          type="button"
                          className="queue-action-button queue-action-button--record"
                          disabled={savingCare}
                          onClick={() => void submitCareRecord()}
                        >
                          {savingCare ? 'Saving attachments…' : 'Save attachments'}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="queue-action-button queue-action-button--refer"
                        disabled={savingCare || careRecords.length === 0}
                        onClick={() => {
                          setError(null);
                          setCarePurpose('refer');
                        }}
                      >
                        Refer
                      </button>
                      <button
                        type="button"
                        className="queue-action-button queue-action-button--complete"
                        disabled={savingCare || careRecords.length === 0}
                        onClick={() => {
                          void completeCareEntry();
                        }}
                      >
                        {savingCare ? 'Completing…' : 'Complete'}
                      </button>
                    </>
                  ) : null}
                  {carePurpose === 'refer' ? (
                    <>
                      <button
                        type="button"
                        className="queue-action-button queue-action-button--refer"
                        disabled={savingCare || !destinationDepartmentId || !referralReason.trim()}
                        onClick={() => void submitCareRecord()}
                      >
                        {savingCare ? 'Submitting referral…' : 'Submit referral'}
                      </button>
                      <button
                        type="button"
                        className="queue-action-button queue-action-button--secondary"
                        disabled={savingCare}
                        onClick={() => {
                          setError(null);
                          setCarePurpose('record');
                        }}
                      >
                        Back to clinical record
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            ) : null}

            {carePurpose === 'view' && referredHandoff(careEntry) ? (
              <section className="queue-panel" aria-label="Referral details">
                <h3>
                  Referred from{' '}
                  {referredHandoff(careEntry)?.fromDepartment?.name ??
                    careEntry.queue.department?.name ??
                    'department'}
                  {' to '}
                  {referredHandoff(careEntry)?.toDepartment?.name ?? 'another department'}
                </h3>
                <p>
                  <strong>Clinical reason:</strong>{' '}
                  {referredHandoff(careEntry)?.reason ?? 'Not recorded'}
                </p>
                {referredHandoff(careEntry)?.instruction ? (
                  <p>
                    <strong>Instructions:</strong> {referredHandoff(careEntry)?.instruction}
                  </p>
                ) : null}
              </section>
            ) : null}

            <div style={{ marginTop: '1.5rem' }}>
              <h3>Recorded care</h3>
              {careRecords.length === 0 ? (
                <p>No notes or procedures have been recorded in this queue step yet.</p>
              ) : (
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  {careRecords.map((record) => (
                    <article key={record.id} className="queue-panel">
                      <p>
                        <strong>{record.department?.name ?? 'Department'}</strong>
                        {' · '}
                        {record.author.displayName}
                        {' · '}
                        {new Date(record.createdAt).toLocaleString()}
                      </p>
                      {record.note ? (
                        <p>
                          <strong>Note:</strong> {record.note}
                        </p>
                      ) : null}
                      {record.procedures ? (
                        <p>
                          <strong>Procedures:</strong> {record.procedures}
                        </p>
                      ) : null}
                      {record.documentUrl ? (
                        <p>
                          <strong>Document URL:</strong>{' '}
                          <a href={record.documentUrl} target="_blank" rel="noopener noreferrer">
                            Open clinical document
                          </a>
                        </p>
                      ) : null}
                      {record.attachments.map((attachment) => (
                        <button
                          key={attachment.id}
                          type="button"
                          onClick={() =>
                            void handleDownloadAttachment(attachment.id, attachment.fileName)
                          }
                        >
                          Download {attachment.fileName}
                        </button>
                      ))}
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
