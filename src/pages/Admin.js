import React, { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { db } from '../firebase';
import {
  collection, getDocs, query, where, doc, setDoc,
  addDoc, updateDoc, serverTimestamp, orderBy
} from 'firebase/firestore';
import { sendSignInLinkToEmail } from 'firebase/auth';
import { auth } from '../firebase';

const ACTION_CODE = { url: window.location.origin + '/login', handleCodeInApp: true };

function NewClientModal({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!name || !email) return;
    setSaving(true);
    try {
      const clientRef = doc(collection(db, 'pendingClients'));
      await setDoc(clientRef, {
        name, email, role: 'client', createdAt: serverTimestamp(), searchStarted: new Date().toISOString().split('T')[0],
      });
      await sendSignInLinkToEmail(auth, email, ACTION_CODE);
      onCreated({ name, email });
      onClose();
    } catch (err) {
      alert('Error: ' + err.message);
    }
    setSaving(false);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(26,22,18,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: 24,
    }} onClick={onClose}>
      <div style={{ background: 'var(--gold-bg)', borderRadius: 16, padding: '32px 28px', width: '100%', maxWidth: 440 }}
           onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>Add new client</div>
        <div className="field"><label>Full name</label><input value={name} onChange={e => setName(e.target.value)} placeholder="Sarah & James Collins"/></div>
        <div className="field"><label>Email address</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="client@example.com"/></div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>
          We will send them a magic link invite automatically.
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-ghost" onClick={onClose} style={{ flex: 1 }}>Cancel</button>
          <button className="btn-primary" onClick={handleCreate} disabled={!name || !email || saving} style={{ flex: 1 }}>
            {saving ? 'Creating...' : 'Create & invite'}
          </button>
        </div>
      </div>
    </div>
  );
}

