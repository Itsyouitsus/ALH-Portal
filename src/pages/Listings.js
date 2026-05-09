import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useLocation } from 'react-router-dom';
import { db } from '../firebase';
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';

const NO_REASONS = [
  'Too expensive', 'Too small', 'Too big', 'Wrong area',
  'Wrong furnishing', 'Shell only', 'Too few bedrooms', 'Too many bedrooms',
  'Not available in time', 'Max rental period', 'Ground floor', 'No outdoor space',
];

const STATUS_CONFIG = {
  wip:              { label: 'Work in progress',   color: '#856404',           bg: '#fff3cd' },
  viewing:          { label: 'Viewing scheduled',  color: 'var(--blue)',       bg: '#e8f0fe' },
  making_offer:     { label: 'Making offer',       color: '#a06b1a',           bg: '#fdf3e2' },
  offer_made:       { label: 'Offer made',         color: '#a06b1a',           bg: '#fdf3e2' },
  offer_not_accepted: { label: 'Offer not accepted', color: 'var(--text-muted)', bg: 'var(--gold-card)' },
  rented_out:       { label: 'Rented out',         color: 'var(--text-muted)', bg: 'var(--gold-card)' },
  offer_accepted:   { label: 'Offer accepted!', color: '#1a7a3c',           bg: '#d4edda' },
};

function getStatusKey(l) {
  const s = (l.status || '').toLowerCase();
  if (!s) return null;
  if (s.includes('offer accepted')) return 'offer_accepted';
  if (s.includes('offer not accepted')) return 'offer_not_accepted';
  if (s.includes('offer made')) return 'offer_made';
  if (s.includes('making offer')) return 'making_offer';
  if (s.includes('rented out')) return 'rented_out';
  if (s.includes('viewing scheduled')) return 'viewing';
  if (s.includes('work in progress')) return 'wip';
  return null;
}

function markerColor(l) {
  if (l.clientResponse === 'yes' || getStatusKey(l)) return '#22c55e';
  if (l.clientResponse === 'no') return '#ef4444';
  return '#eab308';
}

