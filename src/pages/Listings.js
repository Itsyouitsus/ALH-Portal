import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { db } from '../firebase';
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';

const NO_REASONS = [
  'Too expensive', 'Too small', 'Too big', 'Wrong area',
  'Wrong furnishing', 'Shell only', 'Too few bedrooms', 'Too many bedrooms',
  'Not available in time', 'Max rental period', 'Ground floor', 'No outdoor space',
];

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  viewing:         { label: 'Viewing scheduled',  color: 'var(--blue)',       bg: '#e8f0fe' },
  offer_accepted:  { label: 'Offer accepted 🎉',  color: '#1a7a3c',           bg: '#d4edda' },
  offer_cancelled: { label: 'Offer cancelled',    color: 'var(--text-muted)', bg: 'var(--gold-card)' },
  offer_rejected:  { label: 'Offer not accepted', color: 'var(--text-muted)', bg: 'var(--gold-card)' },
  waiting:         { label: 'Waiting for update', color: '#856404',           bg: '#fff3cd' },
  cancelled:       { label: 'Viewing cancelled',  color: 'var(--text-muted)', bg: 'var(--gold-card)' },
  not_interested:  { label: 'Not interested',     color: 'var(--text-muted)', bg: 'var(--gold-card)' },
};

function getStatusKey(listing) {
  const s = (listing.status || '').toLowerCase();
  if (s === 'viewing') return 'viewing';
  if (s.includes('offer accepted')) return 'offer_accepted';
  if (s.includes('offer cancelled')) return 'offer_cancelled';
  if (s.includes('offer not accepted')) return 'offer_rejected';
  if (s.includes('waiting')) return 'waiting';
  if (s.includes('viewing cancelled')) return 'cancelled';
  if (s.includes('not interested')) return 'not_interested';
  return null;
}

