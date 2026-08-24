"use client";

import { useState, useRef, useEffect } from "react";
import { X, ListFilter } from "lucide-react";
import { cn } from "@/lib/utils";

interface TagAutocompleteProps {
  value: string[];
  onChange: (next: string[]) => void;
  suggestions: readonly string[];
  placeholder?: string;
}

export default function TagAutocomplete({ value, onChange, suggestions, placeholder }: TagAutocompleteProps) {
  const [input, setInput] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [showBrowse, setShowBrowse] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
        setShowBrowse(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const addTag = (tag: string) => {
    const t = tag.trim();
    if (!t) return;
    if (!value.some(v => v.toLowerCase() === t.toLowerCase())) onChange([...value, t]);
    setInput("");
    setShowDropdown(false);
  };

  const removeTag = (tag: string) => onChange(value.filter(v => v !== tag));

  const toggleSuggestion = (s: string) => {
    if (value.some(v => v.toLowerCase() === s.toLowerCase())) removeTag(value.find(v => v.toLowerCase() === s.toLowerCase())!);
    else onChange([...value, s]);
  };

  const filtered = input.trim()
    ? suggestions.filter(s => s.toLowerCase().includes(input.trim().toLowerCase()) && !value.some(v => v.toLowerCase() === s.toLowerCase())).slice(0, 8)
    : [];

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex items-start gap-1.5 w-full border border-white/10 rounded-xl p-2 bg-black/5 dark:bg-white/5 focus-within:bg-background transition-all focus-within:ring-2 focus-within:ring-primary/40">
        <div className="flex-1 flex flex-wrap items-center gap-1.5 min-w-0">
          {value.map(tag => (
            <span key={tag} className="flex items-center gap-1 pl-2 pr-1 py-0.5 rounded bg-primary/10 text-primary text-xs font-bold">
              {tag}
              <button type="button" onClick={() => removeTag(tag)} className="hover:opacity-60"><X className="w-3 h-3" /></button>
            </span>
          ))}
          <input
            value={input}
            onChange={e => { setInput(e.target.value); setShowDropdown(true); }}
            onFocus={() => setShowDropdown(true)}
            onKeyDown={e => {
              if (e.key === "Enter") { e.preventDefault(); addTag(input); }
              else if (e.key === "Backspace" && !input && value.length > 0) removeTag(value[value.length - 1]);
            }}
            placeholder={value.length === 0 ? placeholder : ""}
            className="flex-1 min-w-[80px] bg-transparent outline-none text-sm py-0.5"
          />
        </div>
        <button
          type="button"
          onClick={() => { setShowBrowse(v => !v); setShowDropdown(false); }}
          title="전체 목록에서 찾아보기"
          className="shrink-0 p-1 mt-0.5 text-muted-foreground hover:text-foreground rounded transition-colors"
        >
          <ListFilter className="w-4 h-4" />
        </button>
      </div>

      {showDropdown && filtered.length > 0 && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-background border border-white/10 rounded-xl shadow-xl overflow-hidden max-h-48 overflow-y-auto">
          {filtered.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => addTag(s)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-white/5 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {showBrowse && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-background border border-white/10 rounded-xl shadow-xl p-2 max-h-56 overflow-y-auto grid grid-cols-2 gap-x-2">
          {suggestions.map(s => (
            <label key={s} className="flex items-center gap-1.5 px-1.5 py-1.5 rounded hover:bg-white/5 cursor-pointer text-xs">
              <input
                type="checkbox"
                checked={value.some(v => v.toLowerCase() === s.toLowerCase())}
                onChange={() => toggleSuggestion(s)}
                className="accent-primary"
              />
              <span className="truncate">{s}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
