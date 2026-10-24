import { useSyncExternalStore } from 'react';

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

// Shared across components so a rename in the header reaches the room page instantly.
let state = { username: getStoredUsername(), editing: false };
const listeners = new Set();

function setState(patch) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function persistUsername(value) {
  const cleaned = value.trim();
  if (!cleaned) {
    return { ok: false };
  }

  saveStoredUsername(cleaned);
  setState({ username: cleaned, editing: false });
  return { ok: true, value: cleaned };
}

const editUsername = () => setState({ editing: true });
const cancelEdit = () => setState({ editing: false });

export function useUsername() {
  const { username, editing } = useSyncExternalStore(subscribe, () => state);
  return { username, editing, persistUsername, editUsername, cancelEdit };
}
