import React, { useRef } from 'react';

const FormattedDateInput = ({ value, onChange, className, required }) => {
    const dateInputRef = useRef(null);

    // Convert YYYY-MM-DD (internal) to DD-MM-YYYY (display)
    const formatForDisplay = (dateString) => {
        if (!dateString) return '';
        const [y, m, d] = dateString.split('-');
        if (!y || !m || !d) return dateString;
        return `${d}-${m}-${y}`;
    };

    const handleContainerClick = () => {
        // Programmatically trigger the native date picker
        if (dateInputRef.current) {
            if (typeof dateInputRef.current.showPicker === 'function') {
                dateInputRef.current.showPicker();
            } else {
                // Fallback for older browsers
                dateInputRef.current.focus();
                dateInputRef.current.click();
            }
        }
    };

    return (
        <div 
            className="relative w-full group cursor-pointer" 
            onClick={handleContainerClick}
        >
            {/* The "Visual" Input - Shows your preferred format */}
            <input
                type="text"
                readOnly
                placeholder="DD-MM-YYYY"
                value={formatForDisplay(value)}
                className={`${className} pointer-events-none`}
                required={required}
            />
            
            {/* The "Functional" Input - Hidden but accessible via Ref */}
            <input
                ref={dateInputRef}
                type="date"
                value={value || ''}
                onChange={onChange}
                className="absolute inset-0 opacity-0 pointer-events-none w-full h-full appearance-none bg-transparent border-none outline-none"
                style={{ colorScheme: 'dark' }} 
            />

            {/* Custom Calendar Icon */}
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none opacity-40 group-hover:opacity-100 transition-opacity">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                    <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/>
                    <line x1="16" x2="16" y1="2" y2="6"/>
                    <line x1="8" x2="8" y1="2" y2="6"/>
                    <line x1="3" x2="21" y1="10" y2="10"/>
                </svg>
            </div>
        </div>
    );
};

export default FormattedDateInput;
