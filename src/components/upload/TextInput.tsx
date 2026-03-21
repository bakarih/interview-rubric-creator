'use client';

interface TextInputProps {
  value: string;
  onChange: (text: string) => void;
  disabled?: boolean;
}

const MAX_CHARS = 50000;

export default function TextInput({ value, onChange, disabled }: TextInputProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="jd-text-input" className="sr-only">
        Job description text
      </label>
      <textarea
        id="jd-text-input"
        rows={6}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="Paste your job description here..."
        maxLength={MAX_CHARS}
        aria-describedby="jd-char-count"
        className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-4 text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 resize-y focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
      />
      <p id="jd-char-count" className="text-right text-xs text-gray-500 dark:text-gray-400">
        {value.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
      </p>
    </div>
  );
}
