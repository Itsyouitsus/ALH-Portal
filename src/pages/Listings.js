import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { db } from '../firebase';
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';

const NO_REASONS = [
  'Too expensive', 'Too small', 'Too big', 'Wrong area',
  'Wrong furnishing', 'Shell only', 'Too few bedrooms', 'Too many bedrooms',
  'Not available in time', 'Max rental period', 'Ground floor', 'No outdoor space', 'Other'
];

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  viewing:          { label: 'Viewing scheduled', color: 'var(--blue)',    bg: '#e8f0fe' },
  offer_accepted:   { label: 'Offer accepted 🎉', color: '#1a7a3c',        bg: '#d4edda' },
  offer_cancelled:  { label: 'Offer cancelled',   color: 'var(--text-muted)', bg: 'var(--gold-card)' },
  offer_rejected:   { label: 'Offer not accepted',color: 'var(--text-muted)', bg: 'var(--gold-card)' },
  waiting:          { label: 'Waiting for update', color: '#856404',        bg: '#fff3cd' },
  cancelled:        { label: 'Viewing cancelled', color: 'var(--text-muted)', bg: 'var(--gold-card)' },
};

function getStatusKey(listing) {
  const s = (listing.status || '').toLowerCase();
  const r = (listing.clientResponse || '').toLowerCase();
  if (s === 'viewing') return 'viewing';
  if (s.includes('offer accepted')) return 'offer_accepted';
  if (s.includes('offer cancelled')) return 'offer_cancelled';
  if (s.includes('offer not accepted')) return 'offer_rejected';
  if (s.includes('waiting')) return 'waiting';
  if (s.includes('viewing cancelled')) return 'cancelled';
  return null;
}

// ── Why not modal ─────────────────────────────────────────────────────────────
function NoFeedbackModal({ listing, onSubmit, onClose }) {
  const [selected, setSelected] = useState([]);
  const [other, setOther] = useState('');
  const toggle = r => setSelected(s => s.includes(r) ? s.filter(x => x !== r) : [...s, r]);

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(26,22,18,0.6)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:500 }} onClick={onClose}>
      <div style={{ background:'var(--gold-bg)',borderRadius:'20px 20px 0 0',padding:'28px 24px 48px',width:'100%',maxWidth:540,maxHeight:'80vh',overflowY:'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ width:36,height:4,background:'var(--gold-mid)',borderRadius:2,margin:'0 auto 20px' }}/>
        <div style={{ fontSize:17,fontWeight:700,marginBottom:4 }}>Why not this one?</div>
        <div style={{ fontSize:13,color:'var(--text-muted)',marginBottom:20 }}>{listing.address} — select all that apply</div>
        <div style={{ display:'flex',flexWrap:'wrap',gap:8,marginBottom:16 }}>
          {NO_REASONS.filter(r => r !== 'Other').map(r => (
            <button key={r} onClick={() => toggle(r)} style={{ padding:'7px 14px',borderRadius:20,border:'1.5px solid',borderColor:selected.includes(r)?'var(--near-black)':'var(--gold-mid)',background:selected.includes(r)?'var(--near-black)':'var(--gold-bg)',color:selected.includes(r)?'var(--gold-bg)':'var(--text-muted)',fontSize:13,cursor:'pointer',fontFamily:"'DM Sans',sans-serif",transition:'all 0.12s' }}>{r}</button>
          ))}
        </div>
        <div className="field">
          <label>Additional note (optional)</label>
          <input type="text" value={other} onChange={e => setOther(e.target.value)} placeholder="e.g. street is too noisy"/>
        </div>
        <button className="btn-primary" style={{ width:'100%',marginTop:20,padding:13,fontSize:15 }} onClick={() => { const r=[...selected,...(other?[other]:[])]; if(r.length||other) onSubmit(r); }} disabled={selected.length===0&&!other}>
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
      <span style={{ fontSize:14 }}>{icon}</span>
      <span>{value}</span>
    </div>
  );
}

