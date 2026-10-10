'use client';

import { useEffect, useRef } from 'react';

type SnackbarProps = {
  message: string;
  variant: 'success' | 'error';
  onDismiss: () => void;
};

export default function Snackbar({ message, variant, onDismiss }: SnackbarProps) {
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    const timeout = window.setTimeout(() => onDismissRef.current(), 3500);
    return () => window.clearTimeout(timeout);
  }, [message, variant]);

  return (
    <div
      className={`snackbar snackbar-${variant}`}
      role={variant === 'error' ? 'alert' : 'status'}
      aria-live={variant === 'error' ? 'assertive' : 'polite'}
    >
      {message}
    </div>
  );
}
