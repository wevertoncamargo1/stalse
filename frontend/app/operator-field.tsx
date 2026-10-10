'use client';

import { useEffect, useState } from 'react';
import { OPERATOR_CHANGE_EVENT, OPERATOR_STORAGE_KEY } from './operator';

export default function OperatorField() {
  const [operator, setOperator] = useState('');

  useEffect(() => {
    setOperator(window.localStorage.getItem(OPERATOR_STORAGE_KEY) ?? '');
  }, []);

  const updateOperator = (value: string) => {
    setOperator(value);
    window.localStorage.setItem(OPERATOR_STORAGE_KEY, value);
    window.dispatchEvent(new Event(OPERATOR_CHANGE_EVENT));
  };

  return (
    <label className="operator-field">
      <span>Operador</span>
      <input
        aria-label="Nome do operador para o histórico"
        autoComplete="name"
        maxLength={80}
        onChange={(event) => updateOperator(event.target.value)}
        placeholder="Seu nome"
        value={operator}
      />
    </label>
  );
}