// ── Listing detail popup (address click) ─────────────────────────────────────
function ListingDetailModal({ listing, onClose }) {
  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(26,22,18,0.65)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:600,padding:24 }} onClick={onClose}>
      <div style={{ background:'var(--gold-bg)',borderRadius:16,padding:'28px 28px 24px',width:'100%',maxWidth:480,position:'relative' }} onClick={e => e.stopPropagation()}>
        <button onClick={onClose} style={{ position:'absolute',top:16,right:16,background:'none',border:'none',fontSize:20,cursor:'pointer',color:'var(--text-muted)',lineHeight:1 }}>×</button>

        {/* Neighbourhood + city */}
        {listing.area && (
          <div style={{ fontSize:11,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.07em',color:'var(--gold-dark)',marginBottom:6 }}>
            {listing.area} · {listing.city || 'Amsterdam'}
          </div>
        )}

        <div style={{ fontSize:20,fontWeight:700,color:'var(--near-black)',marginBottom:16,lineHeight:1.3,paddingRight:24 }}>
          {listing.address}
        </div>

        {/* Price block */}
        <div style={{ display:'flex',alignItems:'baseline',gap:6,marginBottom:20 }}>
          <span style={{ fontSize:28,fontWeight:700,color:'var(--near-black)' }}>€{listing.price?.toLocaleString()}</span>
          <span style={{ fontSize:13,color:'var(--text-muted)' }}>/month</span>
          {listing.serviceCosts > 0 && <span style={{ fontSize:12,color:'var(--text-muted)',marginLeft:4 }}>+€{listing.serviceCosts} service costs</span>}
        </div>

        {/* Specs grid */}
        <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px 20px',marginBottom:20 }}>
          {[
            ['Size', listing.size],
            ['Bedrooms', listing.beds ? `${listing.beds} bedroom${listing.beds > 1 ? 's' : ''}` : null],
            ['Furnishing', listing.furnishing],
            ['Available', listing.availableFrom],
            ['Neighbourhood', listing.area],
            ['Energy label', listing.energyLabel],
            ['Floor', listing.floor],
          ].filter(([,v]) => v).map(([label, val]) => (
            <div key={label}>
              <div style={{ fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em',color:'var(--text-muted)',marginBottom:2 }}>{label}</div>
              <div style={{ fontSize:14,fontWeight:500,color:'var(--near-black)' }}>{val}</div>
            </div>
          ))}
        </div>

        {/* Notes */}
        {listing.notes && (
          <div style={{ fontSize:13,color:'var(--text-muted)',fontStyle:'italic',borderLeft:'2px solid var(--gold)',paddingLeft:10,marginBottom:16 }}>
            {listing.notes}
          </div>
        )}

        {/* Original listing link */}
        {listing.url && (
          <a href={listing.url} target="_blank" rel="noopener noreferrer" style={{ display:'flex',alignItems:'center',gap:8,background:'var(--near-black)',color:'var(--gold)',textDecoration:'none',padding:'12px 18px',borderRadius:10,fontSize:14,fontWeight:600,justifyContent:'center' }}>
            View original listing ↗
          </a>
        )}
      </div>
    </div>
  );
}

// ── Map view ──────────────────────────────────────────────────────────────────
function MapView({ listings }) {
  const mapRef = useRef(null);
  const [selected, setSelected] = useState(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  useEffect(() => {
    // Load Leaflet dynamically
    if (window._leafletLoaded) { setMapLoaded(true); return; }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
    document.head.appendChild(link);
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    script.onload = () => { window._leafletLoaded = true; setMapLoaded(true); };
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const L = window.L;
    if (mapRef.current._leaflet_id) return; // already initialised

    const map = L.map(mapRef.current).setView([52.3676, 4.9041], 12);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap © CARTO', maxZoom: 19,
    }).addTo(map);

    // Geocode listings that have coordinates, or skip those that don't
    const withCoords = listings.filter(l => l.lat && l.lng);
    const withoutCoords = listings.filter(l => !l.lat && !l.lng);

    // Use Nominatim for geocoding (free, no API key)
    const geocodeAndAdd = async (listing) => {
      try {
        const q = encodeURIComponent(`${listing.address}, Amsterdam, Netherlands`);
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`);
        const data = await res.json();
        if (data[0]) {
          const lat = parseFloat(data[0].lat);
          const lng = parseFloat(data[0].lon);
          addMarker(listing, lat, lng);
        }
      } catch {}
    };

    const addMarker = (listing, lat, lng) => {
      const color = listing.clientResponse === 'yes' ? '#c9a96e'
        : listing.clientResponse === 'no' ? '#aaa'
        : '#0f0f0d';

      const icon = L.divIcon({
        html: `<div style="width:28px;height:28px;background:${color};border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;">
          <span style="transform:rotate(45deg);font-size:11px;font-weight:700;color:${color==='#c9a96e'?'#0f0f0d':'white'}">€</span>
        </div>`,
        className: '',
        iconSize: [28, 28],
        iconAnchor: [14, 28],
        popupAnchor: [0, -30],
      });

      const statusKey = getStatusKey(listing);
      const statusCfg = statusKey ? STATUS_CONFIG[statusKey] : null;

      const popup = L.popup({ maxWidth: 280 }).setContent(`
        <div style="font-family:system-ui,sans-serif;padding:4px;">
          ${listing.area ? `<div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:#c9a96e;margin-bottom:4px;">${listing.area}</div>` : ''}
          <div style="font-size:14px;font-weight:700;color:#0f0f0d;margin-bottom:6px;">${listing.address}</div>
          <div style="font-size:18px;font-weight:700;color:#0f0f0d;margin-bottom:8px;">€${(listing.price||0).toLocaleString()}<span style="font-size:11px;font-weight:400;color:#888">/mo</span></div>
          <div style="display:flex;gap:10px;font-size:12px;color:#666;margin-bottom:10px;flex-wrap:wrap;">
            ${listing.size ? `<span>📐 ${listing.size}</span>` : ''}
            ${listing.beds ? `<span>🛏 ${listing.beds} bed</span>` : ''}
            ${listing.furnishing ? `<span>🪑 ${listing.furnishing}</span>` : ''}
          </div>
          ${statusCfg ? `<div style="font-size:11px;font-weight:600;color:${statusCfg.color};background:${statusCfg.bg};padding:3px 8px;border-radius:10px;display:inline-block;margin-bottom:8px;">${statusCfg.label}</div>` : ''}
          ${listing.url ? `<a href="${listing.url}" target="_blank" style="display:block;background:#0f0f0d;color:#c9a96e;text-decoration:none;padding:8px 12px;border-radius:7px;font-size:12px;font-weight:600;text-align:center;">View listing ↗</a>` : ''}
        </div>
      `);

      L.marker([lat, lng], { icon }).addTo(map).bindPopup(popup);
    };

    // Add markers with coordinates directly
    withCoords.forEach(l => addMarker(l, l.lat, l.lng));

    // Geocode the rest (throttled)
    let delay = 0;
    withoutCoords.slice(0, 30).forEach(listing => {
      setTimeout(() => geocodeAndAdd(listing), delay);
      delay += 400; // Nominatim rate limit: max 1 req/sec
    });

    window._alhMap = map;
  }, [mapLoaded, listings]);

  return (
    <div style={{ position:'relative' }}>
      {!mapLoaded && (
        <div style={{ height:500,background:'var(--card-bg)',borderRadius:14,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-muted)' }}>
          Loading map...
        </div>
      )}
      <div ref={mapRef} style={{ height:520,borderRadius:14,overflow:'hidden',display:mapLoaded?'block':'none' }}/>
      <div style={{ fontSize:12,color:'var(--text-muted)',marginTop:8,textAlign:'center' }}>
        🟡 Interested · ⚫ New · ⚪ Passed — addresses are geocoded automatically
      </div>
    </div>
  );
}

// ── "Why not" modal — centered ─────────────────────────────────────────────────
function NoFeedbackModal({ listing, onSubmit, onClose }) {
  const [selected, setSelected] = useState([]);
  const [other, setOther] = useState('');
  const toggle = r => setSelected(s => s.includes(r) ? s.filter(x => x !== r) : [...s, r]);

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(26,22,18,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:500,padding:24 }} onClick={onClose}>
      <div style={{ background:'var(--gold-bg)',borderRadius:16,padding:'28px 24px',width:'100%',maxWidth:480 }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize:17,fontWeight:700,marginBottom:4 }}>Why not this one?</div>
        <div style={{ fontSize:13,color:'var(--text-muted)',marginBottom:20 }}>{listing.address} — select all that apply</div>
        <div style={{ display:'flex',flexWrap:'wrap',gap:8,marginBottom:16 }}>
          {NO_REASONS.map(r => (
            <button key={r} onClick={() => toggle(r)} style={{ padding:'7px 14px',borderRadius:20,border:'1.5px solid',borderColor:selected.includes(r)?'var(--near-black)':'var(--gold-mid)',background:selected.includes(r)?'var(--near-black)':'var(--gold-bg)',color:selected.includes(r)?'var(--gold-bg)':'var(--text-muted)',fontSize:13,cursor:'pointer',fontFamily:"'DM Sans',sans-serif",transition:'all 0.12s' }}>{r}</button>
          ))}
        </div>
        <div className="field">
          <label>Other reason (optional)</label>
          <input type="text" value={other} onChange={e => setOther(e.target.value)} placeholder="e.g. street is too noisy" onKeyDown={e => e.key==='Enter' && (selected.length||other) && onSubmit([...selected,...(other?[other]:[])])}/>
        </div>
        <button className="btn-primary" style={{ width:'100%',marginTop:16,padding:13,fontSize:15 }} onClick={() => { const r=[...selected,...(other?[other]:[])]; if(r.length) onSubmit(r); }} disabled={selected.length===0&&!other}>
          Submit feedback
        </button>
      </div>
    </div>
  );
}

// ── Spec pill ─────────────────────────────────────────────────────────────────
function Spec({ icon, value }) {
  if (!value) return null;
  return (
    <div style={{ display:'flex',alignItems:'center',gap:4,fontSize:13,color:'var(--near-black)' }}>
      <span style={{ fontSize:14 }}>{icon}</span><span>{value}</span>
    </div>
  );
}

// ── Listing card ──────────────────────────────────────────────────────────────
function ListingCard({ listing, onResponse, onOpenDetail }) {
  const startX = useRef(null);
  const [swipeX, setSwipeX] = useState(0);
  const [swiping, setSwiping] = useState(false);

  const statusKey = getStatusKey(listing);
  const statusCfg = statusKey ? STATUS_CONFIG[statusKey] : null;
  const responded = !!listing.clientResponse;
  const isYesCard = listing.clientResponse === 'yes' || !!statusKey;
  const isNoCard  = listing.clientResponse === 'no' && !statusKey;

  const handleTouchStart = e => { startX.current = e.touches[0].clientX; setSwiping(true); };
  const handleTouchMove  = e => { if (!startX.current) return; setSwipeX(e.touches[0].clientX - startX.current); };
  const handleTouchEnd   = () => {
    if (swipeX > 60) onResponse(listing, 'yes');
    else if (swipeX < -60) onResponse(listing, 'no');
    setSwipeX(0); setSwiping(false); startX.current = null;
  };

  const swipeOp = Math.min(Math.abs(swipeX) / 80, 1);

  return (
    <div
      onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
      style={{
        background: 'var(--card-bg)', borderRadius:14, padding:'18px 20px',
        borderLeft:`4px solid ${statusKey==='offer_accepted'?'#1a7a3c':isYesCard?'var(--gold)':isNoCard?'var(--gold-mid)':'transparent'}`,
        border:`1px solid ${isYesCard?'rgba(201,169,110,0.25)':isNoCard?'var(--gold-mid)':'transparent'}`,
        borderLeft:`4px solid ${statusKey==='offer_accepted'?'#1a7a3c':isYesCard?'var(--gold)':isNoCard?'var(--gold-mid)':'transparent'}`,
        opacity: isNoCard ? 0.72 : 1,
        transform:`translateX(${swipeX*0.3}px)`,
        transition: swiping?'none':'transform 0.3s ease',
        position:'relative', overflow:'hidden',
      }}
    >
      {swipeX > 20 && <div style={{ position:'absolute',inset:0,background:`rgba(45,122,79,${swipeOp*0.12})`,display:'flex',alignItems:'center',paddingLeft:20,pointerEvents:'none' }}><span style={{ fontSize:28,fontWeight:700,color:'var(--success)',opacity:swipeOp }}>YES ✓</span></div>}
      {swipeX < -20 && <div style={{ position:'absolute',inset:0,background:`rgba(163,45,45,${swipeOp*0.12})`,display:'flex',alignItems:'center',justifyContent:'flex-end',paddingRight:20,pointerEvents:'none' }}><span style={{ fontSize:28,fontWeight:700,color:'var(--danger)',opacity:swipeOp }}>NO ✕</span></div>}

      <div style={{ display:'flex',alignItems:'flex-start',gap:14 }}>
        <div style={{ flex:1,minWidth:0 }}>
          {listing.area && (
            <div style={{ fontSize:11,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.07em',color:'var(--gold-dark)',marginBottom:4 }}>
              {listing.area} · {listing.city||'Amsterdam'}
            </div>
          )}

          {/* Clickable address */}
          <div
            onClick={() => onOpenDetail(listing)}
            style={{ fontSize:15,fontWeight:700,color:'var(--near-black)',lineHeight:1.3,marginBottom:8,cursor:'pointer',textDecoration:'underline',textDecorationColor:'var(--gold)',textUnderlineOffset:3 }}
          >
            {listing.address}
          </div>

          <div style={{ display:'flex',gap:16,flexWrap:'wrap',marginBottom:8 }}>
            <Spec icon="📐" value={listing.size}/>
            <Spec icon="🛏" value={listing.beds ? `${listing.beds} bed${listing.beds>1?'s':''}` : null}/>
            <Spec icon="🪑" value={listing.furnishing}/>
            <Spec icon="📅" value={listing.availableFrom}/>
          </div>

          {listing.serviceCosts > 0 && (
            <div style={{ fontSize:12,color:'var(--text-muted)' }}>+€{listing.serviceCosts?.toLocaleString()} service costs/month</div>
          )}

          {statusCfg && (
            <div style={{ display:'inline-flex',alignItems:'center',gap:5,marginTop:8,fontSize:12,fontWeight:600,color:statusCfg.color,background:statusCfg.bg,padding:'4px 10px',borderRadius:20 }}>
              {statusCfg.label}
            </div>
          )}

          {isNoCard && listing.noReasons?.length > 0 && (
            <div style={{ marginTop:6,display:'flex',flexWrap:'wrap',gap:4 }}>
              {listing.noReasons.map(r => (
                <span key={r} style={{ fontSize:11,padding:'2px 8px',borderRadius:12,background:'var(--gold-card)',color:'var(--text-muted)' }}>{r}</span>
              ))}
            </div>
          )}

          {listing.notes && (
            <div style={{ marginTop:8,fontSize:12,color:'var(--text-muted)',fontStyle:'italic',borderLeft:'2px solid var(--gold-mid)',paddingLeft:8 }}>{listing.notes}</div>
          )}
        </div>

        <div style={{ textAlign:'right',flexShrink:0 }}>
          <div style={{ fontSize:20,fontWeight:700,color:'var(--near-black)',lineHeight:1 }}>€{listing.price?.toLocaleString()}</div>
          <div style={{ fontSize:11,color:'var(--text-muted)',marginBottom:12 }}>/month</div>

          {!responded && !statusKey && (
            <div style={{ display:'flex',gap:6,justifyContent:'flex-end' }}>
              <button onClick={() => onResponse(listing,'yes')} style={{ width:34,height:34,borderRadius:8,border:'1.5px solid var(--gold-mid)',background:'var(--gold-bg)',cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center' }}>✓</button>
              <button onClick={() => onResponse(listing,'no')}  style={{ width:34,height:34,borderRadius:8,border:'1.5px solid var(--gold-mid)',background:'var(--gold-bg)',cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center' }}>✕</button>
            </div>
          )}
          {responded && !statusKey && (
            <button onClick={() => onResponse(listing, listing.clientResponse==='yes'?'toggle':'toggle')} style={{ fontSize:11,color:'var(--text-muted)',background:'none',border:'none',cursor:'pointer',textDecoration:'underline' }}>Change</button>
          )}
        </div>
      </div>

      {/* Mobile buttons */}
      {!responded && !statusKey && (
        <div style={{ display:'flex',gap:10,marginTop:14 }}>
          <button onClick={() => onResponse(listing,'yes')} style={{ flex:1,padding:11,borderRadius:10,border:'1.5px solid var(--success)',background:'var(--success-bg)',color:'var(--success)',fontSize:14,fontWeight:600,cursor:'pointer',fontFamily:"'DM Sans',sans-serif" }}>✓ Yes, want to view</button>
          <button onClick={() => onResponse(listing,'no')}  style={{ flex:1,padding:11,borderRadius:10,border:'1.5px solid var(--gold-mid)',background:'var(--gold-bg)',color:'var(--text-muted)',fontSize:14,fontWeight:600,cursor:'pointer',fontFamily:"'DM Sans',sans-serif" }}>✕ Not for me</button>
        </div>
      )}
      {!responded && !statusKey && (
        <div style={{ textAlign:'center',fontSize:11,color:'var(--text-light)',marginTop:8 }}>Swipe right for yes · left for no</div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Listings() {
  const { user } = useAuth();
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalListing, setModalListing] = useState(null);   // "why not" modal
  const [detailListing, setDetailListing] = useState(null); // detail popup
  const [tab, setTab] = useState('new'); // new | yes | no | all | map

  useEffect(() => {
    if (!user) return;
    getDocs(query(collection(db,'listings'), where('clientId','==',user.uid))).then(snap => {
      const data = snap.docs.map(d => ({ id:d.id,...d.data() }));
      data.sort((a,b) => {
        const rank = l => !l.clientResponse && !getStatusKey(l) ? 0 : l.clientResponse==='yes'||getStatusKey(l) ? 1 : 2;
        return rank(a) - rank(b);
      });
      setListings(data);
      setLoading(false);
    });
  }, [user]);

  const handleResponse = (listing, response) => {
    if (getStatusKey(listing)==='viewing') return;
    if (response==='toggle') { submitResponse(listing, null, []); return; }
    if (response==='no') setModalListing(listing);
    else submitResponse(listing, 'yes', []);
  };

  const submitResponse = async (listing, response, reasons) => {
    const ref = doc(db,'listings',listing.id);
    const update = { clientResponse:response, noReasons:reasons||[], respondedAt:serverTimestamp() };
    await updateDoc(ref, update);
    setListings(ls => ls.map(l => l.id===listing.id ? {...l,...update} : l));
    setModalListing(null);
  };

  const newCount  = listings.filter(l => !l.clientResponse && !getStatusKey(l)).length;
  const yesCount  = listings.filter(l => l.clientResponse==='yes' || getStatusKey(l)).length;
  const noCount   = listings.filter(l => l.clientResponse==='no' && !getStatusKey(l)).length;
  const viewings  = listings.filter(l => l.status==='viewing').length;

  const filtered = listings.filter(l => {
    if (tab==='new') return !l.clientResponse && !getStatusKey(l);
    if (tab==='yes') return l.clientResponse==='yes' || getStatusKey(l);
    if (tab==='no')  return l.clientResponse==='no' && !getStatusKey(l);
    return true; // all + map show everything
  });

  if (loading) return <div className="loading-screen">Loading your listings...</div>;

  const TABS = [
    { key:'new',  label:`New`,         count:newCount,  dot:newCount>0 },
    { key:'yes',  label:`Interested`,  count:yesCount },
    { key:'no',   label:`Passed`,      count:noCount },
    { key:'all',  label:`All`,         count:listings.length },
    { key:'map',  label:`🗺 Map` },
  ];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Your listings</div>
          <div className="page-sub">Properties matched to your search profile</div>
        </div>
      </div>

      {/* Stats */}
      <div className="stat-row" style={{ marginBottom:20 }}>
        <div className="stat"><div className="stat-label">Properties found</div><div className="stat-val">{listings.length}</div></div>
        <div className="stat"><div className="stat-label">Awaiting response</div><div className="stat-val" style={{ color:newCount>0?'var(--gold-dark)':undefined }}>{newCount}</div></div>
        <div className="stat"><div className="stat-label">Want to view</div><div className="stat-val gold">{yesCount}</div></div>
        <div className="stat"><div className="stat-label">Viewings booked</div><div className="stat-val">{viewings}</div></div>
      </div>

      {/* Tabs: New | Interested | Passed | All | Map */}
      <div style={{ display:'flex',gap:4,marginBottom:20,background:'var(--card-bg)',borderRadius:10,padding:4,overflowX:'auto' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ flex:t.key==='map'?'0 0 auto':1,padding:'8px 14px',borderRadius:7,fontSize:13,fontWeight:500,cursor:'pointer',border:'none',fontFamily:"'DM Sans',sans-serif",background:tab===t.key?'var(--near-black)':'transparent',color:tab===t.key?'var(--gold-bg)':'var(--text-muted)',transition:'all 0.15s',whiteSpace:'nowrap',position:'relative' }}>
            {t.label}{t.count!=null ? ` (${t.count})` : ''}
            {t.dot && tab!==t.key && <span style={{ position:'absolute',top:6,right:6,width:6,height:6,borderRadius:'50%',background:'var(--gold)' }}/>}
          </button>
        ))}
      </div>

      {/* Map view */}
      {tab==='map' && <MapView listings={listings}/>}

      {/* List views */}
      {tab!=='map' && (
        listings.length===0 ? (
          <div className="card" style={{ textAlign:'center',padding:'48px 24px',color:'var(--text-muted)' }}>
            <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:22,marginBottom:10 }}>No listings yet</div>
            <div style={{ fontSize:14 }}>Your agent is actively searching. You'll receive an email as soon as new properties are shared with you.</div>
          </div>
        ) : filtered.length===0 ? (
          <div className="card" style={{ textAlign:'center',padding:32,color:'var(--text-muted)',fontSize:14 }}>No listings in this category yet.</div>
        ) : (
          <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
            {filtered.map(l => (
              <ListingCard key={l.id} listing={l} onResponse={handleResponse} onOpenDetail={setDetailListing}/>
            ))}
          </div>
        )
      )}

      {/* Why not modal — centered */}
      {modalListing && (
        <NoFeedbackModal
          listing={modalListing}
          onSubmit={reasons => submitResponse(modalListing,'no',reasons)}
          onClose={() => setModalListing(null)}
        />
      )}

      {/* Detail modal */}
      {detailListing && (
        <ListingDetailModal listing={detailListing} onClose={() => setDetailListing(null)}/>
      )}
    </div>
  );
}