// ── Listing card ──────────────────────────────────────────────────────────────
function ListingCard({ listing, onResponse, rank }) {
  const startX = useRef(null);
  const [swipeX, setSwipeX] = useState(0);
  const [swiping, setSwiping] = useState(false);

  const statusKey = getStatusKey(listing);
  const statusCfg = statusKey ? STATUS_CONFIG[statusKey] : null;
  const responded = !!listing.clientResponse;
  const isYesCard = listing.clientResponse === 'yes' || statusKey;
  const isNoCard = listing.clientResponse === 'no' && !statusKey;

  const handleTouchStart = e => { startX.current = e.touches[0].clientX; setSwiping(true); };
  const handleTouchMove = e => { if (startX.current===null) return; setSwipeX(e.touches[0].clientX - startX.current); };
  const handleTouchEnd = () => {
    if (swipeX > 60) onResponse(listing, 'yes');
    else if (swipeX < -60) onResponse(listing, 'no');
    setSwipeX(0); setSwiping(false); startX.current = null;
  };

  const swipeOp = Math.min(Math.abs(swipeX)/80, 1);

  return (
    <div
      onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
      style={{
        background: isYesCard ? 'var(--card-bg)' : isNoCard ? 'var(--gold-bg)' : 'var(--card-bg)',
        borderRadius: 14,
        border: `1px solid ${isYesCard ? 'rgba(201,169,110,0.25)' : isNoCard ? 'var(--gold-mid)' : 'transparent'}`,
        borderLeft: `4px solid ${statusKey==='offer_accepted' ? '#1a7a3c' : isYesCard ? 'var(--gold)' : isNoCard ? 'var(--gold-mid)' : 'transparent'}`,
        opacity: isNoCard ? 0.72 : 1,
        transform: `translateX(${swipeX * 0.3}px)`,
        transition: swiping ? 'none' : 'transform 0.3s ease',
        position: 'relative', overflow: 'hidden',
        padding: '18px 20px',
      }}
    >
      {/* Swipe overlays */}
      {swipeX > 20 && <div style={{ position:'absolute',inset:0,background:`rgba(45,122,79,${swipeOp*0.12})`,display:'flex',alignItems:'center',paddingLeft:20,pointerEvents:'none' }}><span style={{ fontSize:28,fontWeight:700,color:'var(--success)',opacity:swipeOp }}>YES ✓</span></div>}
      {swipeX < -20 && <div style={{ position:'absolute',inset:0,background:`rgba(163,45,45,${swipeOp*0.12})`,display:'flex',alignItems:'center',justifyContent:'flex-end',paddingRight:20,pointerEvents:'none' }}><span style={{ fontSize:28,fontWeight:700,color:'var(--danger)',opacity:swipeOp }}>NO ✕</span></div>}

      {/* Top row: rank badge + address + price */}
      <div style={{ display:'flex',alignItems:'flex-start',gap:14 }}>
        {/* Rank badge — only on YES/interested */}
        {listing.order && (
          <div style={{ width:28,height:28,borderRadius:'50%',background:'var(--gold)',color:'var(--near-black)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,flexShrink:0,marginTop:2 }}>
            {listing.order}
          </div>
        )}

        <div style={{ flex:1,minWidth:0 }}>
          {/* Neighbourhood pill */}
          {listing.area && (
            <div style={{ fontSize:11,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.07em',color:'var(--gold-dark)',marginBottom:4 }}>
              {listing.area} · {listing.city || 'Amsterdam'}
            </div>
          )}

          {/* Address */}
          <div style={{ fontSize:15,fontWeight:700,color:'var(--near-black)',lineHeight:1.3,marginBottom:8 }}>
            {listing.address}
          </div>

          {/* Spec row */}
          <div style={{ display:'flex',gap:16,flexWrap:'wrap',marginBottom:8 }}>
            <Spec icon="📐" value={listing.size}/>
            <Spec icon="🛏" value={listing.beds ? `${listing.beds} bed${listing.beds > 1 ? 's' : ''}` : null}/>
            <Spec icon="🪑" value={listing.furnishing}/>
            <Spec icon="📅" value={listing.availableFrom}/>
          </div>

          {/* Service costs note */}
          {listing.serviceCosts > 0 && (
            <div style={{ fontSize:12,color:'var(--text-muted)' }}>
              +€{listing.serviceCosts?.toLocaleString()} service costs/month
            </div>
          )}

          {/* Status badge */}
          {statusCfg && (
            <div style={{ display:'inline-flex',alignItems:'center',gap:5,marginTop:8,fontSize:12,fontWeight:600,color:statusCfg.color,background:statusCfg.bg,padding:'4px 10px',borderRadius:20 }}>
              {statusCfg.label}
            </div>
          )}

          {/* "Not interested" reasons */}
          {isNoCard && listing.noReasons?.length > 0 && (
            <div style={{ marginTop:6,display:'flex',flexWrap:'wrap',gap:4 }}>
              {listing.noReasons.map(r => (
                <span key={r} style={{ fontSize:11,padding:'2px 8px',borderRadius:12,background:'var(--gold-card)',color:'var(--text-muted)' }}>{r}</span>
              ))}
            </div>
          )}

          {/* Notes from agent */}
          {listing.notes && (
            <div style={{ marginTop:8,fontSize:12,color:'var(--text-muted)',fontStyle:'italic',borderLeft:'2px solid var(--gold-mid)',paddingLeft:8 }}>
              {listing.notes}
            </div>
          )}
        </div>

        {/* Price + actions */}
        <div style={{ textAlign:'right',flexShrink:0 }}>
          <div style={{ fontSize:20,fontWeight:700,color:'var(--near-black)',lineHeight:1 }}>
            €{listing.price?.toLocaleString()}
          </div>
          <div style={{ fontSize:11,color:'var(--text-muted)',marginBottom:12 }}>/month</div>

          {/* Yes / No buttons — only show if no response yet and not in a final status */}
          {!responded && !statusKey && (
            <div style={{ display:'flex',gap:6,justifyContent:'flex-end' }}>
              <button onClick={() => onResponse(listing, 'yes')} title="I want to view this" style={{ width:34,height:34,borderRadius:8,border:'1.5px solid var(--gold-mid)',background:'var(--gold-bg)',cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.12s' }}>✓</button>
              <button onClick={() => onResponse(listing, 'no')} title="Not for me" style={{ width:34,height:34,borderRadius:8,border:'1.5px solid var(--gold-mid)',background:'var(--gold-bg)',cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.12s' }}>✕</button>
            </div>
          )}

          {/* Change response link */}
          {responded && !statusKey && (
            <button onClick={() => onResponse(listing, listing.clientResponse === 'yes' ? 'toggle_yes' : 'toggle_no')} style={{ fontSize:11,color:'var(--text-muted)',background:'none',border:'none',cursor:'pointer',textDecoration:'underline',marginTop:4 }}>
              Change
            </button>
          )}
        </div>
      </div>

      {/* Mobile action buttons */}
      {!responded && !statusKey && (
        <div style={{ display:'flex',gap:10,marginTop:14 }}>
          <button onClick={() => onResponse(listing, 'yes')} style={{ flex:1,padding:11,borderRadius:10,border:'1.5px solid var(--success)',background:'var(--success-bg)',color:'var(--success)',fontSize:14,fontWeight:600,cursor:'pointer',fontFamily:"'DM Sans',sans-serif" }}>
            ✓ Yes, want to view
          </button>
          <button onClick={() => onResponse(listing, 'no')} style={{ flex:1,padding:11,borderRadius:10,border:'1.5px solid var(--gold-mid)',background:'var(--gold-bg)',color:'var(--text-muted)',fontSize:14,fontWeight:600,cursor:'pointer',fontFamily:"'DM Sans',sans-serif" }}>
            ✕ Not for me
          </button>
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
  const [modalListing, setModalListing] = useState(null);
  const [filter, setFilter] = useState('all'); // all | new | yes | no

  useEffect(() => {
    if (!user) return;
    getDocs(query(collection(db, 'listings'), where('clientId', '==', user.uid)))
      .then(snap => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        // Sort: new first, then yes, then no
        data.sort((a, b) => {
          const order = l => l.clientResponse === 'yes' ? 1 : l.clientResponse === 'no' ? 2 : 0;
          return order(a) - order(b);
        });
        setListings(data);
        setLoading(false);
      });
  }, [user]);

  const handleResponse = (listing, response) => {
    if (getStatusKey(listing) === 'viewing') return;
    // Toggle: if already responded, undo
    if (response === 'toggle_yes' || response === 'toggle_no') {
      submitResponse(listing, null, []);
      return;
    }
    if (response === 'no') {
      setModalListing(listing);
    } else {
      submitResponse(listing, 'yes', []);
    }
  };

  const submitResponse = async (listing, response, reasons) => {
    const ref = doc(db, 'listings', listing.id);
    const update = { clientResponse: response, noReasons: reasons || [], respondedAt: serverTimestamp() };
    await updateDoc(ref, update);
    setListings(ls => ls.map(l => l.id === listing.id ? { ...l, ...update } : l));
    setModalListing(null);
  };

  const newCount   = listings.filter(l => !l.clientResponse && !getStatusKey(l)).length;
  const yesCount   = listings.filter(l => l.clientResponse === 'yes' || getStatusKey(l)).length;
  const noCount    = listings.filter(l => l.clientResponse === 'no'  && !getStatusKey(l)).length;
  const viewings   = listings.filter(l => l.status === 'viewing').length;

  const filtered = listings.filter(l => {
    if (filter === 'new') return !l.clientResponse && !getStatusKey(l);
    if (filter === 'yes') return l.clientResponse === 'yes' || getStatusKey(l);
    if (filter === 'no')  return l.clientResponse === 'no'  && !getStatusKey(l);
    return true;
  });

  if (loading) return <div className="loading-screen">Loading your listings...</div>;

  const FILTERS = [
    { key: 'all', label: `All (${listings.length})` },
    { key: 'new', label: `New (${newCount})`, dot: newCount > 0 },
    { key: 'yes', label: `Interested (${yesCount})` },
    { key: 'no',  label: `Passed (${noCount})` },
  ];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Your listings</div>
          <div className="page-sub">Properties matched to your search profile</div>
        </div>
      </div>

      {/* Stats row */}
      <div className="stat-row" style={{ marginBottom: 20 }}>
        <div className="stat"><div className="stat-label">Properties found</div><div className="stat-val">{listings.length}</div></div>
        <div className="stat"><div className="stat-label">Awaiting response</div><div className="stat-val" style={{ color: newCount > 0 ? 'var(--gold-dark)' : undefined }}>{newCount}</div></div>
        <div className="stat"><div className="stat-label">Want to view</div><div className="stat-val gold">{yesCount}</div></div>
        <div className="stat"><div className="stat-label">Viewings booked</div><div className="stat-val">{viewings}</div></div>
      </div>

      {/* Filter tabs */}
      <div style={{ display:'flex',gap:4,marginBottom:20,background:'var(--card-bg)',borderRadius:10,padding:4,overflowX:'auto' }}>
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={{ flex:1,padding:'8px 14px',borderRadius:7,fontSize:13,fontWeight:500,cursor:'pointer',border:'none',fontFamily:"'DM Sans',sans-serif",background:filter===f.key?'var(--near-black)':'transparent',color:filter===f.key?'var(--gold-bg)':'var(--text-muted)',transition:'all 0.15s',whiteSpace:'nowrap',position:'relative' }}>
            {f.label}
            {f.dot && filter !== f.key && <span style={{ position:'absolute',top:6,right:6,width:6,height:6,borderRadius:'50%',background:'var(--gold)' }}/>}
          </button>
        ))}
      </div>

      {/* Listings */}
      {listings.length === 0 ? (
        <div className="card" style={{ textAlign:'center',padding:'48px 24px',color:'var(--text-muted)' }}>
          <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:22,marginBottom:10 }}>No listings yet</div>
          <div style={{ fontSize:14 }}>Your agent is actively searching. You'll receive an email as soon as new properties are shared with you.</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign:'center',padding:32,color:'var(--text-muted)',fontSize:14 }}>
          No listings in this category yet.
        </div>
      ) : (
        <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
          {filtered.map((l, i) => (
            <ListingCard key={l.id} listing={l} onResponse={handleResponse} rank={i + 1}/>
          ))}
        </div>
      )}

      {modalListing && (
        <NoFeedbackModal
          listing={modalListing}
          onSubmit={reasons => submitResponse(modalListing, 'no', reasons)}
          onClose={() => setModalListing(null)}
        />
      )}
    </div>
  );
}
