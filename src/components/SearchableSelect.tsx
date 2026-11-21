import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, ChevronDown, Check, X } from 'lucide-react';

interface SearchableSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder: string;
  disabledPlaceholder?: string;
  disabled?: boolean;
  required?: boolean;
  icon?: React.ReactNode;
  emptyMessage?: string;
  className?: string;
}

export default function SearchableSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
  disabledPlaceholder = 'يرجى ملء الخيار السابق أولاً',
  disabled = false,
  required = false,
  icon,
  emptyMessage = 'لا توجد نتائج مطابقة للبحث',
  className = '',
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // Clean and normalize study-text for Arabic search
  const normalizeArabic = (text: string): string => {
    if (!text) return '';
    return text
      .trim()
      .toLowerCase()
      .replace(/[\u064B-\u0652]/g, '') // remove Arabic diacritics (Fatha, Damma, etc.)
      .replace(/[أإآ]/g, 'ا') // normalize Alef
      .replace(/ى/g, 'ي') // normalize Yeh
      .replace(/ة/g, 'ه') // normalize Teh Marbouta
      .replace(/g/g, 'ج'); // soft-g to jeem/arabic approximation
  };

  const uniqueOptions = Array.from(new Set(options));

  const normalizedQuery = normalizeArabic(searchQuery);

  const filteredOptions = uniqueOptions.filter((opt) => {
    if (!normalizedQuery) return true;
    const normalizedOpt = normalizeArabic(opt);
    return normalizedOpt.includes(normalizedQuery);
  });

  const handleSelect = (option: string) => {
    onChange(option);
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setSearchQuery('');
  };

  return (
    <div className={`relative flex flex-col w-full text-right ${className}`} dir="rtl" ref={containerRef}>
      <label className="block text-slate-700 font-bold mb-1.5 text-xs select-none">
        {label}
        {required && <span className="text-red-500 mr-1">*</span>}
      </label>

      {disabled ? (
        <div className="w-full min-h-[46px] bg-slate-100 border border-slate-200 text-slate-400 rounded-xl py-3 px-4 flex items-center gap-2.5 cursor-not-allowed text-xs transition select-none">
          {icon && <div className="text-slate-300 w-4.5 h-4.5 shrink-0">{icon}</div>}
          <span className="font-medium truncate">{disabledPlaceholder}</span>
        </div>
      ) : (
        <>
          {/* Main selection button */}
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className={`w-full min-h-[46px] rounded-xl py-3 px-4 flex items-center justify-between text-right border transition ${
              isOpen
                ? 'bg-white border-blue-500 ring-2 ring-blue-500/10 shadow-sm'
                : 'bg-slate-50 border-slate-200/80 hover:bg-slate-50/50 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {icon && <div className={`w-4.5 h-4.5 shrink-0 ${isOpen ? 'text-blue-500' : 'text-slate-400'}`}>{icon}</div>}
              {value ? (
                <span className="text-slate-800 text-sm font-semibold truncate leading-none mt-0.5">{value}</span>
              ) : (
                <span className="text-slate-400 text-sm font-normal truncate leading-none mt-0.5">{placeholder}</span>
              )}
            </div>

            <div className="flex items-center gap-2 mr-2">
              {value && (
                <span
                  onClick={handleClear}
                  className="p-1 rounded-md text-slate-400 hover:bg-slate-200/60 hover:text-slate-600 transition"
                  title="مسح الاختيار"
                >
                  <X className="w-3.5 h-3.5" />
                </span>
              )}
              <ChevronDown
                className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-blue-500' : ''}`}
              />
            </div>
          </button>

          {/* Search Dropdown with Motion animation */}
          <AnimatePresence>
            {isOpen && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                className="absolute z-30 w-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden flex flex-col"
                style={{ top: '100%' }}
              >
                {/* Search Header Input bar */}
                <div className="p-2.5 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2 sticky top-0 z-10">
                  <div className="relative flex-1">
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="ابدأ بالكتابة للبحث الفوري..."
                      className="w-full min-h-[42px] bg-white border border-slate-200/80 rounded-lg py-2.5 pl-3 pr-9 text-slate-800 text-base sm:text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500 transition shadow-inner placeholder:text-slate-400"
                    />
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Option list */}
                <div className="max-h-56 overflow-y-auto py-1 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
                  {filteredOptions.length > 0 ? (
                    filteredOptions.map((option) => {
                      const isSelected = value === option;
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => handleSelect(option)}
                          className={`w-full min-h-[42px] text-right px-4.5 py-2.5 text-xs transition-colors flex items-center justify-between group ${
                            isSelected
                              ? 'bg-blue-50/70 text-blue-700 font-extrabold'
                              : 'text-slate-700 hover:bg-slate-50/80 hover:text-blue-600 font-medium'
                          }`}
                        >
                          <span className="truncate">{option}</span>
                          {isSelected && (
                            <Check className="w-3.5 h-3.5 text-blue-600 stroke-[3] shrink-0 mr-2" />
                          )}
                        </button>
                      );
                    })
                  ) : (
                    <div className="text-center py-6 text-slate-400 text-xs font-medium px-4 select-none">
                      {emptyMessage}
                    </div>
                  )}
                </div>

                {/* Info footer */}
                {uniqueOptions.length > 0 && (
                  <div className="px-4 py-2 border-t border-slate-100 bg-slate-50 text-[10px] text-slate-400 font-bold flex justify-between select-none">
                    <span>عدد الخيارات: {uniqueOptions.length}</span>
                    {searchQuery && <span>المطابقة: {filteredOptions.length}</span>}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}
