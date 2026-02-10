import { useEffect, useState } from 'react';

const MAX_ENTRIES = 20;
const entries = [];
const listeners = new Set();
let counter = 0;

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString();
}

function notify() {
  listeners.forEach((listener) => listener());
}

export function logEvent(label, detail = '') {
  const entry = {
    id: `${Date.now()}-${counter++}`,
    label,
    detail,
    time: formatTime(Date.now()),
  };

  entries.push(entry);
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES);
  }
  notify();
}

export function clearLog() {
  entries.length = 0;
  notify();
}

export function getLogs() {
  return [...entries];
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useLog() {
  const [logs, setLogs] = useState(getLogs());

  useEffect(() => {
    const unsubscribe = subscribe(() => setLogs(getLogs()));
    return unsubscribe;
  }, []);

  return logs;
}