function NewListingModal({ clients, onClose, onCreated }) {
  const [form, setForm] = useState({
    address: '', area: '', city: 'Amsterdam', price: '', serviceCosts: '',
    size: '', beds: '', furnishing: 'Furnished', availableFrom: '',
    energyLabel: '', floor: '', elevator: '', deposit: '', minPeriod: '',
    notes: '',
  });
  const [selectedClients, setSelectedClients] = useState([]);
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleClient = (id) => setSelectedClients(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  const handleCreate = async () => {
    if (!form.address || !form.price || selectedClients.length === 0) return;
    setSaving(true);
    try {
      for (const clientId of selectedClients) {
        await addDoc(collection(db, 'listings'), {
          ...form, price: parseInt(form.price), serviceCosts: parseInt(form.serviceCosts) || 0,
          beds: parseInt(form.beds) || null, clientId,
          status: 'new', clientResponse: null, noReasons: [],
          createdAt: serverTimestamp(),
        });
      }
      onCreated();
      onClose();
    } catch (err) {
      alert('Error: ' + err.message);
    }
    setSaving(false);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(26,22,18,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: 24,
      overflowY: 'auto',
    }} onClick={onClose}>
      <div style={{ background: 'var(--gold-bg)', borderRadius: 16, padding: '32px 28px', width: '100%', maxWidth: 560, margin: 'auto' }}
           onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>Add & push listing</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="field" style={{ gridColumn: '1/-1' }}><label>Address</label><input value={form.address} onChange={e => set('address', e.target.value)} placeholder="Keizersgracht 142"/></div>
          <div className="field"><label>Neighbourhood</label><input value={form.area} onChange={e => set('area', e.target.value)} placeholder="Canal Ring"/></div>
          <div className="field"><label>City</label><input value={form.city} onChange={e => set('city', e.target.value)}/></div>
          <div className="field"><label>Rent (€/month)</label><input type="number" value={form.price} onChange={e => set('price', e.target.value)} placeholder="2950"/></div>
          <div className="field"><label>Service costs (€)</label><input type="number" value={form.serviceCosts} onChange={e => set('serviceCosts', e.target.value)} placeholder="0"/></div>
          <div className="field"><label>Deposit (€)</label><input type="number" value={form.deposit} onChange={e => set('deposit', e.target.value)} placeholder="5900"/></div>
          <div className="field"><label>Size (m²)</label><input value={form.size} onChange={e => set('size', e.target.value)} placeholder="85 m²"/></div>
          <div className="field"><label>Bedrooms</label><input type="number" value={form.beds} onChange={e => set('beds', e.target.value)} placeholder="2"/></div>
          <div className="field"><label>Furnishing</label>
            <select value={form.furnishing} onChange={e => set('furnishing', e.target.value)}>
              {['Furnished', 'Unfurnished', 'Shell'].map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div className="field"><label>Available from</label><input value={form.availableFrom} onChange={e => set('availableFrom', e.target.value)} placeholder="Immediately / 1 May"/></div>
          <div className="field"><label>Energy label</label><input value={form.energyLabel} onChange={e => set('energyLabel', e.target.value)} placeholder="A"/></div>
          <div className="field"><label>Floor</label><input value={form.floor} onChange={e => set('floor', e.target.value)} placeholder="3rd floor"/></div>
          <div className="field"><label>Min. rental period</label><input value={form.minPeriod} onChange={e => set('minPeriod', e.target.value)} placeholder="12 months"/></div>
          <div className="field"><label>Elevator</label>
            <select value={form.elevator} onChange={e => set('elevator', e.target.value)}>
              <option value="">Unknown</option><option>Yes</option><option>No</option>
            </select>
          </div>
          <div className="field" style={{ gridColumn: '1/-1' }}><label>Notes for client</label><textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Any extra context..." style={{ width: '100%', background: 'var(--gold-bg)', border: '1px solid var(--gold-mid)', borderRadius: 7, padding: '9px 12px', fontSize: 13, resize: 'vertical', minHeight: 60, fontFamily: "'DM Sans', sans-serif" }}/></div>
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Push to clients (select at least one)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {clients.map(c => (
              <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '8px 12px', borderRadius: 8, background: selectedClients.includes(c.id) ? 'var(--gold-card)' : 'var(--card-bg)', border: `1px solid ${selectedClients.includes(c.id) ? 'var(--gold)' : 'transparent'}`, transition: 'all 0.12s' }}>
                <input type="checkbox" checked={selectedClients.includes(c.id)} onChange={() => toggleClient(c.id)} style={{ accentColor: 'var(--near-black)', width: 16, height: 16 }}/>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.email} · Budget {c.maxRent || '?'}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
          <button className="btn-ghost" onClick={onClose} style={{ flex: 1 }}>Cancel</button>
          <button className="btn-primary" onClick={handleCreate} disabled={!form.address || !form.price || selectedClients.length === 0 || saving} style={{ flex: 1 }}>
            {saving ? 'Pushing...' : `Push to ${selectedClients.length} client${selectedClients.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Admin() {
  const { profile } = useAuth();
  const [tab, setTab] = useState('clients');
  const [clients, setClients] = useState([]);
  const [listings, setListings] = useState([]);
  const [showNewClient, setShowNewClient] = useState(false);
  const [showNewListing, setShowNewListing] = useState(false);
  const [loading, setLoading] = useState(true);

  if (profile?.role !== 'admin') {
    return <div className="page"><div className="page-title">Access denied</div></div>;
  }

  const fetchAll = async () => {
    const [uSnap, lSnap] = await Promise.all([
      getDocs(collection(db, 'users')),
      getDocs(query(collection(db, 'listings'), orderBy('createdAt', 'desc'))),
    ]);
    const allUsers = uSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.role !== 'admin');
    const allListings = lSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const clientsWithStats = allUsers.map(u => {
      const uListings = allListings.filter(l => l.clientId === u.id);
      return {
        ...u,
        listingsCount: uListings.length,
        wantCount: uListings.filter(l => l.clientResponse === 'yes').length,
        viewingCount: uListings.filter(l => l.status === 'viewing').length,
      };
    });
    setClients(clientsWithStats);
    setListings(allListings);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const updateListingStatus = async (id, status) => {
    await updateDoc(doc(db, 'listings', id), { status });
    setListings(ls => ls.map(l => l.id === id ? { ...l, status } : l));
  };

  if (loading) return <div className="loading-screen">Loading admin panel...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Admin panel</div>
          <div className="page-sub">{clients.length} active clients · {listings.length} total listings</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-ghost" onClick={() => setShowNewClient(true)}>+ Add client</button>
          <button className="btn-primary" onClick={() => setShowNewListing(true)}>+ Push listing</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--card-bg)', borderRadius: 10, padding: 4, maxWidth: 400 }}>
        {[['clients', 'Active clients'], ['listings', 'All listings']].map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)} style={{
            flex: 1, padding: '9px 16px', borderRadius: 7, fontSize: 13, fontWeight: 500,
            cursor: 'pointer', border: 'none', fontFamily: "'DM Sans', sans-serif",
            background: tab === v ? 'var(--near-black)' : 'transparent',
            color: tab === v ? 'var(--gold-bg)' : 'var(--text-muted)',
            transition: 'all 0.15s',
          }}>{l}</button>
        ))}
      </div>

      {tab === 'clients' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {clients.length === 0 && (
            <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
              No clients yet. Add your first client above.
            </div>
          )}
          {clients.map(c => (
            <div key={c.id} style={{
              display: 'flex', alignItems: 'center', gap: 16,
              background: 'var(--card-bg)', borderRadius: 12, padding: '16px 20px',
              borderLeft: '4px solid var(--gold)',
            }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--gold)', color: 'var(--gold-deeper)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                {c.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{c.name || c.email}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
                  {c.email}
                  {c.maxRent && ` · Budget ${c.maxRent}`}
                  {c.searchStarted && ` · Started ${c.searchStarted}`}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 20 }}>
                {[
                  [c.listingsCount || 0, 'Found'],
                  [c.wantCount || 0, 'Want'],
                  [c.viewingCount || 0, 'Viewing'],
                ].map(([val, label]) => (
                  <div key={label} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: label === 'Want' ? 'var(--success)' : label === 'Viewing' ? 'var(--blue)' : 'var(--near-black)' }}>{val}</div>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>{label}</div>
                  </div>
                ))}
              </div>
              <button className="btn-ghost" style={{ fontSize: 12 }}>Open portal</button>
            </div>
          ))}
        </div>
      )}

      {tab === 'listings' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {listings.length === 0 && (
            <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
              No listings pushed yet.
            </div>
          )}
          {listings.map(l => {
            const client = clients.find(c => c.id === l.clientId);
            const statusClass = l.status === 'viewing' ? 'pill-viewing' : l.clientResponse === 'yes' ? 'pill-want' : l.clientResponse === 'no' ? 'pill-pass' : 'pill-new';
            const statusLabel = l.status === 'viewing' ? 'Viewing scheduled' : l.clientResponse === 'yes' ? 'Client wants to view' : l.clientResponse === 'no' ? 'Not interested' : 'Awaiting response';
            return (
              <div key={l.id} style={{ background: 'var(--card-bg)', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{l.address}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {[l.area, l.size, l.beds && `${l.beds} beds`, l.furnishing, l.availableFrom].filter(Boolean).join(' · ')}
                    {l.price && ` · €${l.price.toLocaleString()}/mo`}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    Client: <strong>{client?.name || l.clientId}</strong>
                    {l.noReasons?.length > 0 && ` · Feedback: ${l.noReasons.join(', ')}`}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                  <span className={`pill ${statusClass}`}>{statusLabel}</span>
                  {l.clientResponse === 'yes' && l.status !== 'viewing' && (
                    <button className="btn-primary" style={{ fontSize: 11, padding: '5px 12px' }} onClick={() => updateListingStatus(l.id, 'viewing')}>
                      Schedule viewing
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showNewClient && <NewClientModal onClose={() => setShowNewClient(false)} onCreated={fetchAll} />}
      {showNewListing && <NewListingModal clients={clients} onClose={() => setShowNewListing(false)} onCreated={fetchAll} />}
    </div>
  );
}
