import { useEffect, useState } from 'react';
import { downloadStaffPhoto } from '../api/staff.api.js';
import type { StaffMember } from '../types/staff.types.js';

interface StaffAvatarProps {
  member: Pick<StaffMember, 'id' | 'firstName' | 'lastName' | 'hasProfilePhoto'>;
  size?: 'small' | 'large';
}

export function StaffAvatar({ member, size = 'small' }: StaffAvatarProps) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!member.hasProfilePhoto) {
      setPhotoUrl(null);
      return;
    }
    let active = true;
    let objectUrl: string | null = null;
    void downloadStaffPhoto(member.id)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (active) setPhotoUrl(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      })
      .catch(() => {
        if (active) setPhotoUrl(null);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [member.id, member.hasProfilePhoto]);

  const initials = `${member.firstName[0] ?? ''}${member.lastName[0] ?? ''}`;
  return photoUrl ? (
    <img className={`staff-avatar staff-avatar-${size}`} src={photoUrl} alt={`${member.firstName} ${member.lastName}`} />
  ) : (
    <span className={`staff-avatar staff-avatar-${size}`} aria-hidden="true">{initials}</span>
  );
}
