import React from 'react';
import { motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';

const DynamicBadge = ({ design, attendee, eventName, width = 350, height = 500, className = '', qrValue }) => {
  const badgeDesign = Array.isArray(design) && design.length > 0 ? design : [
    { id: 'qr', label: 'QR Code', x: 125, y: 180, scale: 1 },
    { id: 'name', label: 'Attendee Name', x: 50, y: 80, scale: 1.2, size: '2xl' },
    { id: 'role', label: 'Ticket Category', x: 50, y: 130, scale: 1, color: 'text-primary' },
  ];

  const getElementValue = (el) => {
    if (!attendee) return el.label;
    if (el.id === 'qr') return null;
    if (el.id === 'name') {
      const name = `${attendee.firstName || ''} ${attendee.lastName || ''}`.trim();
      return name || attendee.name || el.label;
    }
    if (el.id === 'role') return attendee.ticketName || attendee.ticket || attendee.role || el.label;
    if (el.label === 'Email Address') return attendee.email || el.label;
    if (el.label === 'Company Name') return attendee.company || el.label;
    if (el.label === 'Job Title') return attendee.designation || attendee.jobTitle || el.label;
    if (el.label === 'Venue Name') return eventName || el.label;
    if (el.label === 'Phone') return attendee.phone || el.label;
    return el.label;
  };

  const qrCodeValue = qrValue || attendee?.confirmationId || attendee?.id || attendee?.email || 'GUEST-ID';

  return (
    <div
      className={`relative bg-white rounded-xl shadow-2xl overflow-hidden text-slate-900 ${className}`}
      style={{ width, height, minWidth: width, minHeight: height }}
    >
      <div className="absolute inset-0 border-4 border-dashed border-zinc-200 pointer-events-none" />

      {badgeDesign.map((el) => {
        const isQr = el.id === 'qr';
        const value = getElementValue(el);
        const sizeClass = el.size === '2xl' ? 'text-3xl font-black uppercase'
                        : el.size === 'xl' ? 'text-2xl font-bold'
                        : el.size === 'lg' ? 'text-xl font-bold'
                        : 'font-bold text-sm';
        const colorClass = el.color || 'text-slate-900';

        return (
          <motion.div
            key={el.id}
            className={`absolute top-0 left-0 select-none p-2 ${sizeClass} ${colorClass}`}
            style={{
              transform: `translate(${el.x}px, ${el.y}px) scale(${el.scale || 1})`,
              transformOrigin: 'top left',
            }}
          >
            {isQr ? (
              <div className="bg-white p-2 rounded shadow-sm border border-zinc-100">
                <QRCodeSVG value={qrCodeValue} size={100} level="M" />
              </div>
            ) : (
              <span className="whitespace-nowrap">{value}</span>
            )}
          </motion.div>
        );
      })}

      <div className="absolute bottom-4 left-0 right-0 text-center opacity-20 pointer-events-none">
        <p className="text-[10px] font-bold uppercase tracking-[0.3em]">EventPro Badge System</p>
      </div>
    </div>
  );
};

export default DynamicBadge;
