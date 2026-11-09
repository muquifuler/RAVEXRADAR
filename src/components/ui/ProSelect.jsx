// src/components/ui/ProSelect.jsx
import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import './ProSelect.css';

export const ProSelect = ({ icon: Icon, value, options, onChange, placeholder }) => {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  const selectedOption = options.find((o) => o.value === value) || { label: placeholder || value };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="pro-select" ref={wrapperRef}>
      <button
        type="button"
        className={`pro-select-trigger ${open ? 'is-open' : ''}`}
        onClick={() => setOpen(!open)}
      >
        {Icon && <Icon size={15} className="pro-select-icon" />}
        <span className="pro-select-label">{selectedOption.label}</span>
        <ChevronDown size={14} className={`pro-select-arrow ${open ? 'rotated' : ''}`} />
      </button>

      {open && (
        <div className="pro-select-menu">
          {options.map((opt) => (
            <button
              type="button"
              key={opt.value}
              className={`pro-select-item ${opt.value === value ? 'selected' : ''}`}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              <span>{opt.label}</span>
              {opt.value === value && <Check size={14} className="icon-neon" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};