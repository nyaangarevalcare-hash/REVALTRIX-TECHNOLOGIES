import { useState, type FormEvent } from 'react';
import { updateStaffProfile } from '../api/staff.api.js';
import type { StaffMember, StaffProfessionalCategory } from '../types/staff.types.js';

const CATEGORIES: StaffProfessionalCategory[] = [
  'DOCTOR', 'DENTIST', 'NURSE', 'MIDWIFE', 'PHARMACIST', 'LAB_SCIENTIST', 'RADIOGRAPHER',
  'PHYSIOTHERAPIST', 'NUTRITIONIST', 'PSYCHOLOGIST', 'OPTOMETRIST', 'TECHNICIAN', 'ADMIN',
  'RECEPTIONIST', 'OTHER',
];

interface StaffProfileEditorProps {
  member: StaffMember;
  onCancel: () => void;
  onSaved: () => void;
}

export function StaffProfileEditor({ member, onCancel, onSaved }: StaffProfileEditorProps) {
  if (!member) {
    return <div className="registration-loading">Loading profile details...</div>;
  }
  const [draft, setDraft] = useState({
    firstName: member.firstName,
    middleName: member.middleName ?? '',
    lastName: member.lastName,
    phone: member.phone ?? '',
    whatsappNumber: member.whatsappNumber ?? '',
    gender: member.gender ?? '',
    dateOfBirth: member.dateOfBirth?.slice(0, 10) ?? '',
    nationality: member.nationality ?? '',
    physicalAddress: member.physicalAddress ?? '',
    jobTitle: member.jobTitle ?? '',
    professionalCategory: member.professionalCategory ?? 'OTHER',
    licenseNumber: member.licenseNumber ?? '',
    specialty: member.specialty ?? '',
    subSpecialty: member.subSpecialty ?? '',
    licensingBody: member.licensingBody ?? '',
    licenseExpiresAt: member.licenseExpiresAt?.slice(0, 10) ?? '',
    qualifications: member.qualifications ?? '',
    yearsExperience: member.yearsExperience?.toString() ?? '',
    languages: member.languages.join(', '),
    consultationFee: member.consultationFee?.toString() ?? '',
    telehealthEnabled: member.telehealthEnabled,
    acceptsOnlineBookings: member.acceptsOnlineBookings,
    acceptsNewPatients: member.acceptsNewPatients,
    professionalBio: member.professionalBio ?? '',
    nationalId: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setField<K extends keyof typeof draft>(field: K, value: (typeof draft)[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await updateStaffProfile(member.id, {
        firstName: draft.firstName.trim(),
        middleName: draft.middleName.trim(),
        lastName: draft.lastName.trim(),
        phone: draft.phone.trim(),
        whatsappNumber: draft.whatsappNumber.trim(),
        gender: draft.gender,
        dateOfBirth: draft.dateOfBirth || undefined,
        nationalId: draft.nationalId.trim() || undefined,
        nationality: draft.nationality.trim(),
        physicalAddress: draft.physicalAddress.trim(),
        jobTitle: draft.jobTitle.trim(),
        professionalCategory: draft.professionalCategory,
        licenseNumber: draft.licenseNumber.trim(),
        specialty: draft.specialty.trim(),
        subSpecialty: draft.subSpecialty.trim(),
        licensingBody: draft.licensingBody.trim(),
        licenseExpiresAt: draft.licenseExpiresAt || undefined,
        qualifications: draft.qualifications.trim(),
        yearsExperience: draft.yearsExperience ? Number(draft.yearsExperience) : undefined,
        languages: draft.languages.split(',').map((language) => language.trim()).filter(Boolean),
        consultationFee: draft.consultationFee ? Number(draft.consultationFee) : undefined,
        telehealthEnabled: draft.telehealthEnabled,
        acceptsOnlineBookings: draft.acceptsOnlineBookings,
        acceptsNewPatients: draft.acceptsNewPatients,
        professionalBio: draft.professionalBio.trim(),
      });
      onSaved();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to update staff profile.');
    } finally {
      setSaving(false);
    }
  }

  const clinical = !['ADMIN', 'RECEPTIONIST', 'OTHER'].includes(draft.professionalCategory);

  return (
    <form className="tenant-form staff-profile-editor" onSubmit={(event) => void submit(event)}>
      <h4>Edit staff profile</h4>
      {error && <div className="registration-error" role="alert">{error}</div>}
      <div className="tenant-form-grid">
        <label>First name<input required maxLength={100} value={draft.firstName} onChange={(event) => setField('firstName', event.target.value)} /></label>
        <label>Middle name<input maxLength={100} value={draft.middleName} onChange={(event) => setField('middleName', event.target.value)} /></label>
        <label>Last name<input required maxLength={100} value={draft.lastName} onChange={(event) => setField('lastName', event.target.value)} /></label>
        <label>Personal phone<input required minLength={7} maxLength={50} value={draft.phone} onChange={(event) => setField('phone', event.target.value)} /></label>
        <label>WhatsApp number<input maxLength={50} value={draft.whatsappNumber} onChange={(event) => setField('whatsappNumber', event.target.value)} /></label>
        <label>Gender<select required value={draft.gender} onChange={(event) => setField('gender', event.target.value)}><option value="">Select</option><option value="FEMALE">Female</option><option value="MALE">Male</option><option value="NON_BINARY">Non-binary</option><option value="PREFER_NOT_TO_SAY">Prefer not to say</option><option value="OTHER">Other</option></select></label>
        <label>Date of birth<input type="date" value={draft.dateOfBirth} onChange={(event) => setField('dateOfBirth', event.target.value)} /></label>
        <label>Nationality<input required minLength={2} maxLength={100} value={draft.nationality} onChange={(event) => setField('nationality', event.target.value)} /></label>
        <label>Replace national ID / passport number<input maxLength={150} autoComplete="off" value={draft.nationalId} onChange={(event) => setField('nationalId', event.target.value)} placeholder={member.nationalId ? 'Encrypted value on file' : 'Enter ID or passport number'} /></label>
        <label>Job title<input required maxLength={150} value={draft.jobTitle} onChange={(event) => setField('jobTitle', event.target.value)} /></label>
        <label>Professional category<select value={draft.professionalCategory} onChange={(event) => setField('professionalCategory', event.target.value as StaffProfessionalCategory)}>{CATEGORIES.map((category) => <option key={category} value={category}>{category.replaceAll('_', ' ')}</option>)}</select></label>
        <label>Specialty<input maxLength={200} value={draft.specialty} onChange={(event) => setField('specialty', event.target.value)} /></label>
        {clinical && <>
          <label>Sub-specialty<input maxLength={200} value={draft.subSpecialty} onChange={(event) => setField('subSpecialty', event.target.value)} /></label>
          <label>License number<input required maxLength={150} value={draft.licenseNumber} onChange={(event) => setField('licenseNumber', event.target.value)} /></label>
          <label>Licensing body<input maxLength={200} value={draft.licensingBody} onChange={(event) => setField('licensingBody', event.target.value)} /></label>
          <label>License expiry<input type="date" required value={draft.licenseExpiresAt} onChange={(event) => setField('licenseExpiresAt', event.target.value)} /></label>
          <label>Years of experience<input type="number" min={0} max={80} value={draft.yearsExperience} onChange={(event) => setField('yearsExperience', event.target.value)} /></label>
          <label>Consultation fee<input type="number" min={0} step="0.01" value={draft.consultationFee} onChange={(event) => setField('consultationFee', event.target.value)} /></label>
          <label>Languages spoken<input value={draft.languages} onChange={(event) => setField('languages', event.target.value)} /></label>
          <label className="staff-toggle"><input type="checkbox" checked={draft.telehealthEnabled} onChange={(event) => setField('telehealthEnabled', event.target.checked)} />Telehealth enabled</label>
          <label className="staff-toggle"><input type="checkbox" checked={draft.acceptsOnlineBookings} onChange={(event) => setField('acceptsOnlineBookings', event.target.checked)} />Accepts online bookings</label>
          <label className="staff-toggle"><input type="checkbox" checked={draft.acceptsNewPatients} onChange={(event) => setField('acceptsNewPatients', event.target.checked)} />Accepts new patients</label>
          <label className="staff-field-wide">Professional bio<textarea rows={3} maxLength={4000} value={draft.professionalBio} onChange={(event) => setField('professionalBio', event.target.value)} /></label>
        </>}
        {!clinical && <label>Qualifications<input maxLength={1000} value={draft.qualifications} onChange={(event) => setField('qualifications', event.target.value)} /></label>}
        <label className="staff-field-wide">Physical address<textarea rows={2} maxLength={1000} value={draft.physicalAddress} onChange={(event) => setField('physicalAddress', event.target.value)} /></label>
      </div>
      <div className="branches-form-actions"><button type="button" className="dashboard-secondary-button" disabled={saving} onClick={onCancel}>Cancel</button><button type="submit" className="dashboard-primary-button" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button></div>
    </form>
  );
}
