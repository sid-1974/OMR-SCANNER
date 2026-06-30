import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search } from 'lucide-react';

const SearchableDropdown = ({
  options, // Array of { label, value } or strings
  value,
  onChange,
  placeholder = "Select an option",
  style = {},
  className = "form-input",
  disabled = false,
  allowCustom = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
  const dropdownRef = useRef(null);
  const menuRef = useRef(null);

  const updatePosition = () => {
    if (dropdownRef.current) {
      const rect = dropdownRef.current.getBoundingClientRect();
      setCoords({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
        width: rect.width
      });
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        (dropdownRef.current && !dropdownRef.current.contains(event.target)) &&
        (menuRef.current && !menuRef.current.contains(event.target))
      ) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      updatePosition();
      // true for capture phase to catch scrolls on any scrollable container
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
    } else {
      setSearchTerm('');
    }
    
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen]);

  const normalizedOptions = (options || []).filter(opt => opt !== null && opt !== undefined).map(opt => 
    typeof opt === 'string' || typeof opt === 'number' ? { label: String(opt), value: String(opt) } : opt
  );

  const filteredOptions = normalizedOptions.filter(opt => 
    opt.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const showCustomOption = allowCustom && searchTerm.trim() !== '' && !normalizedOptions.some(opt => String(opt.value).toLowerCase() === searchTerm.trim().toLowerCase());

  const selectedOption = normalizedOptions.find(opt => String(opt.value) === String(value));
  const displayLabel = selectedOption ? selectedOption.label : (value ? value : placeholder);

  return (
    <div ref={dropdownRef} style={{ position: 'relative', width: '100%', minWidth: '150px', ...style }}>
      <div 
        className={`${className} ${disabled ? 'disabled' : ''}`}
        style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          cursor: disabled ? 'not-allowed' : 'pointer',
          padding: '8px 12px',
          opacity: disabled ? 0.5 : 1,
          height: '100%',
          userSelect: 'none'
        }}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '8px' }}>
          {displayLabel}
        </span>
        <ChevronDown size={16} style={{ flexShrink: 0 }} />
      </div>

      {isOpen && !disabled && createPortal(
        <div 
          ref={menuRef}
          style={{
            position: 'absolute',
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            width: `${coords.width}px`,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            zIndex: 99999,
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <div style={{ padding: '8px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Search size={14} color="var(--text-muted)" />
            <input
              type="text"
              autoFocus
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text-primary)',
                fontSize: '0.85rem'
              }}
            />
          </div>
          <div style={{ overflowY: 'auto', padding: '4px', display: 'flex', flexDirection: 'column', maxHeight: '200px' }}>
            {filteredOptions.length === 0 && !showCustomOption ? (
              <div style={{ padding: '8px', color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center' }}>No options found</div>
            ) : (
              <>
                {filteredOptions.map((opt, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      onChange(opt.value);
                      setIsOpen(false);
                    }}
                    style={{
                      padding: '8px 12px',
                      cursor: 'pointer',
                      borderRadius: '4px',
                      fontSize: '0.85rem',
                      background: String(opt.value) === String(value) ? 'var(--accent-primary)' : 'transparent',
                      color: String(opt.value) === String(value) ? '#fff' : 'var(--text-primary)',
                      whiteSpace: 'nowrap'
                    }}
                    onMouseEnter={(e) => {
                      if (String(opt.value) !== String(value)) e.target.style.background = 'rgba(255,255,255,0.05)';
                    }}
                    onMouseLeave={(e) => {
                      if (String(opt.value) !== String(value)) e.target.style.background = 'transparent';
                    }}
                  >
                    {opt.label}
                  </div>
                ))}
                {showCustomOption && (
                  <div
                    onClick={() => {
                      onChange(searchTerm.trim());
                      setIsOpen(false);
                    }}
                    style={{
                      padding: '8px 12px',
                      cursor: 'pointer',
                      borderRadius: '4px',
                      fontSize: '0.85rem',
                      background: 'transparent',
                      color: 'var(--accent-secondary)',
                      whiteSpace: 'nowrap',
                      borderTop: filteredOptions.length > 0 ? '1px solid var(--border-color)' : 'none',
                      marginTop: filteredOptions.length > 0 ? '4px' : '0',
                      fontStyle: 'italic'
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.background = 'rgba(255,255,255,0.05)';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = 'transparent';
                    }}
                  >
                    Use "{searchTerm.trim()}"
                  </div>
                )}
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default SearchableDropdown;
