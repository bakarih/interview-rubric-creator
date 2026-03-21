'use client';

import { useState, useRef, useEffect } from 'react';

const REPO_URL = 'https://github.com/bakarih/interview-rubric-creator';

const LINKS = [
  {
    label: 'Share Feedback',
    description: 'Tell us about your experience',
    href: `${REPO_URL}/issues/new?template=feedback.yml`,
  },
  {
    label: 'Report a Bug',
    description: 'Something isn\u2019t working',
    href: `${REPO_URL}/issues/new?template=bug_report.yml`,
  },
  {
    label: 'Suggest a Feature',
    description: 'Have an idea?',
    href: `${REPO_URL}/issues/new?template=feature_request.yml`,
  },
  {
    label: 'Contribute Code',
    description: 'Open a PR on GitHub',
    href: `${REPO_URL}/blob/main/CONTRIBUTING.md`,
  },
];

export default function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <div ref={menuRef} className="fixed bottom-5 left-5 z-50">
      {open && (
        <div
          role="menu"
          aria-label="Feedback options"
          className="mb-2 w-64 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg overflow-hidden"
        >
          {LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              role="menuitem"
              className="block px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors border-b border-gray-100 dark:border-gray-800 last:border-b-0"
              onClick={() => setOpen(false)}
            >
              <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                {link.label}
              </span>
              <span className="block text-xs text-gray-500 dark:text-gray-400">
                {link.description}
              </span>
            </a>
          ))}
        </div>
      )}
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Feedback"
        className="flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg hover:bg-blue-700 transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        Feedback
      </button>
    </div>
  );
}
