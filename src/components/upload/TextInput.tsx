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
      <textarea
        rows={6}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="Paste your job description here..."
        maxLength={MAX_CHARS}
        className="w-full rounded-xl border border-gray-300 p-4 text-sm text-gray-800 placeholder-gray-400 resize-y focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:opacity-50 disabled:cursor-not-allowed"
      />
      <p className="text-right text-xs text-gray-400">
        {value.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
      </p>
    </div>
  );
}
