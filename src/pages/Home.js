import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { db } from '../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

export default function Home() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ found: 0, want: 0, viewings: 0, docsUploaded: 0, docsTotal: 12 });
  const [nextViewing, setNextViewing] = useState(null);

  const firstName = profile?.name?.split(' ')[0] || profile?.name || 'there';

  useEffect(() => {
    if (!user) return;
    const fetchStats = async () => {
      const lSnap = await getDocs(query(collection(db, 'listings'), where('clientId', '==', user.uid)));
      const listings = lSnap.docs.map(d => d.data());
      const want = listings.filter(l => l.clientResponse === 'yes').length;
      const viewings = listings.filter(l => l.status === 'viewing').length;
      const viewing = listings.find(l => l.viewingDate);
      if (viewing) setNextViewing(viewing);
      const dSnap = await getDocs(query(collection(db, 'documents'), where('clientId', '==', user.uid)));
      const uploaded = dSnap.docs.filter(d => d.data().uploaded).length;
      setStats({ found: listings.length, want, viewings, docsUploaded: uploaded, docsTotal: 12 });
    };
    fetchStats();
  }, [user]);

  const cards = [
    {
      title: 'Listings',
      desc: 'Browse properties we found for you. Tell us if you want to view.',
      to: '/listings',
      accent: false,
    },
    {
      title: 'Documents',
      desc: `${stats.docsUploaded} of ${stats.docsTotal} documents uploaded. Upload what's still missing.`,
      to: '/documents',
      accent: false,
    },
    {
      title: 'My profile',
      desc: 'Your search preferences, budget, lifestyle and employment details.',
      to: '/profile',
      accent: false,
    },
    nextViewing
      ? {
          title: 'Upcoming viewing',
          desc: `${nextViewing.address} · ${nextViewing.viewingDate} · Confirmed`,
          to: '/listings',
          accent: true,
          accentColor: 'var(--success)',
          accentBg: 'var(--success-bg)',
          textColor: '#1a4a2e',
        }
      : {
          title: `${stats.found} properties found`,
          desc: stats.want > 0
            ? `You want to view ${stats.want} of them. We are working on scheduling.`
            : 'Review your listings and tell us which ones you want to view.',
          to: '/listings',
          accent: false,
        },
  ];

  return (
    <div className="page">
      <div style={{ textAlign: 'center', padding: '56px 0 48px' }}>
        <h1 style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: 'clamp(40px, 8vw, 70px)',
          fontWeight: 500,
          color: 'var(--near-black)',
          lineHeight: 1.05,
          letterSpacing: '-0.01em',
        }}>
          Amsterdam Life Homes
        </h1>
        <p style={{ fontSize: 16, color: 'var(--text-muted)', marginTop: 14, lineHeight: 1.6 }}>
          Your personal housing search portal. Everything in one place.
        </p>
      </div>

      <div style={{ maxWidth: 680 }}>
        <h2 style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: 26,
          fontWeight: 500,
          marginBottom: 8,
        }}>
          Welcome back, {firstName}
        </h2>
        <p style={{ fontSize: 15, color: 'var(--text-muted)', marginBottom: 32, lineHeight: 1.6 }}>
          We have found {stats.found} {stats.found === 1 ? 'property' : 'properties'} matching your profile.
          {stats.viewings > 0 && ` You have ${stats.viewings} viewing${stats.viewings > 1 ? 's' : ''} scheduled.`}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {cards.map((card, i) => (
            <div
              key={i}
              onClick={() => navigate(card.to)}
              style={{
                background: card.accentBg || 'var(--card-bg)',
                borderRadius: 14,
                padding: '22px 24px',
                cursor: 'pointer',
                borderLeft: `4px solid ${card.accentColor || 'var(--gold)'}`,
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { if (!card.accentBg) e.currentTarget.style.background = 'var(--gold-card)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = card.accentBg || 'var(--card-bg)'; }}
            >
              <div style={{
                fontSize: 16,
                fontWeight: 700,
                color: card.textColor || 'var(--near-black)',
                marginBottom: 7,
              }}>
                {card.title}
              </div>
              <div style={{
                fontSize: 13,
                color: card.textColor || 'var(--text-muted)',
                lineHeight: 1.5,
              }}>
                {card.desc}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
