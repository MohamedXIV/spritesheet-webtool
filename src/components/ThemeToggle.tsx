'use client';

import React, { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

export function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    // Determine initial theme
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    const initialTheme = savedTheme || (document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    setTheme(initialTheme);
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    localStorage.setItem('theme', nextTheme);
    if (nextTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  return (
    <button
      onClick={toggleTheme}
      title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '6px 12px',
        background: 'var(--surface-color)',
        border: '2px solid var(--border-color)',
        borderRadius: 'var(--radius-sm)',
        color: 'var(--text-color)',
        cursor: 'pointer',
        boxShadow: 'var(--shadow-sm)',
        transition: 'all 0.15s ease',
        outline: 'none',
        gap: '6px',
        fontSize: '0.78rem',
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        fontFamily: 'inherit',
      }}
    >
      {theme === 'light' ? (
        <>
          <Moon size={13} />
          <span>Dark Mode</span>
        </>
      ) : (
        <>
          <Sun size={13} />
          <span>Light Mode</span>
        </>
      )}
    </button>
  );
}
