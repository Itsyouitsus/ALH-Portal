import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { db } from '../firebase';
import {
  collection, query, where, getDocs, doc, updateDoc, addDoc, serverTimestamp
} from 'firebase/firestore';

const NO_REASONS = [
  'Too expensive', 'Too small', 'Wrong area', 'Wrong furnishing',
  'Too few bedrooms', 'Too many bedrooms', 'Not available in time',
  'Ground floor', 'No outdoor space', 'Other'
];

const HouseIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#c9a96e" strokeWidth="1.5">
    <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/>
    <path d="M9 21V12h6v9"/>
  </svg>
);

function NoFeedbackModal({ listing, onSubmit, onClose }) {
  const [selected, setSelected] = useState([]);
  const [other, setOther] = useState('');

  const toggle = (r) => setSelected(s => s.includes(r) ? s.filter(x => x !== r) : [...s, r]);

  const handleSubmit = () => {
    const reasons = [...selected, ...(other ? [other] : [])];
    if (reasons.length === 0) return;
    onSubmit(reasons);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(26,22,18,0.6)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      zIndex: 500, padding: '0 0 0 0',
    }} onClick={onClose}>
      <div
        style={{
          background: 'var(--gold-bg)', borderRadius: '20px 20px 0 0',
          padding: '28px 24px 40px', width: '100%', maxWidth: 540,
          maxHeight: '80vh', overflowY: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ width: 36, height: 4, background: 'var(--gold-mid)', borderRadius: 2, margin: '0 auto 20px' }} />
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Why not this one?</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
          {listing.address} — select all that apply
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {NO_REASONS.filter(r => r !== 'Other').map(r => (
            <button
              key={r}
              onClick={() => toggle(r)}
              style={{
                padding: '7px 14px', borderRadius: 20, border: '1.5px solid',
                borderColor: selected.includes(r) ? 'var(--near-black)' : 'var(--gold-mid)',
                background: selected.includes(r) ? 'var(--near-black)' : 'var(--gold-bg)',
                color: selected.includes(r) ? 'var(--gold-bg)' : 'var(--text-muted)',
                fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                transition: 'all 0.12s',
              }}
            >
              {r}
            </button>
          ))}
        </div>
        {selected.includes('Other') || true ? (
          <div className="field">
            <label>Additional note (optional)</label>
            <input type="text" value={other} onChange={e => setOther(e.target.value)} placeholder="e.g. street is too noisy" />
          </div>
        ) : null}
        <button
          className="btn-primary"
          style={{ width: '100%', marginTop: 20, padding: '13px', fontSize: 15 }}
          onClick={handleSubmit}
          disabled={selected.length === 0 && !other}
        >
          Submit feedback
        </button>
      </div>
    </div>
  );
}

