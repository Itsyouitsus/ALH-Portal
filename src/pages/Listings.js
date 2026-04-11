import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
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
  offer_accepted:   { label: 'Offer accepted! 🎉', color: '#1a7a3c',           bg: '#d4edda' },
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

// ── Map pane ──────────────────────────────────────────────────────────────────
function MapPane({ listings, height, hoveredId, onMarkerHover, onMarkerClick }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef({});  // keyed by listing.id
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
    if (!mapReady || !mapRef.current || mapInstanceRef.current) return;
    const L = window.L;
    const map = L.map(mapRef.current).setView([52.3676, 4.9041], 12);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap © CARTO', maxZoom: 19,
    }).addTo(map);
    mapInstanceRef.current = map;
    // Force map to recalculate its size after flex layout resolves
    setTimeout(() => { map.invalidateSize(); map.invalidateSize(); }, 200);
  }, [mapReady]);

  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    const L = window.L;
    const map = mapInstanceRef.current;

    // Clear old markers
    Object.values(markersRef.current).forEach(m => m.remove());
    markersRef.current = {};
    map.setView([52.3676, 4.9041], 12);
    setTimeout(() => { map.invalidateSize(); map.invalidateSize(); }, 200);

    // Place markers directly from stored coordinates (no geocoding needed)
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
          <div style="font-size:20px;font-weight:700;color:#0f0f0d;margin-bottom:6px;">€${(listing.price||0).toLocaleString()}<span style="font-size:11px;font-weight:400;color:#888">/mo</span></div>
          <div style="display:flex;gap:10px;font-size:12px;color:#666;margin-bottom:10px;flex-wrap:wrap;">
            ${listing.size ? `<span>📐 ${listing.size}</span>` : ''}
            ${listing.beds ? `<span>🛏 ${listing.beds} bed</span>` : ''}
            ${listing.furnishing ? `<span>🪑 ${listing.furnishing}</span>` : ''}
          </div>
          ${statusCfg ? `<div style="font-size:11px;font-weight:600;color:${statusCfg.color};background:${statusCfg.bg};padding:3px 8px;border-radius:10px;display:inline-block;margin-bottom:8px;">${statusCfg.label}</div><br>` : ''}
          ${listing.url ? `<a href="${listing.url}" target="_blank" style="display:block;background:#0f0f0d;color:#c9a96e;text-decoration:none;padding:8px 12px;border-radius:7px;font-size:12px;font-weight:600;text-align:center;margin-top:4px;">View listing ↗</a>` : ''}
        </div>`);

      const marker = L.marker([listing.lat, listing.lng], { icon }).addTo(map).bindPopup(popup);
      // Hover: highlight this marker, notify parent
      marker.getElement()?.addEventListener('mouseenter', () => onMarkerHover && onMarkerHover(listing.id));
      marker.getElement()?.addEventListener('mouseleave', () => onMarkerHover && onMarkerHover(null));
      // Click on marker: scroll to listing in the list
      marker.on('click', () => onMarkerClick && onMarkerClick(listing.id));
      markersRef.current[listing.id] = marker;
    });
  }, [mapReady, listings]);

  // Highlight marker when hoveredId changes
  useEffect(() => {
    Object.entries(markersRef.current).forEach(([id, marker]) => {
      const el = marker.getElement();
      if (!el) return;
      const pin = el.querySelector('div');
      if (!pin) return;
      if (id === hoveredId) {
        pin.style.transform = 'rotate(-45deg) scale(1.35)';
        pin.style.boxShadow = '0 4px 16px rgba(0,0,0,0.4)';
        pin.style.zIndex = '1000';
        marker.getElement().style.zIndex = '1000';
      } else {
        pin.style.transform = 'rotate(-45deg) scale(1)';
        pin.style.boxShadow = '0 2px 8px rgba(0,0,0,0.25)';
        marker.getElement().style.zIndex = '';
      }
    });
  }, [hoveredId]);

  return (
    <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--gold-mid)', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {!mapReady && <div style={{ flex: 1, background: 'var(--card-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 14 }}>Loading map...</div>}
      <div ref={mapRef} style={{ flex: 1, minHeight: 0, height: '100%', display: mapReady ? 'block' : 'none' }} />
      {mapReady && (
        <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 999, background: 'white', borderRadius: 20, padding: '4px 14px', fontSize: 11, color: '#555', display: 'flex', gap: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.12)', whiteSpace: 'nowrap' }}>
          <span><span style={{ color: '#22c55e', fontWeight: 700 }}>●</span> Interested</span>
          <span><span style={{ color: '#eab308', fontWeight: 700 }}>●</span> New</span>
          <span><span style={{ color: '#ef4444', fontWeight: 700 }}>●</span> Not interested</span>
        </div>
      )}
    </div>
  );
}

// ── Detail popup ──────────────────────────────────────────────────────────────
function ListingDetailModal({ listing, onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,22,18,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 600, padding: 24 }} onClick={onClose}>
      <div style={{ background: 'var(--gold-bg)', borderRadius: 16, padding: '28px 28px 24px', width: '100%', maxWidth: 480, position: 'relative' }} onClick={e => e.stopPropagation()}>
        <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-muted)', lineHeight: 1 }}>×</button>
        {listing.area && <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--gold-dark)', marginBottom: 6 }}>{listing.area} · {listing.city || 'Amsterdam'}</div>}
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--near-black)', marginBottom: 16, lineHeight: 1.3, paddingRight: 28 }}>{listing.address}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 20 }}>
          <span style={{ fontSize: 28, fontWeight: 700 }}>€{listing.price?.toLocaleString()}</span>
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
        {listing.url && <a href={listing.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--near-black)', color: 'var(--gold)', textDecoration: 'none', padding: '12px 18px', borderRadius: 10, fontSize: 14, fontWeight: 600, justifyContent: 'center' }}>View original listing ↗</a>}
      </div>
    </div>
  );
}

// ── Why not modal ─────────────────────────────────────────────────────────────
function NoFeedbackModal({ listing, onSubmit, onClose }) {
  const [selected, setSelected] = useState([]);
  const [other, setOther] = useState('');
  const toggle = r => setSelected(s => s.includes(r) ? s.filter(x => x !== r) : [...s, r]);
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,22,18,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: 24 }} onClick={onClose}>
      <div style={{ background: 'var(--gold-bg)', borderRadius: 16, padding: '28px 24px', width: '100%', maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Why not this one?</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>{listing.address} — select all that apply</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {NO_REASONS.map(r => (
            <button key={r} onClick={() => toggle(r)} style={{ padding: '7px 14px', borderRadius: 20, border: '1.5px solid', borderColor: selected.includes(r) ? 'var(--near-black)' : 'var(--gold-mid)', background: selected.includes(r) ? 'var(--near-black)' : 'var(--gold-bg)', color: selected.includes(r) ? 'var(--gold-bg)' : 'var(--text-muted)', fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", transition: 'all 0.12s' }}>{r}</button>
          ))}
        </div>
        <div className="field">
          <label>Other reason (optional)</label>
          <input type="text" value={other} onChange={e => setOther(e.target.value)} placeholder="e.g. street is too noisy" />
        </div>
        <button className="btn-primary" style={{ width: '100%', marginTop: 16, padding: 13, fontSize: 15 }} onClick={() => { const r = [...selected, ...(other ? [other] : [])]; if (r.length) onSubmit(r); }} disabled={selected.length === 0 && !other}>
          Submit feedback
        </button>
      </div>
    </div>
  );
}

// ── Listing card — matches screenshot exactly ─────────────────────────────────
// Layout: [neighbourhood · city] [price top-right]
//         [bold address]
//         [📐 size  ↔ beds  🪑 furnishing]   [✓ ✕ buttons]
//         [📅 available from]
//         [status badge if any]
//         [no reasons if passed]
function ListingCard({ listing, onResponse, onOpenDetail, hoveredId, onHover, cardRef }) {
  const startX = useRef(null);
  const [swipeX, setSwipeX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const statusKey = getStatusKey(listing);
  const statusCfg = statusKey ? STATUS_CONFIG[statusKey] : null;
  const responded = !!listing.clientResponse;
  const isYes = listing.clientResponse === 'yes' || !!statusKey;
  const isNo = listing.clientResponse === 'no' && !statusKey;
  const swipeOp = Math.min(Math.abs(swipeX) / 80, 1);

  const accentColor = statusKey === 'offer_accepted' ? '#1a7a3c' : statusKey === 'wip' || statusKey === 'viewing' ? 'var(--blue)' : isYes ? 'var(--gold)' : isNo ? 'var(--gold-mid)' : 'transparent';

  const isHovered = hoveredId === listing.id;

  return (
    <div
      ref={cardRef}
      onMouseEnter={() => onHover && onHover(listing.id)}
      onMouseLeave={() => onHover && onHover(null)}
      onTouchStart={e => { startX.current = e.touches[0].clientX; setSwiping(true); }}
      onTouchMove={e => { if (!startX.current) return; setSwipeX(e.touches[0].clientX - startX.current); }}
      onTouchEnd={() => { if (swipeX > 60) onResponse(listing, 'yes'); else if (swipeX < -60) onResponse(listing, 'no'); setSwipeX(0); setSwiping(false); startX.current = null; }}
      style={{
        background: isHovered ? 'var(--gold-card)' : 'var(--card-bg)',
        borderRadius: 12,
        padding: '11px 16px',
        scrollMarginTop: 12,
        borderLeft: `4px solid ${isHovered ? 'var(--gold)' : accentColor}`,
        opacity: isNo && !isHovered ? 0.75 : 1,

        transform: `translateX(${swipeX * 0.3}px)`,
        transition: swiping ? 'none' : 'all 0.15s ease',
        position: 'relative', overflow: 'hidden',
      }}
    >
      {/* Swipe overlays */}
      {swipeX > 20 && <div style={{ position: 'absolute', inset: 0, background: `rgba(45,122,79,${swipeOp * 0.12})`, display: 'flex', alignItems: 'center', paddingLeft: 20, pointerEvents: 'none' }}><span style={{ fontSize: 26, fontWeight: 700, color: 'var(--success)', opacity: swipeOp }}>YES ✓</span></div>}
      {swipeX < -20 && <div style={{ position: 'absolute', inset: 0, background: `rgba(163,45,45,${swipeOp * 0.12})`, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 20, pointerEvents: 'none' }}><span style={{ fontSize: 26, fontWeight: 700, color: 'var(--danger)', opacity: swipeOp }}>NO ✕</span></div>}

      {/* Price — absolute top-right so it never affects content height */}
      <div style={{ position: 'absolute', top: 11, right: 16, textAlign: 'right' }}>
        <div>
          <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--near-black)', letterSpacing: '-0.01em' }}>€{listing.price?.toLocaleString()}</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 2 }}>/mo</span>
        </div>
        {listing.serviceCosts > 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>+€{listing.serviceCosts?.toLocaleString()} service costs</div>
        )}
      </div>

      {/* Row 1: neighbourhood — left only, padded right so text doesn't overlap price */}
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--gold-dark)', marginBottom: 2, paddingRight: 140 }}>
        {[listing.area, listing.city || 'Amsterdam'].filter(Boolean).join(' · ')}
      </div>

      {/* Row 2: address (clickable) */}
      <div
        onClick={() => onOpenDetail(listing)}
        style={{ fontSize: 14, fontWeight: 700, color: 'var(--near-black)', lineHeight: 1.3, marginBottom: 7, cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'var(--gold)', textUnderlineOffset: 3, paddingRight: 140 }}
      >
        {listing.address}
      </div>

      {/* Row 3: specs + action buttons */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
        {/* Specs — same line, icon + text, matching screenshot */}
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

        {/* Action buttons — right side, same row as specs */}
        {!responded && !statusKey && (
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button
              onClick={() => onResponse(listing, 'yes')}
              style={{ width: 34, height: 34, borderRadius: 8, border: '1.5px solid var(--gold-mid)', background: 'var(--gold-bg)', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', transition: 'all 0.12s' }}
            >✓</button>
            <button
              onClick={() => onResponse(listing, 'no')}
              style={{ width: 34, height: 34, borderRadius: 8, border: '1.5px solid var(--gold-mid)', background: 'var(--gold-bg)', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', transition: 'all 0.12s' }}
            >✕</button>
          </div>
        )}
        {responded && !statusKey && (
          <button onClick={() => onResponse(listing, 'toggle')} style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', flexShrink: 0 }}>Change</button>
        )}
      </div>

      {/* Row 4: availability */}
      {listing.availableFrom && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--near-black)', marginBottom: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          {listing.availableFrom}
        </div>
      )}


      {/* Status badge */}
      {statusCfg && (
        <div style={{ display: 'inline-flex', marginTop: 4, fontSize: 11, fontWeight: 600, color: statusCfg.color, background: statusCfg.bg, padding: '3px 10px', borderRadius: 20 }}>
          {statusCfg.label}
        </div>
      )}

      {/* No reasons */}
      {isNo && listing.noReasons?.length > 0 && (
        <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {listing.noReasons.map(r => <span key={r} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: 'var(--gold-card)', color: 'var(--text-muted)' }}>{r}</span>)}
        </div>
      )}

      {/* Agent notes */}
      {listing.notes && (
        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', borderLeft: '2px solid var(--gold-mid)', paddingLeft: 8 }}>{listing.notes}</div>
      )}

      {/* Mobile action buttons — hidden on desktop via CSS class */}
      {!responded && !statusKey && (
        <div className="mobile-only">
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={() => onResponse(listing, 'yes')} style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1.5px solid var(--success)', background: 'var(--success-bg)', color: 'var(--success)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>✓ Yes, want to view</button>
            <button onClick={() => onResponse(listing, 'no')} style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1.5px solid var(--gold-mid)', background: 'var(--gold-bg)', color: 'var(--text-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>✕ Not for me</button>
          </div>
          <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-light)', marginTop: 6 }}>Swipe right for yes · left for no</div>
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Listings() {
  const { user } = useAuth();
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalListing, setModalListing] = useState(null);
  const [detailListing, setDetailListing] = useState(null);
  const [tab, setTab] = useState('new');
  const [hoveredId, setHoveredId] = useState(null);
  const cardRefs = useRef({});  // listing.id → DOM ref
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

  const handleResponse = (listing, response) => {
    if (getStatusKey(listing) === 'viewing') return;
    if (response === 'toggle') { submitResponse(listing, null, []); return; }
    if (response === 'no') setModalListing(listing);
    else submitResponse(listing, 'yes', []);
  };

  const handleMarkerClick = (id) => {
    // Find which tab this listing belongs to and switch to it if needed
    const listing = listings.find(l => l.id === id);
    if (!listing) return;
    // Switch to the tab that would show this listing
    const sk = getStatusKey(listing);
    if (!listing.clientResponse && !sk) setTab('new');
    else if (listing.clientResponse === 'yes' || sk) setTab('yes');
    else if (listing.clientResponse === 'no' && !sk) setTab('no');
    // Scroll after a tick (tab change may re-render)
    setTimeout(() => {
      const el = cardRefs.current[id];
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      setHoveredId(id);
      setTimeout(() => setHoveredId(null), 2000);
    }, 80);
  };

  const submitResponse = async (listing, response, reasons) => {
    const ref = doc(db, 'listings', listing.id);
    const update = { clientResponse: response, noReasons: reasons || [], respondedAt: serverTimestamp() };
    await updateDoc(ref, update);
    setListings(ls => ls.map(l => l.id === listing.id ? { ...l, ...update } : l));
    setModalListing(null);
  };

  const newCount  = listings.filter(l => !l.clientResponse && !getStatusKey(l)).length;
  const yesCount  = listings.filter(l => l.clientResponse === 'yes' || getStatusKey(l)).length;
  const noCount   = listings.filter(l => l.clientResponse === 'no' && !getStatusKey(l)).length;
  const viewings  = listings.filter(l => l.status === 'viewing').length;
  const offers    = listings.filter(l => ['offer_accepted','offer_rejected','offer_cancelled'].includes(getStatusKey(l))).length;

  const TABS = [
    { key: 'new',  label: 'New',            count: newCount,       dot: newCount > 0 },
    { key: 'yes',  label: 'Interested',     count: yesCount },
    { key: 'no',   label: 'Not interested', count: noCount },
    { key: 'all',  label: 'All',            count: listings.length },
  ];

  const filtered = listings.filter(l => {
    if (tab === 'new') return !l.clientResponse && !getStatusKey(l);
    if (tab === 'yes') return l.clientResponse === 'yes' || getStatusKey(l);
    if (tab === 'no')  return l.clientResponse === 'no' && !getStatusKey(l);
    return true;
  });

  // Map shows same listings as current tab (all tab = all listings)
  const mapListings = filtered;

  if (loading) return <div className="loading-screen">Loading your listings...</div>;

  // ── Stats bar — full width, always above list+map ─────────────────────────
  const statsBar = (
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
  );

  // ── Tab bar ───────────────────────────────────────────────────────────────
  const tabBar = (
    <div style={{ display: 'flex', gap: 3, marginBottom: 10, background: 'var(--card-bg)', borderRadius: 9, padding: 3 }}>
      {TABS.map(t => (
        <button key={t.key} onClick={() => setTab(t.key)} style={{ flex: t.key === 'map' ? '0 0 auto' : 1, padding: '6px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: 'none', fontFamily: "'DM Sans',sans-serif", background: tab === t.key ? 'var(--near-black)' : 'transparent', color: tab === t.key ? 'var(--gold-bg)' : 'var(--text-muted)', transition: 'all 0.15s', whiteSpace: 'nowrap', position: 'relative' }}>
          {t.label}{t.count != null ? ` (${t.count})` : ''}
          {t.dot && tab !== t.key && <span style={{ position: 'absolute', top: 6, right: 6, width: 5, height: 5, borderRadius: '50%', background: 'var(--gold)' }} />}
        </button>
      ))}
    </div>
  );

  // ── Card list ─────────────────────────────────────────────────────────────
  const cardList = tab === 'map' ? <MapPane listings={listings} height="calc(100vh - 320px)" /> : (
    listings.length === 0 ? (
      <div className="card" style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
        <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, marginBottom: 10 }}>No listings yet</div>
        <div style={{ fontSize: 14 }}>Your agent is actively searching. You'll receive an email as soon as new properties are shared with you.</div>
      </div>
    ) : filtered.length === 0 ? (
      <div className="card" style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 14 }}>No listings in this category yet.</div>
    ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.map(l => {
              if (!cardRefs.current[l.id]) cardRefs.current[l.id] = { current: null };
              return <ListingCard
                key={l.id}
                listing={l}
                onResponse={handleResponse}
                onOpenDetail={setDetailListing}
                hoveredId={hoveredId}
                onHover={setHoveredId}
                cardRef={el => { cardRefs.current[l.id] = el; }}
              />;
            })}
      </div>
    )
  );

  return (
    <div className="page listings-page">


      {statsBar}

      {/* Desktop: two-column grid. Mobile: stacked */}
      <div className="listings-grid">
        <div className="listings-list-col">
          {tabBar}
          <div className="listings-scroll">
            {cardList}
          </div>
        </div>
        <MapPane listings={mapListings} height="100%" hoveredId={hoveredId} onMarkerHover={setHoveredId} onMarkerClick={handleMarkerClick} />
      </div>

      {modalListing && <NoFeedbackModal listing={modalListing} onSubmit={r => submitResponse(modalListing, 'no', r)} onClose={() => setModalListing(null)} />}
      {detailListing && <ListingDetailModal listing={detailListing} onClose={() => setDetailListing(null)} />}
    </div>
  );
}
