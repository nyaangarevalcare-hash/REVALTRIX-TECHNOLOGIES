import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface StaffDialogProps {
  title: string;
  size?: 'standard' | 'wide';
  onClose: () => void;
  children: ReactNode;
}

export function StaffDialog({ title, size = 'standard', onClose, children }: StaffDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className={`staff-dialog staff-dialog-${size}`}
      aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      onClose={onClose}
    >
      <header className="staff-dialog-header">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="staff-dialog-close" aria-label="Close dialog" title="Close" onClick={onClose}>
          <X aria-hidden="true" />
        </button>
      </header>
      <div className="staff-dialog-body">{children}</div>
    </dialog>
  );
}