function ListingCard({ listing, onResponse, isMobile }) {
  const [swiping, setSwiping] = useState(false);
  const [swipeX, setSwipeX] = useState(0);
  const startX = useRef(null);
  const cardRef = useRef(null);

  const statusClass = listing.status === 'viewing' ? 'pill-viewing'
    : listing.clientResponse === 'yes' ? 'pill-want'
    : listing.clientResponse === 'no' ? 'pill-pass'
    : 'pill-new';

  const statusLabel = listing.status === 'viewing' ? 'Viewing scheduled'
    : listing.clientResponse === 'yes' ? 'Want to view'
    : listing.clientResponse === 'no' ? 'Not interested'
    : 'New';

  const borderColor = listing.clientResponse === 'yes' ? 'var(--success)'
    : listing.clientResponse === 'no' ? 'var(--danger)'
    : listing.status === 'viewing' ? 'var(--blue)'
    : 'transparent';

  const handleTouchStart = (e) => {
    startX.current = e.touches[0].clientX;
    setSwiping(true);
  };
  const handleTouchMove = (e) => {
    if (startX.current === null) return;
    setSwipeX(e.touches[0].clientX - startX.current);
  };
  const handleTouchEnd = () => {
    if (swipeX > 60) onResponse(listing, 'yes');
    else if (swipeX < -60) onResponse(listing, 'no');
    setSwipeX(0);
    setSwiping(false);
    startX.current = null;
  };

  const swipeOpacity = Math.min(Math.abs(swipeX) / 80, 1);
  const isYes = swipeX > 20;
  const isNo = swipeX < -20;

  return (
    <div
      ref={cardRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        background: 'var(--card-bg)',
        borderRadius: 14,
        padding: isMobile ? '18px 16px' : '20px 24px',
        borderLeft: `4px solid ${borderColor}`,
        transform: `translateX(${swipeX * 0.3}px)`,
        transition: swiping ? 'none' : 'transform 0.3s ease, background 0.15s',
        position: 'relative',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* Swipe hint overlays */}
      {swipeX !== 0 && (
        <>
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: '100%',
            background: `rgba(45,122,79,${isYes ? swipeOpacity * 0.15 : 0})`,
            display: 'flex', alignItems: 'center', paddingLeft: 20,
            pointerEvents: 'none',
          }}>
            {isYes && <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--success)', opacity: swipeOpacity }}>YES</div>}
          </div>
          <div style={{
            position: 'absolute', right: 0, top: 0, bottom: 0, width: '100%',
            background: `rgba(163,45,45,${isNo ? swipeOpacity * 0.15 : 0})`,
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 20,
            pointerEvents: 'none',
          }}>
            {isNo && <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--danger)', opacity: swipeOpacity }}>NO</div>}
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <div style={{
          width: isMobile ? 56 : 68, height: isMobile ? 48 : 56,
          background: 'var(--gold-card)', borderRadius: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <HouseIcon />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: isMobile ? 14 : 15, fontWeight: 700, color: 'var(--near-black)' }}>
            {listing.address}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {[listing.area, listing.size, listing.beds && `${listing.beds} bed`, listing.furnishing, listing.availableFrom]
              .filter(Boolean).join(' · ')}
            {listing.serviceCosts > 0 && ` · +€${listing.serviceCosts} service costs`}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {[listing.area, listing.furnishing].filter(Boolean).map(t => (
              <span key={t} style={{ fontSize: 11, fontWeight: 500, padding: '3px 9px', borderRadius: 20, background: 'var(--gold-bg)', color: 'var(--gold-dark)' }}>{t}</span>
            ))}
            <span className={`pill ${statusClass}`}>{statusLabel}</span>
          </div>
          {listing.noReasons?.length > 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
              Feedback: {listing.noReasons.join(', ')}
            </div>
          )}
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: isMobile ? 16 : 18, fontWeight: 700, color: 'var(--near-black)' }}>
            €{listing.price?.toLocaleString()}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>per month</div>
          {!isMobile && listing.status !== 'viewing' && (
            <div style={{ display: 'flex', gap: 6, marginTop: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => onResponse(listing, 'yes')}
                title="I want to view this"
                style={{
                  width: 36, height: 36, borderRadius: 8, border: '1.5px solid',
                  borderColor: listing.clientResponse === 'yes' ? 'var(--success)' : 'var(--gold-mid)',
                  background: listing.clientResponse === 'yes' ? 'var(--success-bg)' : 'var(--gold-bg)',
                  cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >✓</button>
              <button
                onClick={() => onResponse(listing, 'no')}
                title="Not for me"
                style={{
                  width: 36, height: 36, borderRadius: 8, border: '1.5px solid',
                  borderColor: listing.clientResponse === 'no' ? 'var(--danger)' : 'var(--gold-mid)',
                  background: listing.clientResponse === 'no' ? 'var(--danger-bg)' : 'var(--gold-bg)',
                  cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >✕</button>
            </div>
          )}
        </div>
      </div>

      {isMobile && listing.status !== 'viewing' && !listing.clientResponse && (
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button
            onClick={() => onResponse(listing, 'yes')}
            style={{
              flex: 1, padding: '11px', borderRadius: 10, border: '1.5px solid var(--success)',
              background: 'var(--success-bg)', color: 'var(--success)', fontSize: 14, fontWeight: 600,
              cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
            }}
          >
            ✓ Yes, I want to view
          </button>
          <button
            onClick={() => onResponse(listing, 'no')}
            style={{
              flex: 1, padding: '11px', borderRadius: 10, border: '1.5px solid var(--danger)',
              background: 'var(--danger-bg)', color: 'var(--danger)', fontSize: 14, fontWeight: 600,
              cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
            }}
          >
            ✕ Not for me
          </button>
        </div>
      )}
      {isMobile && !listing.clientResponse && (
        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-light)', marginTop: 10 }}>
          Or swipe right for yes, left for no
        </div>
      )}
    </div>
  );
}

export default function Listings() {
  const { user } = useAuth();
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalListing, setModalListing] = useState(null);
  const [pendingResponse, setPendingResponse] = useState(null);
  const isMobile = window.innerWidth < 640;

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const snap = await getDocs(query(collection(db, 'listings'), where('clientId', '==', user.uid)));
      setListings(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    };
    fetch();
  }, [user]);

  const handleResponse = (listing, response) => {
    if (listing.status === 'viewing') return;
    if (response === 'no') {
      setModalListing(listing);
      setPendingResponse('no');
    } else {
      submitResponse(listing, 'yes', []);
    }
  };

  const submitResponse = async (listing, response, reasons) => {
    const ref = doc(db, 'listings', listing.id);
    const update = {
      clientResponse: response,
      noReasons: reasons,
      respondedAt: serverTimestamp(),
    };
    await updateDoc(ref, update);
    setListings(ls => ls.map(l => l.id === listing.id ? { ...l, ...update } : l));
    setModalListing(null);
    setPendingResponse(null);
  };

  const want = listings.filter(l => l.clientResponse === 'yes').length;
  const viewings = listings.filter(l => l.status === 'viewing').length;

  if (loading) return <div className="loading-screen">Loading your listings...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Your listings</div>
          <div className="page-sub">Properties matched to your search profile</div>
        </div>
      </div>

      <div className="stat-row">
        <div className="stat"><div className="stat-label">Properties found</div><div className="stat-val">{listings.length}</div></div>
        <div className="stat"><div className="stat-label">Want to view</div><div className="stat-val gold">{want}</div></div>
        <div className="stat"><div className="stat-label">Viewings booked</div><div className="stat-val">{viewings}</div></div>
        <div className="stat"><div className="stat-label">Responded</div><div className="stat-val">{listings.filter(l => l.clientResponse).length}</div></div>
      </div>

      {listings.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, marginBottom: 10 }}>No listings yet</div>
          <div style={{ fontSize: 14 }}>Your agent is actively searching. You will receive an email as soon as new properties are shared with you.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {listings.map(l => (
            <ListingCard key={l.id} listing={l} onResponse={handleResponse} isMobile={isMobile} />
          ))}
        </div>
      )}

      {modalListing && (
        <NoFeedbackModal
          listing={modalListing}
          onSubmit={(reasons) => submitResponse(modalListing, 'no', reasons)}
          onClose={() => { setModalListing(null); setPendingResponse(null); }}
        />
      )}
    </div>
  );
}
