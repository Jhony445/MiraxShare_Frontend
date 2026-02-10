import { useEffect, useState } from 'react';

const STORAGE_KEY = 'mx-username';

export function getStoredUsername() {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(STORAGE_KEY) || '';
  } catch (_err) {
    return '';
  }
}

export function saveStoredUsername(value) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch (_err) {
    // Ignore storage errors.
  }
}

export function useUsername() {
  const [username, setUsername] = useState(() => getStoredUsername());
  const [needsPrompt, setNeedsPrompt] = useState(() => !getStoredUsername());

  useEffect(() => {
    if (username) {
      setNeedsPrompt(false);
    }
  }, [username]);

  const persistUsername = (value) => {
    const cleaned = value.trim();
    if (!cleaned) {
      return { ok: false };
    }

    saveStoredUsername(cleaned);
    setUsername(cleaned);
    setNeedsPrompt(false);
    return { ok: true, value: cleaned };
  };

  return {
    username,
    needsPrompt,
    persistUsername,
  };
}
