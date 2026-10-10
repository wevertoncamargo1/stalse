'use client';

import { useEffect, useState } from 'react';

export const OPERATOR_STORAGE_KEY = 'stalse-operator-name';
export const OPERATOR_CHANGE_EVENT = 'stalse-operator-change';

export function getOperatorName(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(OPERATOR_STORAGE_KEY)?.trim() ?? '';
}

export function getOperatorHeaders(): Record<string, string> {
  const operator = getOperatorName();
  return operator ? { 'X-Operator-Name': operator } : {};
}

export function useOperatorName(): string {
  const [operator, setOperator] = useState('');

  useEffect(() => {
    const refresh = () => setOperator(getOperatorName());
    refresh();
    window.addEventListener(OPERATOR_CHANGE_EVENT, refresh);
    return () => window.removeEventListener(OPERATOR_CHANGE_EVENT, refresh);
  }, []);

  return operator;
}
