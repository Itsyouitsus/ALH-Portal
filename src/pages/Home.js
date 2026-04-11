import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { db } from '../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

const PIPELINE_STAGES = [
  'Onboarding', 'Documents', 'Searching', 'Offer', 'Signed',
  'Utilities done', 'Checked in', 'Left review',
];

const STAGE_INFO = {
  'Onboarding': {
    desc: 'We are getting to know you and setting up your search profile.',
    next: 'Complete your profile so we can start searching for the perfect home.',
    action: { label: 'Complete my profile', to: '/profile' },
    color: '#1a56c4', bg: '#e8f0fe',
  },
  'Documents': {
    desc: 'We need your documents before we can make offers on your behalf.',
    next: 'Upload the required documents so we can act fast when we find the right property.',
    action: { label: 'Go to documents', to: '/documents' },
    color: '#856404', bg: '#fff3cd',
  },
  'Searching': {
    desc: 'We are actively searching for properties that match your profile.',
    next: 'Review the listings we share with you and tell us which ones you want to view.',
    action: { label: 'View my listings', to: '/listings' },
    color: '#1a7a3c', bg: '#d4edda',
  },
  'Offer': {
    desc: 'We are in the process of making or negotiating an offer.',
    next: 'We will keep you updated on the status of the offer. Stay close to your phone.',
    action: { label: 'View my listings', to: '/listings' },
    color: '#a06b1a', bg: '#fdf3e2',
  },
  'Signed': {
    desc: 'Congratulations! Your lease has been signed.',
    next: 'Make sure your utilities are set up before you move in.',
    action: { label: 'View my listings', to: '/listings' },
    color: '#1a7a3c', bg: '#d4edda',
  },
  'Utilities done': {
    desc: 'Utilities are arranged. Almost there!',
    next: 'Prepare for your move-in. We will check in with you shortly.',
    action: null,
    color: '#8a6d3b', bg: '#f5edd9',
  },
  'Checked in': {
    desc: 'You have moved in — welcome to your new Amsterdam home!',
    next: 'Enjoy your new home. Please leave us a review if you are happy with our service.',
    action: null,
    color: '#1a7a3c', bg: '#d4edda',
  },
  'Left review': {
    desc: 'Thank you for working with Amsterdam Life Homes.',
    next: 'We hope to help you again in the future. Enjoy Amsterdam!',
    action: null,
    color: 'var(--text-muted)', bg: 'var(--card-bg)',
  },
};

export default function Home() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ found: 0, want: 0, viewings: 0, docsReady: 0 });
  const [newListings, setNewListings] = useState(0);

  const firstName = profile?.name?.split(' ')[0] || 'there';
  const stage = profile?.pipelineStage || 'Onboarding';
  const stageIdx = PIPELINE_STAGES.indexOf(stage);
  const stageInfo = STAGE_INFO[stage] || STAGE_INFO['Onboarding'];

  useEffect(() => {
    if (!user) return;
    Promise.all([
      getDocs(query(collection(db, 'listings'), where('clientId', '==', user.uid))),
      getDocs(query(collection(db, 'documents'), where('clientId', '==', user.uid))),
    ]).then(([lSnap, dSnap]) => {
      const listings = lSnap.docs.map(d => d.data());
      const want = listings.filter(l => l.clientResponse === 'yes').length;
      const viewings = listings.filter(l => (l.status || '').toLowerCase().includes('viewing')).length;
      const unresponded = listings.filter(l => !l.clientResponse && !(l.status || '')).length;
      const docsReady = dSnap.docs.filter(d => d.data().ready).length;
      setStats({ found: listings.length, want, viewings, docsReady });
      setNewListings(unresponded);
    });
  }, [user]);

  const navCards = [
    {
      title: 'Your listings',
      desc: newListings > 0 ? `${newListings} new ${newListings === 1 ? 'property' : 'properties'} waiting for your response.` : `${stats.found} properties found · ${stats.want} interested.`,
      to: '/listings',
      badge: newListings > 0 ? `${newListings} new` : null,
    },
    {
      title: 'Documents',
      desc: `${stats.docsReady} documents marked ready. Upload what's still missing.`,
      to: '/documents',
    },
    {
      title: 'My profile',
      desc: 'Your search preferences, budget, lifestyle and employment details.',
      to: '/profile',
    },
  ];

  return (
    <div className="page">
      {/* Welcome */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 500, color: 'var(--near-black)', lineHeight: 1.1, marginBottom: 6 }}>
          Welcome back, {firstName}
        </h1>
        <p style={{ fontSize: 15, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          {stats.found > 0
            ? `We have found ${stats.found} ${stats.found === 1 ? 'property' : 'properties'} for you.${stats.viewings > 0 ? ` You have ${stats.viewings} viewing${stats.viewings > 1 ? 's' : ''} scheduled.` : ''}`
            : 'Your search is underway. We will share properties as soon as we find matches.'}
        </p>
      </div>

      {/* Pipeline progress */}
      <div style={{ background: stageInfo.bg, border: `1px solid ${stageInfo.color}22`, borderLeft: `4px solid ${stageInfo.color}`, borderRadius: 14, padding: '20px 24px', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: stageInfo.color, marginBottom: 4 }}>Your current stage</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--near-black)', marginBottom: 8 }}>{stage}</div>
            <div style={{ fontSize: 14, color: 'var(--near-black)', lineHeight: 1.5, marginBottom: 8 }}>{stageInfo.desc}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              <strong>Next step:</strong> {stageInfo.next}
            </div>
            {stageInfo.action && (
              <button onClick={() => navigate(stageInfo.action.to)} className="btn-primary" style={{ marginTop: 14, fontSize: 13, padding: '10px 20px' }}>
                {stageInfo.action.label} →
              </button>
            )}
          </div>
          {/* Progress dots */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 160 }}>
            {PIPELINE_STAGES.map((s, i) => (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: i < stageIdx ? stageInfo.color : i === stageIdx ? stageInfo.color : 'var(--gold-mid)',
                  opacity: i > stageIdx ? 0.35 : 1,
                }} />
                <div style={{ fontSize: 12, fontWeight: i === stageIdx ? 700 : 400, color: i === stageIdx ? 'var(--near-black)' : i < stageIdx ? 'var(--text-muted)' : 'var(--text-light)' }}>
                  {s}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="stat-row" style={{ marginBottom: 24 }}>
        <div className="stat"><div className="stat-label">Properties found</div><div className="stat-val">{stats.found}</div></div>
        <div className="stat"><div className="stat-label">Awaiting response</div><div className="stat-val" style={{ color: newListings > 0 ? 'var(--gold-dark)' : undefined }}>{newListings}</div></div>
        <div className="stat"><div className="stat-label">Interested</div><div className="stat-val gold">{stats.want}</div></div>
        <div className="stat"><div className="stat-label">Viewings</div><div className="stat-val">{stats.viewings}</div></div>
      </div>

      {/* Nav cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
        {navCards.map((card, i) => (
          <div key={i} onClick={() => navigate(card.to)} style={{ background: 'var(--card-bg)', borderRadius: 14, padding: '20px 22px', cursor: 'pointer', borderLeft: '4px solid var(--gold)', position: 'relative', transition: 'background 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--gold-card)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--card-bg)'}
          >
            {card.badge && (
              <span style={{ position: 'absolute', top: 14, right: 14, fontSize: 10, fontWeight: 700, background: 'var(--gold)', color: 'var(--near-black)', padding: '2px 8px', borderRadius: 20 }}>{card.badge}</span>
            )}
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--near-black)', marginBottom: 6 }}>{card.title}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>{card.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
