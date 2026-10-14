import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, RefreshCw } from 'lucide-react';
import { authenticatedApiRequest } from '../../../lib/auth-api.js';
import {
  bookPatientAppointment,
  discoverAppointmentFacilities,
  discoverAppointmentSlots,
} from '../../appointments/api/appointments.api.js';
import type {
  AppointmentFacility,
  AppointmentSlot,
} from '../../appointments/types/appointment.types.js';

interface PatientAppointment {
  id: string;
  appointmentNumber: string;
  status: string;
  startAt: string;
  endAt: string;
  timeZone: string;
  reason: string | null;
  tenant: { id: string; name: string; legalName: string | null };
  branch: { id: string; name: string } | null;
  department: { id: string; name: string } | null;
  service: { id: string; name: string; code: string } | null;
  provider: { professionalTitle: string | null; specialty: string | null } | null;
}

function formatStatus(status: string): string {
  return status.replaceAll('_', ' ').toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone,
    }).format(new Date(value));
  } catch {
    return new Date(value).toLocaleString();
  }
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function PatientAppointmentsSection() {
  const [appointments, setAppointments] = useState<PatientAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [facilities, setFacilities] = useState<AppointmentFacility[]>([]);
  const [facilitiesLoading, setFacilitiesLoading] = useState(true);
  const [facilitiesError, setFacilitiesError] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [slots, setSlots] = useState<AppointmentSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<AppointmentSlot | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingSuccess, setBookingSuccess] = useState<string | null>(null);

  const loadAppointments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await authenticatedApiRequest<PatientAppointment[]>(
        '/v1/appointments/my',
      );
      setAppointments(result);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to load your appointments.'));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFacilities = useCallback(async () => {
    setFacilitiesLoading(true);
    setFacilitiesError(null);
    try {
      const result = await discoverAppointmentFacilities();
      setFacilities(result);
    } catch (requestError) {
      setFacilitiesError(
        getErrorMessage(requestError, 'Unable to discover bookable facilities.'),
      );
    } finally {
      setFacilitiesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAppointments();
    void loadFacilities();
  }, [loadAppointments, loadFacilities]);

  const selectedFacility = facilities.find((facility) => facility.id === tenantId);
  const selectedService = selectedFacility?.services.find(
    (service) => service.id === serviceId,
  );

  function resetSlotSearch() {
    setSlots([]);
    setSelectedSlot(null);
    setSlotsError(null);
    setBookingError(null);
    setBookingSuccess(null);
  }

  async function searchSlots() {
    if (!selectedFacility || !selectedService) {
      setSlotsError('Choose a facility and service first.');
      return;
    }

    setSlotsLoading(true);
    setSlotsError(null);
    setBookingError(null);
    setBookingSuccess(null);
    setSlots([]);
    setSelectedSlot(null);

    try {
      const from = new Date();
      const to = new Date(from.getTime() + 14 * 24 * 60 * 60 * 1000);

      const result = await discoverAppointmentSlots({
        tenantId: selectedFacility.id,
        serviceId: selectedService.id,
        from: from.toISOString(),
        to: to.toISOString(),
        ...(selectedService.branchId
          ? { branchId: selectedService.branchId }
          : {}),
        ...(selectedService.departmentId
          ? { departmentId: selectedService.departmentId }
          : {}),
      });

      setSlots(result);
      if (result.length === 0) {
        setSlotsError(
          'No available slots were found in the next 14 days. Try again later or choose another service.',
        );
      }
    } catch (requestError) {
      setSlotsError(getErrorMessage(requestError, 'Unable to load available slots.'));
    } finally {
      setSlotsLoading(false);
    }
  }

  async function submitBooking() {
    if (!selectedFacility || !selectedService || !selectedSlot) {
      setBookingError('Choose an available appointment time first.');
      return;
    }

    setBooking(true);
    setBookingError(null);
    setBookingSuccess(null);

    try {
      const result = await bookPatientAppointment({
        tenantId: selectedFacility.id,
        serviceId: selectedService.id,
        providerId: selectedSlot.providerId,
        ...(selectedSlot.branchId ? { branchId: selectedSlot.branchId } : {}),
        ...(selectedSlot.departmentId
          ? { departmentId: selectedSlot.departmentId }
          : {}),
        startAt: selectedSlot.startAt,
        endAt: selectedSlot.endAt,
        timeZone: selectedSlot.timeZone,
      });

      setBookingSuccess(
        `Appointment request ${result.appointmentNumber} submitted. Current status: ${formatStatus(result.status)}. The facility may need to approve your request.`,
      );
      setSelectedSlot(null);
      setSlots([]);
      await loadAppointments();
    } catch (requestError) {
      setBookingError(
        getErrorMessage(
          requestError,
          'Booking could not be completed. Check your facility registration and selected slot.',
        ),
      );
    } finally {
      setBooking(false);
    }
  }

  const now = Date.now();
  const upcoming = appointments.filter(
    (appointment) =>
      new Date(appointment.startAt).getTime() >= now &&
      !['CANCELLED', 'REJECTED', 'NO_SHOW', 'COMPLETED'].includes(
        appointment.status,
      ),
  );
  const past = appointments.filter((appointment) => !upcoming.includes(appointment));

  function renderAppointment(appointment: PatientAppointment) {
    const providerLabel = [
      appointment.provider?.professionalTitle,
      appointment.provider?.specialty,
    ].filter(Boolean).join(' · ');

    return (
      <article className="patient-dashboard-facility-card" key={appointment.id}>
        <div className="patient-dashboard-facility-meta">
          <strong>
            {appointment.service?.name ??
              appointment.department?.name ??
              'Healthcare appointment'}
          </strong>
          <span>{appointment.tenant.name}</span>
          {appointment.branch && <span>Branch: {appointment.branch.name}</span>}
          {appointment.department && appointment.service && (
            <span>Department: {appointment.department.name}</span>
          )}
          {providerLabel && <span>{providerLabel}</span>}
          <span>{formatDate(appointment.startAt, appointment.timeZone)}</span>
          <span>Status: {formatStatus(appointment.status)}</span>
          <span>Reference: {appointment.appointmentNumber}</span>
          {appointment.reason && <span>Reason: {appointment.reason}</span>}
        </div>
      </article>
    );
  }

  return (
    <section className="patient-dashboard-section patient-patient-content-panel">
      <div className="patient-dashboard-section-header">
        <div>
          <p className="patient-dashboard-eyebrow">YOUR CARE</p>
          <h1>Appointments</h1>
          <p>
            Discover facilities, request appointments, and follow your care
            across connected facilities.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadAppointments()}
          disabled={loading}
          aria-label="Refresh appointments"
        >
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      <div className="patient-dashboard-section-header">
        <div>
          <h2>Book an appointment</h2>
          <p>Choose a facility and service to see genuine available times.</p>
        </div>
      </div>

      <div className="patient-dashboard-facility-card">
        {facilitiesLoading ? (
          <p>Loading bookable facilities…</p>
        ) : facilitiesError ? (
          <div role="alert">
            <p>{facilitiesError}</p>
            <button type="button" onClick={() => void loadFacilities()}>
              Try again
            </button>
          </div>
        ) : facilities.length === 0 ? (
          <p>
            No facilities with bookable services and provider availability were
            found at the moment. Please check again later.
          </p>
        ) : (
          <div className="patient-dashboard-facility-meta">
            <label htmlFor="appointment-facility">Facility</label>
            <select
              id="appointment-facility"
              value={tenantId}
              onChange={(event) => {
                setTenantId(event.target.value);
                setServiceId('');
                resetSlotSearch();
              }}
            >
              <option value="">Choose a facility</option>
              {facilities.map((facility) => (
                <option key={facility.id} value={facility.id}>
                  {facility.profile?.businessName || facility.name}
                  {facility.profile?.county ? ` — ${facility.profile.county}` : ''}
                </option>
              ))}
            </select>

            {selectedFacility && (
              <>
                {selectedFacility.profile?.address && (
                  <span>{selectedFacility.profile.address}</span>
                )}
                {selectedFacility.profile?.description && (
                  <span>{selectedFacility.profile.description}</span>
                )}
                <label htmlFor="appointment-service">Service</label>
                <select
                  id="appointment-service"
                  value={serviceId}
                  onChange={(event) => {
                    setServiceId(event.target.value);
                    resetSlotSearch();
                  }}
                >
                  <option value="">Choose a service</option>
                  {selectedFacility.services.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name}
                      {service.durationMin ? ` (${service.durationMin} min)` : ''}
                    </option>
                  ))}
                </select>
                {selectedService?.description && <span>{selectedService.description}</span>}
                {selectedService && (
                  <button
                    type="button"
                    onClick={() => void searchSlots()}
                    disabled={slotsLoading || booking}
                  >
                    {slotsLoading ? 'Searching available times…' : 'Find available times'}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {slotsError && (
        <div className="patient-dashboard-empty" role="alert">
          <p>{slotsError}</p>
        </div>
      )}

      {slots.length > 0 && (
        <div>
          <div className="patient-dashboard-section-header">
            <h2>Available times</h2>
            <span className="patient-dashboard-count">{slots.length}</span>
          </div>
          <p>Times are shown in the provider’s configured time zone.</p>
          <div className="patient-dashboard-request-list">
            {slots.map((slot) => {
              const selected =
                selectedSlot?.providerId === slot.providerId &&
                selectedSlot?.startAt === slot.startAt;

              return (
                <button
                  type="button"
                  key={`${slot.providerId}:${slot.startAt}`}
                  className="patient-dashboard-facility-card"
                  aria-pressed={selected}
                  onClick={() => {
                    setSelectedSlot(slot);
                    setBookingError(null);
                    setBookingSuccess(null);
                  }}
                  disabled={booking}
                >
                  <div className="patient-dashboard-facility-meta">
                    <strong>{formatDate(slot.startAt, slot.timeZone)}</strong>
                    <span>
                      {[slot.providerTitle, slot.specialty].filter(Boolean).join(' · ') ||
                        'Available provider'}
                    </span>
                    {selected && <span>Selected</span>}
                  </div>
                </button>
              );
            })}
          </div>
          {selectedSlot && (
            <div className="patient-dashboard-facility-card">
              <p>
                Selected: {formatDate(selectedSlot.startAt, selectedSlot.timeZone)}
              </p>
              <button
                type="button"
                onClick={() => void submitBooking()}
                disabled={booking}
              >
                {booking ? 'Submitting request…' : 'Request appointment'}
              </button>
            </div>
          )}
        </div>
      )}

      {bookingError && (
        <div className="patient-dashboard-empty" role="alert">
          <h2>Booking could not be completed</h2>
          <p>{bookingError}</p>
          <p>
            If you are not registered with this facility, complete its patient
            registration process before booking. Your facility relationship
            will not be activated automatically.
          </p>
        </div>
      )}

      {bookingSuccess && (
        <div className="patient-dashboard-empty" role="status">
          <h2>Appointment request submitted</h2>
          <p>{bookingSuccess}</p>
        </div>
      )}

      <div className="patient-dashboard-section-header">
        <h2>Your upcoming appointments</h2>
        <span className="patient-dashboard-count">{upcoming.length}</span>
      </div>

      {loading ? (
        <div className="patient-dashboard-empty"><p>Loading your appointments…</p></div>
      ) : error ? (
        <div className="patient-dashboard-empty" role="alert">
          <h2>Could not load appointments</h2>
          <p>{error}</p>
          <button type="button" onClick={() => void loadAppointments()}>Try again</button>
        </div>
      ) : (
        <>
          {upcoming.length ? (
            <div className="patient-dashboard-request-list">
              {upcoming.map(renderAppointment)}
            </div>
          ) : (
            <div className="patient-dashboard-empty">
              <CalendarDays size={28} />
              <p>You have no upcoming appointments.</p>
            </div>
          )}

          <div className="patient-dashboard-section-header">
            <h2>Previous and other appointments</h2>
            <span className="patient-dashboard-count">{past.length}</span>
          </div>
          {past.length ? (
            <div className="patient-dashboard-request-list">
              {past.map(renderAppointment)}
            </div>
          ) : (
            <div className="patient-dashboard-empty">
              <p>No previous appointments to show.</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