function useIsMobile(bp = 899) {
  const [m, setM] = useState(window.innerWidth <= bp);
  useEffect(() => {
    const h = () => setM(window.innerWidth <= bp);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, [bp]);
  return m;
}

// Map pane (shared between mobile and desktop)
function MapPane({ listings, hoveredId, onMarkerHover, onMarkerClick, style }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef({});
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (window._leafletLoaded) { setMapReady(true); return; }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
    document.head.appendChild(link);
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    script.onload = () => { window._leafletLoaded = true; setMapReady(true); };
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    if (mapInstanceRef.current) {
      setTimeout(() => mapInstanceRef.current.invalidateSize(), 100);
      return;
    }
    const L = window.L;
    const map = L.map(mapRef.current).setView([52.3676, 4.9041], 12);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '\u00a9 OpenStreetMap \u00a9 CARTO', maxZoom: 19,
    }).addTo(map);
    mapInstanceRef.current = map;
    setTimeout(() => map.invalidateSize(), 200);
  }, [mapReady]);

  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    const L = window.L;
    const map = mapInstanceRef.current;
    Object.values(markersRef.current).forEach(m => m.remove());
    markersRef.current = {};

    const withCoords = listings.filter(l => l.lat && l.lng);
    if (withCoords.length > 0) {
      const bounds = L.latLngBounds(withCoords.map(l => [l.lat, l.lng]));
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
    } else {
      map.setView([52.3676, 4.9041], 12);
    }
    setTimeout(() => map.invalidateSize(), 200);

    listings.forEach(listing => {
      if (!listing.lat || !listing.lng) return;
      const color = markerColor(listing);
      const statusKey = getStatusKey(listing);
      const statusCfg = statusKey ? STATUS_CONFIG[statusKey] : null;
      const icon = L.divIcon({
        html: `<div style="width:32px;height:32px;background:${color};border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2.5px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;">
          <svg style="transform:rotate(45deg)" width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/><path d="M9 21V12h6v9" fill="rgba(255,255,255,0.4)"/></svg>
        </div>`,
        className: '', iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -34],
      });
      const popup = L.popup({ maxWidth: 260 }).setContent(`
        <div style="font-family:system-ui,sans-serif;padding:2px 0;">
          ${listing.area ? `<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#c9a96e;margin-bottom:4px;">${listing.area}</div>` : ''}
          <div style="font-size:14px;font-weight:700;color:#0f0f0d;margin-bottom:6px;line-height:1.3;">${listing.address}</div>
          <div style="font-size:20px;font-weight:700;color:#0f0f0d;margin-bottom:6px;">\u20ac${(listing.price||0).toLocaleString()}<span style="font-size:11px;font-weight:400;color:#888">/mo</span></div>
          <div style="display:flex;gap:10px;font-size:12px;color:#666;margin-bottom:10px;flex-wrap:wrap;">
            ${listing.size ? `<span>\ud83d\udcd0 ${listing.size}</span>` : ''}
            ${listing.beds ? `<span>\ud83d\udecf ${listing.beds} bed</span>` : ''}
            ${listing.furnishing ? `<span>\ud83e\ude91 ${listing.furnishing}</span>` : ''}
          </div>
          ${statusCfg ? `<div style="font-size:11px;font-weight:600;color:${statusCfg.color};background:${statusCfg.bg};padding:3px 8px;border-radius:10px;display:inline-block;margin-bottom:8px;">${statusCfg.label}</div><br>` : ''}
          ${listing.url ? `<a href="${listing.url}" target="_blank" style="display:block;background:#0f0f0d;color:#c9a96e;text-decoration:none;padding:8px 12px;border-radius:7px;font-size:12px;font-weight:600;text-align:center;margin-top:4px;">View listing \u2197</a>` : ''}
        </div>`);
      const marker = L.marker([listing.lat, listing.lng], { icon }).addTo(map).bindPopup(popup);
      marker.getElement()?.addEventListener('mouseenter', () => onMarkerHover && onMarkerHover(listing.id));
      marker.getElement()?.addEventListener('mouseleave', () => onMarkerHover && onMarkerHover(null));
      marker.on('click', () => onMarkerClick && onMarkerClick(listing.id));
      markersRef.current[listing.id] = marker;
    });
  }, [mapReady, listings]);

  useEffect(() => {
    Object.entries(markersRef.current).forEach(([id, marker]) => {
      const el = marker.getElement();
      if (!el) return;
      const pin = el.querySelector('div');
      if (!pin) return;
      if (id === hoveredId) {
        pin.style.transform = 'rotate(-45deg) scale(1.35)';
        pin.style.boxShadow = '0 4px 16px rgba(0,0,0,0.4)';
        el.style.zIndex = '1000';
      } else {
        pin.style.transform = 'rotate(-45deg) scale(1)';
        pin.style.boxShadow = '0 2px 8px rgba(0,0,0,0.25)';
        el.style.zIndex = '';
      }
    });
  }, [hoveredId]);

  return (
    <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--gold-mid)', display: 'flex', flexDirection: 'column', position: 'relative', ...style }}>
      {!mapReady && <div style={{ flex: 1, background: 'var(--card-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 14, minHeight: 200 }}>Loading map...</div>}
      <div ref={mapRef} style={{ flex: 1, minHeight: 0, height: '100%', display: mapReady ? 'block' : 'none' }} />
      {mapReady && (
        <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 999, background: 'white', borderRadius: 20, padding: '4px 14px', fontSize: 11, color: '#555', display: 'flex', gap: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.12)', whiteSpace: 'nowrap' }}>
          <span><span style={{ color: '#22c55e', fontWeight: 700 }}>{'\u25cf'}</span> Interested</span>
          <span><span style={{ color: '#eab308', fontWeight: 700 }}>{'\u25cf'}</span> New</span>
          <span><span style={{ color: '#ef4444', fontWeight: 700 }}>{'\u25cf'}</span> Not interested</span>
        </div>
      )}
    </div>
  );
}

// Detail popup
function ListingDetailModal({ listing, onClose, isMobile }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,22,18,0.65)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', zIndex: 600, padding: isMobile ? 0 : 24 }} onClick={onClose}>
      <div style={{ background: 'var(--gold-bg)', borderRadius: isMobile ? '16px 16px 0 0' : 16, padding: isMobile ? '24px 20px 32px' : '28px 28px 24px', width: '100%', maxWidth: 480, position: 'relative', maxHeight: isMobile ? '80vh' : 'none', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-muted)', lineHeight: 1 }}>{'\u00d7'}</button>
        {listing.area && <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--gold-dark)', marginBottom: 6 }}>{listing.area} {'\u00b7'} {listing.city || 'Amsterdam'}</div>}
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--near-black)', marginBottom: 16, lineHeight: 1.3, paddingRight: 28 }}>{listing.address}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 20 }}>
          <span style={{ fontSize: 28, fontWeight: 700 }}>{'\u20ac'}{listing.price?.toLocaleString()}</span>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>/month</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px', marginBottom: 20 }}>
          {[['Size', listing.size], ['Bedrooms', listing.beds ? `${listing.beds} bed${listing.beds > 1 ? 's' : ''}` : null], ['Furnishing', listing.furnishing], ['Available', listing.availableFrom], ['Neighbourhood', listing.area], ['Energy label', listing.energyLabel], ['Floor', listing.floor]].filter(([, v]) => v).map(([label, val]) => (
            <div key={label}>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--near-black)' }}>{val}</div>
            </div>
          ))}
        </div>
        {listing.notes && <div style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic', borderLeft: '2px solid var(--gold)', paddingLeft: 10, marginBottom: 16 }}>{listing.notes}</div>}
        {listing.url && <a href={listing.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--near-black)', color: 'var(--gold)', textDecoration: 'none', padding: '12px 18px', borderRadius: 10, fontSize: 14, fontWeight: 600, justifyContent: 'center' }}>View original listing {'\u2197'}</a>}
      </div>
    </div>
  );
}

// Why not modal
function NoFeedbackModal({ listing, onSubmit, onClose, isMobile }) {
  const [selected, setSelected] = useState([]);
  const [other, setOther] = useState('');
  const toggle = r => setSelected(s => s.includes(r) ? s.filter(x => x !== r) : [...s, r]);
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,22,18,0.6)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', zIndex: 500, padding: isMobile ? 0 : 24 }} onClick={onClose}>
      <div style={{ background: 'var(--gold-bg)', borderRadius: isMobile ? '16px 16px 0 0' : 16, padding: isMobile ? '24px 20px 32px' : '28px 24px', width: '100%', maxWidth: 480, maxHeight: isMobile ? '85vh' : 'none', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Why not this one?</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>{listing.address}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {NO_REASONS.map(r => (
            <button key={r} onClick={() => toggle(r)} style={{ padding: '7px 14px', borderRadius: 20, border: '1.5px solid', borderColor: selected.includes(r) ? 'var(--near-black)' : 'var(--gold-mid)', background: selected.includes(r) ? 'var(--near-black)' : 'var(--gold-bg)', color: selected.includes(r) ? 'var(--gold-bg)' : 'var(--text-muted)', fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", transition: 'all 0.12s' }}>{r}</button>
          ))}
        </div>
        <div className="field">
          <label>Other reason (optional)</label>
          <input value={other} onChange={e => setOther(e.target.value)} placeholder="e.g. basement apartment" />
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className="btn-ghost" onClick={onClose} style={{ flex: 1 }}>Cancel</button>
          <button className="btn-primary" onClick={() => { const reasons = [...selected]; if (other.trim()) reasons.push(other.trim()); onSubmit(reasons); }} style={{ flex: 1 }}>Submit</button>
        </div>
      </div>
    </div>
  );
}

// Listing card
function ListingCard({ listing, onResponse, onOpenDetail, hoveredId, onHover, cardRef, isMobile }) {
  const isYes = listing.clientResponse === 'yes';
  const isNo  = listing.clientResponse === 'no';
  const responded = isYes || isNo;
  const statusKey = getStatusKey(listing);
  const statusCfg = statusKey ? STATUS_CONFIG[statusKey] : null;
  const isHovered = hoveredId === listing.id;

  const [swipeX, setSwipeX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const startX = useRef(0);
  const swipeOp = Math.min(Math.abs(swipeX) / 120, 1);

  const onTouchStart = e => { if (responded || statusKey) return; startX.current = e.touches[0].clientX; setSwiping(true); };
  const onTouchMove  = e => { if (!swiping) return; setSwipeX(e.touches[0].clientX - startX.current); };
  const onTouchEnd   = () => {
    if (!swiping) return;
    setSwiping(false);
    if (swipeX > 80) onResponse(listing, 'yes');
    else if (swipeX < -80) onResponse(listing, 'no');
    setSwipeX(0);
  };

  if (isMobile) {
    // ── MOBILE CARD ──
    return (
      <div
        ref={cardRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          background: 'var(--card-bg)', borderRadius: 12, padding: '12px 12px',
          borderLeft: isYes ? '3px solid var(--success)' : isNo ? '3px solid var(--danger)' : statusCfg ? `3px solid ${statusCfg.color}` : '3px solid transparent',
          opacity: isNo ? 0.75 : 1,
          transform: `translateX(${swipeX * 0.3}px)`,
          transition: swiping ? 'none' : 'all 0.15s ease',
          position: 'relative', overflow: 'hidden',
        }}
      >
        {swipeX > 20 && <div style={{ position: 'absolute', inset: 0, background: `rgba(45,122,79,${swipeOp * 0.12})`, display: 'flex', alignItems: 'center', paddingLeft: 20, pointerEvents: 'none' }}><span style={{ fontSize: 26, fontWeight: 700, color: 'var(--success)', opacity: swipeOp }}>YES</span></div>}
        {swipeX < -20 && <div style={{ position: 'absolute', inset: 0, background: `rgba(163,45,45,${swipeOp * 0.12})`, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 20, pointerEvents: 'none' }}><span style={{ fontSize: 26, fontWeight: 700, color: 'var(--danger)', opacity: swipeOp }}>NO</span></div>}

        <div style={{ position: 'absolute', top: 11, right: 12, textAlign: 'right' }}>
          <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--near-black)' }}>{'\u20ac'}{listing.price?.toLocaleString()}</span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 2 }}>/mo</span>
          {listing.serviceCosts > 0 && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>+{'\u20ac'}{listing.serviceCosts?.toLocaleString()} sc</div>}
        </div>

        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--gold-dark)', marginBottom: 2, paddingRight: 100 }}>
          {[listing.area, listing.city || 'Amsterdam'].filter(Boolean).join(' \u00b7 ')}
        </div>
        <div onClick={() => onOpenDetail(listing)} style={{ fontSize: 13, fontWeight: 700, color: 'var(--near-black)', lineHeight: 1.3, marginBottom: 6, cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'var(--gold)', textUnderlineOffset: 3, paddingRight: 100 }}>
          {listing.address}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 4 }}>
          {listing.size && <span style={{ fontSize: 12, color: 'var(--near-black)' }}>{listing.size}</span>}
          {listing.beds && <span style={{ fontSize: 12, color: 'var(--near-black)' }}>{listing.beds} {listing.beds === 1 ? 'bed' : 'beds'}</span>}
          {listing.furnishing && <span style={{ fontSize: 12, color: 'var(--near-black)' }}>{listing.furnishing}</span>}
          {listing.availableFrom && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>from {listing.availableFrom}</span>}
        </div>
        {statusCfg && <div style={{ display: 'inline-flex', marginTop: 2, fontSize: 11, fontWeight: 600, color: statusCfg.color, background: statusCfg.bg, padding: '3px 10px', borderRadius: 20 }}>{statusCfg.label}</div>}
        {isNo && listing.noReasons?.length > 0 && <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 4 }}>{listing.noReasons.map(r => <span key={r} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 12, background: 'var(--gold-card)', color: 'var(--text-muted)' }}>{r}</span>)}</div>}
        {listing.notes && <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', borderLeft: '2px solid var(--gold-mid)', paddingLeft: 8 }}>{listing.notes}</div>}
        {!responded && !statusKey && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={() => onResponse(listing, 'yes')} style={{ flex: 1, padding: '9px', borderRadius: 10, border: '1.5px solid var(--success)', background: 'var(--success-bg)', color: 'var(--success)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>Yes, interested</button>
            <button onClick={() => onResponse(listing, 'no')} style={{ flex: 1, padding: '9px', borderRadius: 10, border: '1.5px solid var(--gold-mid)', background: 'var(--gold-bg)', color: 'var(--text-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>Not for me</button>
          </div>
        )}
        {responded && !statusKey && <button onClick={() => onResponse(listing, 'toggle')} style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', marginTop: 4, padding: 0 }}>Change</button>}
      </div>
    );
  }

  // ── DESKTOP CARD ──
  return (
    <div
      ref={cardRef}
      onMouseEnter={() => onHover(listing.id)}
      onMouseLeave={() => onHover(null)}
      style={{
        background: isHovered ? 'var(--gold-card)' : 'var(--card-bg)',
        borderRadius: 12, padding: '12px 16px',
        borderLeft: isYes ? '3px solid var(--success)' : isNo ? '3px solid var(--danger)' : statusCfg ? `3px solid ${statusCfg.color}` : '3px solid transparent',
        opacity: isNo && !isHovered ? 0.75 : 1,
        transition: 'all 0.15s ease',
        position: 'relative', overflow: 'hidden',
      }}
    >
      <div style={{ position: 'absolute', top: 11, right: 16, textAlign: 'right' }}>
        <div>
          <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--near-black)', letterSpacing: '-0.01em' }}>{'\u20ac'}{listing.price?.toLocaleString()}</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 2 }}>/mo</span>
        </div>
        {listing.serviceCosts > 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>+{'\u20ac'}{listing.serviceCosts?.toLocaleString()} service costs</div>}
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--gold-dark)', marginBottom: 2, paddingRight: 140 }}>
        {[listing.area, listing.city || 'Amsterdam'].filter(Boolean).join(' \u00b7 ')}
      </div>
      <div onClick={() => onOpenDetail(listing)} style={{ fontSize: 14, fontWeight: 700, color: 'var(--near-black)', lineHeight: 1.3, marginBottom: 7, cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'var(--gold)', textUnderlineOffset: 3, paddingRight: 140 }}>
        {listing.address}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
          {listing.size && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--near-black)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
              {listing.size}
            </span>
          )}
          {listing.beds && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--near-black)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12v6M21 12v6M3 18h18M3 12a3 3 0 013-3h12a3 3 0 013 3M6 9V7a2 2 0 012-2h8a2 2 0 012 2v2"/></svg>
              {listing.beds} {listing.beds === 1 ? 'bed' : 'beds'}
            </span>
          )}
          {listing.furnishing && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--near-black)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="13" rx="2"/><path d="M2 12h20M6 7V5a2 2 0 012-2h8a2 2 0 012 2v2"/></svg>
              {listing.furnishing}
            </span>
          )}
        </div>
        {!responded && !statusKey && (
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button onClick={() => onResponse(listing, 'yes')} style={{ width: 34, height: 34, borderRadius: 8, border: '1.5px solid var(--gold-mid)', background: 'var(--gold-bg)', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', transition: 'all 0.12s' }}>{'\u2713'}</button>
            <button onClick={() => onResponse(listing, 'no')} style={{ width: 34, height: 34, borderRadius: 8, border: '1.5px solid var(--gold-mid)', background: 'var(--gold-bg)', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', transition: 'all 0.12s' }}>{'\u2715'}</button>
          </div>
        )}
        {responded && !statusKey && <button onClick={() => onResponse(listing, 'toggle')} style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', flexShrink: 0 }}>Change</button>}
      </div>
      {listing.availableFrom && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--near-black)', marginBottom: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          {listing.availableFrom}
        </div>
      )}
      {statusCfg && <div style={{ display: 'inline-flex', marginTop: 4, fontSize: 11, fontWeight: 600, color: statusCfg.color, background: statusCfg.bg, padding: '3px 10px', borderRadius: 20 }}>{statusCfg.label}</div>}
      {isNo && listing.noReasons?.length > 0 && <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>{listing.noReasons.map(r => <span key={r} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: 'var(--gold-card)', color: 'var(--text-muted)' }}>{r}</span>)}</div>}
      {listing.notes && <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', borderLeft: '2px solid var(--gold-mid)', paddingLeft: 8 }}>{listing.notes}</div>}
    </div>
  );
}

// Shared logic
function useListingsData(user) {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!user) return;
    getDocs(query(collection(db, 'listings'), where('clientId', '==', user.uid))).then(snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => {
        const rank = l => !l.clientResponse && !getStatusKey(l) ? 0 : l.clientResponse === 'yes' || getStatusKey(l) ? 1 : 2;
        return rank(a) - rank(b);
      });
      setListings(data);
      setLoading(false);
    });
  }, [user]);
  return { listings, setListings, loading };
}

function useCounts(listings) {
  const newCount  = listings.filter(l => !l.clientResponse && !getStatusKey(l)).length;
  const yesCount  = listings.filter(l => l.clientResponse === 'yes' || getStatusKey(l)).length;
  const noCount   = listings.filter(l => l.clientResponse === 'no' && !getStatusKey(l)).length;
  const viewings  = listings.filter(l => l.status === 'viewing').length;
  const offers    = listings.filter(l => ['offer_accepted','offer_rejected','offer_cancelled'].includes(getStatusKey(l))).length;
  return { newCount, yesCount, noCount, viewings, offers };
}

function filterListings(listings, tab) {
  if (tab === 'all' || tab === 'map') return listings;
  if (tab === 'new') return listings.filter(l => !l.clientResponse && !getStatusKey(l));
  if (tab === 'yes') return listings.filter(l => l.clientResponse === 'yes' || getStatusKey(l));
  if (tab === 'no')  return listings.filter(l => l.clientResponse === 'no' && !getStatusKey(l));
  return listings;
}

// ══════════════════════════════════════════════════════════════════════════════
// MOBILE LISTINGS PAGE
// ══════════════════════════════════════════════════════════════════════════════
function MobileListings() {
  const { user } = useAuth();
  const location = useLocation();
  const { listings, setListings, loading } = useListingsData(user);
  const [modalListing, setModalListing] = useState(null);
  const [detailListing, setDetailListing] = useState(null);
  const [tab, setTab] = useState('new');
  const [hoveredId, setHoveredId] = useState(null);
  const [mapFilter, setMapFilter] = useState('new');
  const { newCount, yesCount, noCount, viewings } = useCounts(listings);

  // Check if we should show the map (from bottom nav)
  const showMap = new URLSearchParams(location.search).get('view') === 'map';

  const handleResponse = (listing, response) => {
    if (getStatusKey(listing) === 'viewing') return;
    if (response === 'toggle') { submitResponse(listing, null, []); return; }
    if (response === 'no') setModalListing(listing);
    else submitResponse(listing, 'yes', []);
  };

  const submitResponse = async (listing, response, reasons) => {
    const ref = doc(db, 'listings', listing.id);
    const update = { clientResponse: response, noReasons: reasons || [], respondedAt: serverTimestamp() };
    await updateDoc(ref, update);
    setListings(ls => ls.map(l => l.id === listing.id ? { ...l, ...update } : l));
    setModalListing(null);
  };

  const handleMarkerClick = (id) => {
    const listing = listings.find(l => l.id === id);
    if (listing) setDetailListing(listing);
  };

  if (loading) return <div className="loading-screen">Loading your listings...</div>;

  const filtered = filterListings(listings, tab);

  const TABS = [
    { key: 'new',  label: 'New',        count: newCount, dot: newCount > 0 },
    { key: 'yes',  label: 'Interested', count: yesCount },
    { key: 'no',   label: 'Passed',     count: noCount },
    { key: 'all',  label: 'All',        count: listings.length },
  ];

  // If showing map (from bottom nav), render full-screen map
  if (showMap) {
    const mapFiltered = mapFilter === 'new'
      ? listings.filter(l => !l.clientResponse && !getStatusKey(l))
      : mapFilter === 'yes'
      ? listings.filter(l => l.clientResponse === 'yes' || getStatusKey(l))
      : mapFilter === 'no'
      ? listings.filter(l => l.clientResponse === 'no' && !getStatusKey(l))
      : listings;
    return (
      <div style={{ position: 'fixed', top: 56, left: 0, right: 0, bottom: 60, display: 'flex', flexDirection: 'column', zIndex: 50 }}>
        {/* Filter buttons */}
        <div style={{ display: 'flex', gap: 6, padding: '10px 12px', background: 'var(--gold-bg)', flexShrink: 0 }}>
          {[
            { key: 'new', label: 'New' },
            { key: 'yes', label: 'Interested' },
            { key: 'no', label: 'Not interested' },
            { key: 'all', label: 'All' },
          ].map(f => (
            <button key={f.key} onClick={() => setMapFilter(f.key)} style={{
              flex: 1, padding: '8px 4px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              cursor: 'pointer', border: 'none', fontFamily: "'DM Sans',sans-serif",
              background: mapFilter === f.key ? 'var(--near-black)' : 'var(--card-bg)',
              color: mapFilter === f.key ? 'var(--gold-bg)' : 'var(--text-muted)',
              transition: 'all 0.15s',
            }}>{f.label}</button>
          ))}
        </div>
        {/* Map fills remaining space */}
        <div style={{ flex: 1, minHeight: 0 }}>
          <MapPane listings={mapFiltered} hoveredId={hoveredId} onMarkerHover={setHoveredId} onMarkerClick={handleMarkerClick} style={{ height: '100%', borderRadius: 0, border: 'none' }} />
        </div>
        {detailListing && <ListingDetailModal listing={detailListing} onClose={() => setDetailListing(null)} isMobile={true} />}
      </div>
    );
  }

  return (
    <div style={{ padding: '12px 12px 120px', maxWidth: '100vw', overflow: 'hidden' }}>
      {/* Stats 2x2 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        {[['Properties', listings.length], ['New', newCount], ['Interested', yesCount], ['Viewings', viewings]].map(([label, val]) => (
          <div key={label} style={{ background: 'var(--card-bg)', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
            <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: label === 'New' && val > 0 ? 'var(--gold-dark)' : 'var(--near-black)', lineHeight: 1 }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Tabs (no Map tab, map is in bottom nav) */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 10, background: 'var(--card-bg)', borderRadius: 9, padding: 3 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: 1, padding: '7px 4px', borderRadius: 6, fontSize: 11, fontWeight: 600,
            cursor: 'pointer', border: 'none', fontFamily: "'DM Sans',sans-serif",
            background: tab === t.key ? 'var(--near-black)' : 'transparent',
            color: tab === t.key ? 'var(--gold-bg)' : 'var(--text-muted)',
            transition: 'all 0.15s', whiteSpace: 'nowrap', position: 'relative', minWidth: 0,
          }}>
            {t.label}{t.count != null ? ` ${t.count}` : ''}
            {t.dot && tab !== t.key && <span style={{ position: 'absolute', top: 4, right: 4, width: 5, height: 5, borderRadius: '50%', background: 'var(--gold)' }} />}
          </button>
        ))}
      </div>

      {/* Content */}
      {listings.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' }}>
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, marginBottom: 10 }}>No listings yet</div>
          <div style={{ fontSize: 14 }}>Your agent is actively searching.</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 14 }}>No listings in this category yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(l => <ListingCard key={l.id} listing={l} onResponse={handleResponse} onOpenDetail={setDetailListing} hoveredId={hoveredId} onHover={setHoveredId} cardRef={() => {}} isMobile={true} />)}
        </div>
      )}

      {modalListing && <NoFeedbackModal listing={modalListing} onSubmit={r => submitResponse(modalListing, 'no', r)} onClose={() => setModalListing(null)} isMobile={true} />}
      {detailListing && <ListingDetailModal listing={detailListing} onClose={() => setDetailListing(null)} isMobile={true} />}
    </div>
  );
}


// DESKTOP LISTINGS PAGE (unchanged from original working version)
// ══════════════════════════════════════════════════════════════════════════════
function DesktopListings() {
  const { user } = useAuth();
  const { listings, setListings, loading } = useListingsData(user);
  const [modalListing, setModalListing] = useState(null);
  const [detailListing, setDetailListing] = useState(null);
  const [tab, setTab] = useState('new');
  const [hoveredId, setHoveredId] = useState(null);
  const cardRefs = useRef({});
  const { newCount, yesCount, noCount, viewings, offers } = useCounts(listings);

  const handleResponse = (listing, response) => {
    if (getStatusKey(listing) === 'viewing') return;
    if (response === 'toggle') { submitResponse(listing, null, []); return; }
    if (response === 'no') setModalListing(listing);
    else submitResponse(listing, 'yes', []);
  };

  const submitResponse = async (listing, response, reasons) => {
    const ref = doc(db, 'listings', listing.id);
    const update = { clientResponse: response, noReasons: reasons || [], respondedAt: serverTimestamp() };
    await updateDoc(ref, update);
    setListings(ls => ls.map(l => l.id === listing.id ? { ...l, ...update } : l));
    setModalListing(null);
  };

  const handleMarkerClick = (id) => {
    const listing = listings.find(l => l.id === id);
    if (!listing) return;
    const sk = getStatusKey(listing);
    if (!listing.clientResponse && !sk) setTab('new');
    else if (listing.clientResponse === 'yes' || sk) setTab('yes');
    else if (listing.clientResponse === 'no' && !sk) setTab('no');
    setTimeout(() => {
      const el = cardRefs.current[id];
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      setHoveredId(id);
      setTimeout(() => setHoveredId(null), 2000);
    }, 80);
  };

  if (loading) return <div className="loading-screen">Loading your listings...</div>;

  const filtered = filterListings(listings, tab);

  const TABS = [
    { key: 'new',  label: 'New',            count: newCount,       dot: newCount > 0 },
    { key: 'yes',  label: 'Interested',     count: yesCount },
    { key: 'no',   label: 'Not interested', count: noCount },
    { key: 'all',  label: 'All',            count: listings.length },
  ];

  return (
    <div className="page listings-page">
      {/* Stats bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 14 }}>
        {[
          ['Properties found', listings.length, false],
          ['Awaiting response', newCount, newCount > 0],
          ['Interested', yesCount, false],
          ['Viewings', viewings, false],
          ['Offers', offers, false],
        ].map(([label, val, highlight]) => (
          <div key={label} style={{ background: 'var(--card-bg)', borderRadius: 10, padding: '10px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: highlight ? 'var(--gold-dark)' : label === 'Interested' ? 'var(--gold-dark)' : 'var(--near-black)', lineHeight: 1 }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Two-column: list + map */}
      <div className="listings-grid">
        <div className="listings-list-col">
          {/* Tab bar */}
          <div style={{ display: 'flex', gap: 3, marginBottom: 10, background: 'var(--card-bg)', borderRadius: 9, padding: 3 }}>
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{ flex: 1, padding: '6px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: 'none', fontFamily: "'DM Sans',sans-serif", background: tab === t.key ? 'var(--near-black)' : 'transparent', color: tab === t.key ? 'var(--gold-bg)' : 'var(--text-muted)', transition: 'all 0.15s', whiteSpace: 'nowrap', position: 'relative' }}>
                {t.label} ({t.count})
                {t.dot && tab !== t.key && <span style={{ position: 'absolute', top: 6, right: 6, width: 5, height: 5, borderRadius: '50%', background: 'var(--gold)' }} />}
              </button>
            ))}
          </div>
          <div className="listings-scroll">
            {listings.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
                <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, marginBottom: 10 }}>No listings yet</div>
                <div style={{ fontSize: 14 }}>Your agent is actively searching. You'll receive an email as soon as new properties are shared with you.</div>
              </div>
            ) : filtered.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 14 }}>No listings in this category yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {filtered.map(l => <ListingCard key={l.id} listing={l} onResponse={handleResponse} onOpenDetail={setDetailListing} hoveredId={hoveredId} onHover={setHoveredId} cardRef={el => { cardRefs.current[l.id] = el; }} isMobile={false} />)}
              </div>
            )}
          </div>
        </div>
        <MapPane listings={filtered} hoveredId={hoveredId} onMarkerHover={setHoveredId} onMarkerClick={handleMarkerClick} style={{ flex: 1, minHeight: 0 }} />
      </div>

      {modalListing && <NoFeedbackModal listing={modalListing} onSubmit={r => submitResponse(modalListing, 'no', r)} onClose={() => setModalListing(null)} isMobile={false} />}
      {detailListing && <ListingDetailModal listing={detailListing} onClose={() => setDetailListing(null)} isMobile={false} />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// EXPORT: route to the right component
// ══════════════════════════════════════════════════════════════════════════════
export default function Listings() {
  const isMobile = useIsMobile();
  return isMobile ? <MobileListings /> : <DesktopListings />;
}
