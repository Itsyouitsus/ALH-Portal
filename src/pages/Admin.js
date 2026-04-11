import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { db } from '../firebase';
import {
  collection, getDocs, doc, setDoc, addDoc, updateDoc, deleteDoc,
  serverTimestamp, orderBy, query, where
} from 'firebase/firestore';

const WORKER_URL = 'https://alh-email-worker.home-f67.workers.dev/';

async function geocodeAddress(address) {
  try {
    const res = await fetch(WORKER_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'geocode', address }),
    });
    const data = await res.json();
    return { lat: data.lat || null, lng: data.lng || null };
  } catch { return { lat: null, lng: null }; }
}

async function generateMagicLink(email) {
  const res = await fetch(WORKER_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, isInvite: true, linkOnly: true }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to generate link');
  return data.link || null;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const PIPELINE_STAGES = [
  'Onboarding', 'Documents', 'Searching', 'Offer', 'Signed',
  'Utilities done', 'Checked in', 'Left review',
];

const LISTING_STATUSES = [
  { value: '', label: '— Empty' },
  { value: 'Work in progress', label: 'Work in progress' },
  { value: 'viewing', label: 'Viewing scheduled…', needsDatetime: true },
  { value: 'Making offer', label: 'Making offer' },
  { value: 'Offer made', label: 'Offer made' },
  { value: 'Offer not accepted', label: 'Offer not accepted' },
  { value: 'Rented out', label: 'Rented out' },
  { value: 'Offer accepted!', label: 'Offer accepted! 🎉' },
];

const CHIP_OPTS = {
  bedrooms: ['Studio', '1', '2', '3', '4+'],
  furnishing: ['Furnished', 'Unfurnished', 'Shell'],
  homeType: ['Apartment', 'House', 'Studio', 'Townhouse'],
  outdoor: ['Balcony', 'Garden', 'Rooftop', 'Not needed'],
  parking: ['Yes', 'No'],
};

const DOCUMENT_TYPES = [
  { id: 'passport', name: 'Copy of passport(s)' },
  { id: 'contract', name: 'Employment contract' },
  { id: 'intro_letter', name: 'Introduction letter + photo' },
  { id: 'extend_letter', name: "Employer's letter of intent to extend" },
  { id: 'employer_statement', name: "Employer's statement" },
  { id: 'payslips', name: 'Last 3 payslips' },
  { id: 'bank_salary', name: 'Bank statement showing salary' },
  { id: 'work_permit', name: 'Work permit or employer permission' },
  { id: 'tax_ruling', name: '30% tax ruling approval' },
  { id: 'brp', name: 'BRP registration' },
  { id: 'hr_contact', name: 'HR contact details' },
  { id: 'address', name: 'Current full home address' },
  { id: 'bank_card', name: 'Bank card copy (front + back)' },
  { id: 'bank_account', name: 'Bank account number' },
  { id: 'landlord_ref', name: 'Previous landlord statement' },
  { id: 'kvk', name: 'Business registration (KvK)' },
  { id: 'pnl', name: 'P&L / accountant income statement (2 years)' },
];

// ── Shared form components ─────────────────────────────────────────────────────
function ChipGroup({ options, selected = [], onChange }) {
  const toggle = v => onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
      {options.map(o => (
        <span key={o} onClick={() => toggle(o)} style={{
          padding: '5px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
          background: selected.includes(o) ? 'var(--near-black)' : 'var(--gold-card)',
          color: selected.includes(o) ? 'var(--gold-bg)' : 'var(--near-black)',
          border: `1px solid ${selected.includes(o) ? 'var(--near-black)' : 'var(--gold-mid)'}`,
          transition: 'all 0.12s',
        }}>{o}</span>
      ))}
    </div>
  );
}

function Field({ label, children, col }) {
  return (
    <div className="field" style={col ? { gridColumn: col } : {}}>
      <label>{label}</label>
      {children}
    </div>
  );
}

// ── CopyLinkPanel ─────────────────────────────────────────────────────────────
function CopyLinkPanel({ link, onClose }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); };
  return (
    <div style={{ marginTop: 10, background: 'var(--gold-card)', borderRadius: 10, padding: '12px 14px', border: '1px solid var(--gold)' }}>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 6 }}>Portal link — copy and paste into your email</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input readOnly value={link} onClick={e => e.target.select()} style={{ flex: 1, fontSize: 11, background: 'var(--card-bg)', border: '1px solid var(--gold-mid)', borderRadius: 6, padding: '7px 10px', fontFamily: 'monospace', minWidth: 0 }} />
        <button className="btn-primary" style={{ fontSize: 12, padding: '7px 14px', whiteSpace: 'nowrap', flexShrink: 0 }} onClick={copy}>{copied ? '✓ Copied' : 'Copy link'}</button>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 18, padding: '0 4px', lineHeight: 1 }}>×</button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>This link expires in 24 hours. Generate a new one if needed.</div>
    </div>
  );
}

// ── Full Profile Form (used in modal and edit panel) ──────────────────────────
function ProfileForm({ data, onChange, isNew = false }) {
  const set = (k, v) => onChange({ ...data, [k]: v });
  const salary = (parseInt(data.salary1) || 0) + (parseInt(data.salary2) || 0);

  // Plain render functions — NOT components — avoids unmount/remount on keystroke
  const inp = (k, p = {}) => <input value={data[k] || ''} onChange={e => set(k, e.target.value)} {...p} />;
  const sel = (k, options, placeholder = 'Select') => (
    <select value={data[k] || ''} onChange={e => set(k, e.target.value)}>
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
  const ta = (k, p = {}) => (
    <textarea value={data[k] || ''} onChange={e => set(k, e.target.value)}
      style={{ width: '100%', background: 'var(--gold-bg)', border: '1px solid var(--gold-mid)', borderRadius: 7, padding: '9px 12px', fontSize: 13, resize: 'vertical', minHeight: 64, fontFamily: "'DM Sans',sans-serif" }} {...p} />
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      {/* ── Identity ── */}
      <div style={{ gridColumn: '1/-1', borderBottom: '1px solid var(--gold-card)', paddingBottom: 12, marginBottom: 4, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--gold-dark)' }}>Tenants</div>
      <Field label="Full name(s) *" col="1/-1">inp("name", { placeholder: "Sarah & James Collins" })</Field>
      <Field label="Primary email *">inp("email", { type: "email", placeholder: "client@example.com" })</Field>
      <Field label="Second email">inp("email2", { type: "email", placeholder: "partner@example.com (optional)" })</Field>
      <Field label="Phone">inp("phone", { type: "tel", placeholder: "+31 6 ..." })</Field>
      <Field label="Children">inp("kids", { placeholder: "Names & ages" })</Field>
      <Field label="Pets">inp("pets", { placeholder: "Type & name" })</Field>

      {/* ── Background ── */}
      <div style={{ gridColumn: '1/-1', borderBottom: '1px solid var(--gold-card)', paddingBottom: 12, marginBottom: 4, marginTop: 8, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--gold-dark)' }}>Background</div>
      <Field label="Originally from">inp("from", { placeholder: "Country / city" })</Field>
      <Field label="Currently living in">inp("livingIn", { placeholder: "Current city & country" })</Field>
      <Field label="Staying in Amsterdam until">inp("stayUntil", { placeholder: "Indefinitely / 2028" })</Field>
      <Field label="Been in Amsterdam before?">sel("beenBefore", ['Yes', 'No'])</Field>
      <Field label="Familiar with neighbourhoods?">sel("familiarNeighbourhoods", ['Yes', 'Somewhat', 'No'])</Field>
      <Field label="Will they bike?">sel("bike", ['Yes', 'No', 'Maybe'])</Field>
      <Field label="Lifestyle & routine" col="1/-1">ta("lifestyle", { placeholder: "Daily routine, hobbies, work hours..." })</Field>

      {/* ── Employment 1 ── */}
      <div style={{ gridColumn: '1/-1', borderBottom: '1px solid var(--gold-card)', paddingBottom: 12, marginBottom: 4, marginTop: 8, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--gold-dark)' }}>1st Employment</div>
      <Field label="Employer">inp("employer1", { placeholder: "Company name" })</Field>
      <Field label="Office location">inp("office1", { placeholder: "Amsterdam" })</Field>
      <Field label="Job title">inp("title1", { placeholder: "Product Manager" })</Field>
      <Field label="Contract type">sel("contract1", ['Permanent', 'Temporary', 'Freelance'])</Field>
      <Field label="Gross salary (€/month)">inp("salary1", { type: "number", placeholder: "5000" })</Field>

      {/* ── Employment 2 ── */}
      <div style={{ gridColumn: '1/-1', borderBottom: '1px solid var(--gold-card)', paddingBottom: 12, marginBottom: 4, marginTop: 8, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--gold-dark)' }}>2nd Employment (optional)</div>
      <Field label="Employer">inp("employer2", { placeholder: "Optional" })</Field>
      <Field label="Office location">inp("office2", { placeholder: "Optional" })</Field>
      <Field label="Job title">inp("title2", { placeholder: "Optional" })</Field>
      <Field label="Contract type">sel("contract2", ['Permanent', 'Temporary', 'Freelance'])</Field>
      <Field label="Gross salary (€/month)">inp("salary2", { type: "number", placeholder: "0" })</Field>
      <Field label="30% tax ruling">sel("taxRuling", ['Yes', 'No', 'Applied for'])</Field>
      <div className="field">
        <label>Combined gross salary</label>
        <div style={{ fontSize: 20, fontWeight: 700, padding: '6px 0' }}>€{salary.toLocaleString()}/mo</div>
      </div>

      {/* ── Wish list ── */}
      <div style={{ gridColumn: '1/-1', borderBottom: '1px solid var(--gold-card)', paddingBottom: 12, marginBottom: 4, marginTop: 8, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--gold-dark)' }}>Wish List</div>
      <Field label="Max rent (€/month)">inp("maxRent", { placeholder: "€ 3,000" })</Field>
      <Field label="Move-in date">inp("moveIn", { type: "date" })</Field>
      <Field label="Min size (m²)">inp("minSize", { type: "number", placeholder: "70" })</Field>
      <div className="field"><label>Bedrooms</label><ChipGroup options={CHIP_OPTS.bedrooms} selected={data.bedrooms || []} onChange={v => set('bedrooms', v)} /></div>
      <div className="field"><label>Furnishing</label><ChipGroup options={CHIP_OPTS.furnishing} selected={data.furnishing || []} onChange={v => set('furnishing', v)} /></div>
      <div className="field"><label>Home type</label><ChipGroup options={CHIP_OPTS.homeType} selected={data.homeType || []} onChange={v => set('homeType', v)} /></div>
      <div className="field"><label>Outdoor</label><ChipGroup options={CHIP_OPTS.outdoor} selected={data.outdoor || []} onChange={v => set('outdoor', v)} /></div>
      <div className="field"><label>Parking</label><ChipGroup options={CHIP_OPTS.parking} selected={data.parking || []} onChange={v => set('parking', v)} /></div>

      {/* ── Preferences ── */}
      <div style={{ gridColumn: '1/-1', borderBottom: '1px solid var(--gold-card)', paddingBottom: 12, marginBottom: 4, marginTop: 8, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--gold-dark)' }}>Preferences</div>
      <Field label="Liked neighbourhoods" col="1/-1">ta("likedAreas", { placeholder: "Jordaan, De Pijp, Oud-Zuid..." })</Field>
      <Field label="Disliked areas" col="1/-1">ta("dislikedAreas", { placeholder: "Areas to avoid..." })</Field>
      <Field label="Must-haves" col="1/-1">ta("likes", { placeholder: "Natural light, open kitchen..." })</Field>
      <Field label="Deal-breakers" col="1/-1">ta("dislikes", { placeholder: "Ground floor bedroom, heavy traffic..." })</Field>

      {/* ── Source + Notes ── */}
      <div style={{ gridColumn: '1/-1', borderBottom: '1px solid var(--gold-card)', paddingBottom: 12, marginBottom: 4, marginTop: 8, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--gold-dark)' }}>Source & Notes</div>
      <Field label="How they found ALH">sel("source", ['Google', 'Referral', 'IamExpat', 'LinkedIn', 'Instagram', 'Other'])</Field>
      <Field label="Source detail / referral name">inp("sourceDetail", { placeholder: "e.g. 'Google: amsterdam expat housing'" })</Field>
      <Field label="Notes from video call" col="1/-1">ta("notes", { placeholder: "Key things from the call..." })</Field>
    </div>
  );
}

// ── New Client Modal (full profile form) ──────────────────────────────────────
function NewClientModal({ onClose, onCreated }) {
  const EMPTY = {
    name: '', email: '', email2: '', phone: '', kids: '', pets: '',
    from: '', livingIn: '', stayUntil: '', beenBefore: '', familiarNeighbourhoods: '',
    lifestyle: '', bike: '',
    employer1: '', office1: '', title1: '', contract1: '', salary1: '',
    employer2: '', office2: '', title2: '', contract2: '', salary2: '', taxRuling: '',
    maxRent: '', moveIn: '', minSize: '',
    bedrooms: [], furnishing: [], homeType: [], outdoor: [], parking: [],
    likedAreas: '', dislikedAreas: '', likes: '', dislikes: '',
    source: '', sourceDetail: '', notes: '',
  };
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!form.name || !form.email) { setError('Name and email are required'); return; }
    setSaving(true); setError('');
    try {
      const emails = [form.email, form.email2].filter(Boolean);
      const clientRef = doc(collection(db, 'users'));
      await setDoc(clientRef, {
        ...form, allEmails: emails, role: 'client', status: 'draft',
        inviteSent: false, pipelineStage: 'Onboarding',
        createdAt: serverTimestamp(), searchStarted: new Date().toISOString().split('T')[0],
        draftId: clientRef.id,
      });
      onCreated(); onClose();
    } catch (err) { setError(err.message || 'Something went wrong'); }
    setSaving(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,22,18,0.6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 500, padding: 24, overflowY: 'auto' }} onClick={onClose}>
      <div style={{ background: 'var(--gold-bg)', borderRadius: 16, padding: '32px 28px', width: '100%', maxWidth: 760, margin: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>New client profile</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>Fill in during video call. No invite is sent until you generate a portal link.</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: 'var(--text-muted)' }}>×</button>
        </div>
        <ProfileForm data={form} onChange={setForm} isNew />
        {error && <div style={{ fontSize: 13, color: 'var(--danger)', marginTop: 12 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className="btn-ghost" onClick={onClose} style={{ flex: 1 }}>Cancel</button>
          <button className="btn-primary" onClick={handleCreate} disabled={!form.name || !form.email || saving} style={{ flex: 2 }}>
            {saving ? 'Saving...' : 'Save profile'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit Client Modal ─────────────────────────────────────────────────────────
function EditClientModal({ client, onClose, onSaved }) {
  const [form, setForm] = useState({ ...client });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await updateDoc(doc(db, 'users', client.id), { ...form, updatedAt: serverTimestamp() });
    onSaved(); onClose();
    setSaving(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,22,18,0.6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 500, padding: 24, overflowY: 'auto' }} onClick={onClose}>
      <div style={{ background: 'var(--gold-bg)', borderRadius: 16, padding: '32px 28px', width: '100%', maxWidth: 760, margin: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Edit profile — {client.name}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: 'var(--text-muted)' }}>×</button>
        </div>
        <ProfileForm data={form} onChange={setForm} />
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className="btn-ghost" onClick={onClose} style={{ flex: 1 }}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ flex: 2 }}>{saving ? 'Saving...' : 'Save changes'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Listing Status Modal ──────────────────────────────────────────────────────
function StatusModal({ listing, onClose, onSaved }) {
  const [status, setStatus] = useState(listing.status || '');
  const [viewingDatetime, setViewingDatetime] = useState(listing.viewingDatetime || '');
  const [adminNotes, setAdminNotes] = useState(listing.adminNotes || '');
  const [saving, setSaving] = useState(false);

  const isViewing = status === 'viewing';
  const finalStatus = isViewing && viewingDatetime
    ? `Viewing scheduled: ${viewingDatetime}`
    : status;

  const handleSave = async () => {
    setSaving(true);
    await updateDoc(doc(db, 'listings', listing.id), {
      status: finalStatus,
      viewingDatetime: isViewing ? viewingDatetime : '',
      adminNotes,
      updatedAt: serverTimestamp(),
    });
    onSaved(listing.id, finalStatus, adminNotes);
    onClose();
    setSaving(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,22,18,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: 24 }} onClick={onClose}>
      <div style={{ background: 'var(--gold-bg)', borderRadius: 16, padding: '28px', width: '100%', maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Update listing status</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>{listing.address}</div>

        <div className="field">
          <label>Status</label>
          <select value={status} onChange={e => setStatus(e.target.value)}>
            {LISTING_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        {isViewing && (
          <div className="field">
            <label>Viewing date & time (e.g. Monday 6 @ 12:15)</label>
            <input value={viewingDatetime} onChange={e => setViewingDatetime(e.target.value)} placeholder="Monday 6 @ 12:15" />
          </div>
        )}

        <div className="field">
          <label>Internal admin notes (not visible to client)</label>
          <textarea value={adminNotes} onChange={e => setAdminNotes(e.target.value)}
            placeholder="Any internal notes about this listing..." rows={3}
            style={{ width: '100%', background: 'var(--gold-bg)', border: '1px solid var(--gold-mid)', borderRadius: 7, padding: '9px 12px', fontSize: 13, resize: 'vertical', fontFamily: "'DM Sans',sans-serif" }} />
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button className="btn-ghost" onClick={onClose} style={{ flex: 1 }}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ flex: 1 }}>{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

// ── New Listing Modal ─────────────────────────────────────────────────────────
function NewListingModal({ clients, onClose, onCreated }) {
  const [form, setForm] = useState({ address: '', area: '', city: 'Amsterdam', price: '', serviceCosts: '', size: '', beds: '', furnishing: 'Furnished', availableFrom: '', url: '', energyLabel: '', floor: '', elevator: '', deposit: '', minPeriod: '', notes: '' });
  const [selectedClients, setSelectedClients] = useState([]);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleClient = id => setSelectedClients(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  const handleCreate = async () => {
    if (!form.address || !form.price || selectedClients.length === 0) return;
    setSaving(true);
    try {
      const { lat, lng } = await geocodeAddress(form.address + (form.city ? ', ' + form.city : ''));
      for (const clientId of selectedClients) {
        await addDoc(collection(db, 'listings'), {
          ...form, price: parseInt(form.price), serviceCosts: parseInt(form.serviceCosts) || 0,
          beds: parseInt(form.beds) || null, clientId, status: '', clientResponse: null,
          noReasons: [], adminNotes: '', createdAt: serverTimestamp(), lat, lng,
        });
      }
      onCreated(); onClose();
    } catch (err) { alert('Error: ' + err.message); }
    setSaving(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,22,18,0.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 500, padding: 24, overflowY: 'auto' }} onClick={onClose}>
      <div style={{ background: 'var(--gold-bg)', borderRadius: 16, padding: '32px 28px', width: '100%', maxWidth: 560, margin: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>Add & push listing</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="field" style={{ gridColumn: '1/-1' }}><label>Address</label><input value={form.address} onChange={e => set('address', e.target.value)} placeholder="Keizersgracht 142" /></div>
          <div className="field"><label>Neighbourhood</label><input value={form.area} onChange={e => set('area', e.target.value)} placeholder="Canal Ring" /></div>
          <div className="field"><label>City</label><input value={form.city} onChange={e => set('city', e.target.value)} /></div>
          <div className="field"><label>Rent (€/month)</label><input type="number" value={form.price} onChange={e => set('price', e.target.value)} placeholder="2950" /></div>
          <div className="field"><label>Service costs (€)</label><input type="number" value={form.serviceCosts} onChange={e => set('serviceCosts', e.target.value)} placeholder="0" /></div>
          <div className="field"><label>Deposit (€)</label><input type="number" value={form.deposit} onChange={e => set('deposit', e.target.value)} placeholder="5900" /></div>
          <div className="field"><label>Size (m²)</label><input value={form.size} onChange={e => set('size', e.target.value)} placeholder="85 m²" /></div>
          <div className="field"><label>Bedrooms</label><input type="number" value={form.beds} onChange={e => set('beds', e.target.value)} placeholder="2" /></div>
          <div className="field"><label>Furnishing</label><select value={form.furnishing} onChange={e => set('furnishing', e.target.value)}>{['Furnished', 'Unfurnished', 'Shell'].map(o => <option key={o}>{o}</option>)}</select></div>
          <div className="field"><label>Available from</label><input value={form.availableFrom} onChange={e => set('availableFrom', e.target.value)} placeholder="Immediately / 1 May" /></div>
          <div className="field"><label>Energy label</label><input value={form.energyLabel} onChange={e => set('energyLabel', e.target.value)} placeholder="A" /></div>
          <div className="field"><label>Floor</label><input value={form.floor} onChange={e => set('floor', e.target.value)} placeholder="3rd floor" /></div>
          <div className="field"><label>Min. rental period</label><input value={form.minPeriod} onChange={e => set('minPeriod', e.target.value)} placeholder="12 months" /></div>
          <div className="field"><label>Elevator</label><select value={form.elevator} onChange={e => set('elevator', e.target.value)}><option value="">Unknown</option><option>Yes</option><option>No</option></select></div>
          <div className="field" style={{ gridColumn: '1/-1' }}><label>Listing URL (Pararius / Funda)</label><input value={form.url} onChange={e => set('url', e.target.value)} placeholder="https://www.pararius.com/..." /></div>
          <div className="field" style={{ gridColumn: '1/-1' }}><label>Notes for client</label><textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Any extra context..." style={{ width: '100%', background: 'var(--gold-bg)', border: '1px solid var(--gold-mid)', borderRadius: 7, padding: '9px 12px', fontSize: 13, resize: 'vertical', minHeight: 60, fontFamily: "'DM Sans', sans-serif" }} /></div>
        </div>
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Push to clients (select at least one)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
            {clients.map(c => (
              <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '8px 12px', borderRadius: 8, background: selectedClients.includes(c.id) ? 'var(--gold-card)' : 'var(--card-bg)', border: `1px solid ${selectedClients.includes(c.id) ? 'var(--gold)' : 'transparent'}`, transition: 'all 0.12s' }}>
                <input type="checkbox" checked={selectedClients.includes(c.id)} onChange={() => toggleClient(c.id)} style={{ accentColor: 'var(--near-black)', width: 16, height: 16 }} />
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
          <button className="btn-primary" onClick={handleCreate} disabled={!form.address || !form.price || selectedClients.length === 0 || saving} style={{ flex: 1 }}>{saving ? 'Pushing...' : `Push to ${selectedClients.length} client${selectedClients.length !== 1 ? 's' : ''}`}</button>
        </div>
      </div>
    </div>
  );
}

// ── Document Approval Panel ───────────────────────────────────────────────────
function DocApprovalPanel({ client, onClose }) {
  const [docs, setDocs] = useState({});
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState({});

  useEffect(() => {
    getDocs(query(collection(db, 'documents'), where('clientId', '==', client.id))).then(snap => {
      const r = {};
      snap.docs.forEach(d => { r[d.data().docTypeId] = d.data(); });
      setDocs(r);
      // Pre-fill comment inputs with existing comments
      const c = {};
      snap.docs.forEach(d => { if (d.data().adminComment) c[d.data().docTypeId] = d.data().adminComment; });
      setComments(c);
      setLoading(false);
    });
  }, [client.id]);

  const handleApprove = async (docTypeId, approved) => {
    const ref = doc(db, 'documents', `${client.id}_${docTypeId}`);
    await setDoc(ref, {
      clientId: client.id, docTypeId,
      adminApproved: approved,
      adminComment: approved ? '' : (comments[docTypeId] || ''),
      adminReviewedAt: serverTimestamp(),
    }, { merge: true });
    setDocs(d => ({ ...d, [docTypeId]: { ...d[docTypeId], adminApproved: approved } }));
  };

  const handleSaveComment = async (docTypeId) => {
    const ref = doc(db, 'documents', `${client.id}_${docTypeId}`);
    await setDoc(ref, { adminComment: comments[docTypeId] || '', adminReviewedAt: serverTimestamp() }, { merge: true });
    setDocs(d => ({ ...d, [docTypeId]: { ...d[docTypeId], adminComment: comments[docTypeId] } }));
  };

  const readyDocs = DOCUMENT_TYPES.filter(dt => docs[dt.id]?.ready);
  const notReadyDocs = DOCUMENT_TYPES.filter(dt => !docs[dt.id]?.ready);

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,22,18,0.6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 500, padding: 24, overflowY: 'auto' }} onClick={onClose}>
      <div style={{ background: 'var(--gold-bg)', borderRadius: 16, padding: '28px', width: '100%', maxWidth: 620, margin: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Documents — {client.name}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{readyDocs.length} of {DOCUMENT_TYPES.length} marked ready by client</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: 'var(--text-muted)' }}>×</button>
        </div>

        {readyDocs.length === 0 && (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: 14 }}>Client hasn't marked any documents ready yet.</div>
        )}

        {readyDocs.map(dt => {
          const rec = docs[dt.id] || {};
          return (
            <div key={dt.id} style={{ background: 'var(--card-bg)', borderRadius: 10, padding: '14px 16px', marginBottom: 10, borderLeft: `4px solid ${rec.adminApproved ? 'var(--success)' : rec.adminApproved === false ? 'var(--danger)' : 'var(--gold)'}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{dt.name}</div>
                  {rec.adminApproved === false && rec.adminComment && (
                    <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 3 }}>Comment: {rec.adminComment}</div>
                  )}
                  {rec.adminApproved === true && (
                    <div style={{ fontSize: 12, color: 'var(--success)', marginTop: 3 }}>✓ Approved</div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => handleApprove(dt.id, true)}
                    style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', background: rec.adminApproved === true ? 'var(--success)' : 'var(--success-bg)', color: rec.adminApproved === true ? 'white' : 'var(--success)', fontFamily: "'DM Sans',sans-serif" }}
                  >✓ Approve</button>
                  <button
                    onClick={() => handleApprove(dt.id, false)}
                    style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', background: rec.adminApproved === false ? 'var(--danger)' : 'var(--danger-bg)', color: rec.adminApproved === false ? 'white' : 'var(--danger)', fontFamily: "'DM Sans',sans-serif" }}
                  >✕ Reject</button>
                </div>
              </div>
              {rec.adminApproved === false && (
                <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                  <input
                    value={comments[dt.id] || ''}
                    onChange={e => setComments(c => ({ ...c, [dt.id]: e.target.value }))}
                    placeholder="Comment for client (what's wrong / what's needed)..."
                    style={{ flex: 1, fontSize: 13, background: 'var(--gold-bg)', border: '1px solid var(--gold-mid)', borderRadius: 7, padding: '7px 10px' }}
                  />
                  <button onClick={() => handleSaveComment(dt.id)} className="btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }}>Save</button>
                </div>
              )}
            </div>
          );
        })}

        {notReadyDocs.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 8 }}>Not yet submitted by client</div>
            {notReadyDocs.map(dt => (
              <div key={dt.id} style={{ fontSize: 13, color: 'var(--text-muted)', padding: '6px 0', borderBottom: '1px solid var(--gold-card)' }}>
                {dt.name}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Admin component ──────────────────────────────────────────────────────
export default function Admin() {
  const { profile } = useAuth();
  const [mainTab, setMainTab] = useState('clients');
  const [clients, setClients] = useState([]);
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [linkState, setLinkState] = useState({});
  const [showNewClient, setShowNewClient] = useState(false);
  const [showNewListing, setShowNewListing] = useState(false);
  const [editClient, setEditClient] = useState(null);
  const [statusModal, setStatusModal] = useState(null);
  const [docModal, setDocModal] = useState(null);
  const [listingClientFilter, setListingClientFilter] = useState('');
  const [listingStatusFilter, setListingStatusFilter] = useState('');
  const [expandedClient, setExpandedClient] = useState(null);

  if (profile?.role !== 'admin') return <div className="page"><div className="page-title">Access denied</div></div>;

  const fetchAll = useCallback(async () => {
    const [uSnap, lSnap] = await Promise.all([
      getDocs(collection(db, 'users')),
      getDocs(query(collection(db, 'listings'), orderBy('createdAt', 'desc'))),
    ]);
    const allUsers = uSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.role !== 'admin');
    const allListings = lSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const clientsWithStats = allUsers.map(u => {
      const uL = allListings.filter(l => l.clientId === u.id);
      return { ...u, listingsCount: uL.length, wantCount: uL.filter(l => l.clientResponse === 'yes').length, viewingCount: uL.filter(l => (l.status || '').toLowerCase().includes('viewing')).length };
    });
    clientsWithStats.sort((a, b) => (a.status === 'draft' ? 1 : 0) - (b.status === 'draft' ? 1 : 0));
    setClients(clientsWithStats);
    setListings(allListings);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleGenerateLink = async (client) => {
    const emails = client.allEmails?.length ? client.allEmails : [client.email];
    setLinkState(s => ({ ...s, [client.id]: { loading: true } }));
    try {
      const links = [];
      for (const email of emails) {
        const link = await generateMagicLink(email);
        links.push({ email, link });
      }
      setLinkState(s => ({ ...s, [client.id]: { loading: false, links } }));
      await updateDoc(doc(db, 'users', client.id), { inviteSent: true, inviteSentAt: serverTimestamp() });
      setClients(cs => cs.map(c => c.id === client.id ? { ...c, inviteSent: true } : c));
    } catch (err) {
      setLinkState(s => ({ ...s, [client.id]: { loading: false, error: err.message } }));
    }
  };

  const handleDeleteClient = async (clientId) => {
    if (!window.confirm('Delete this client and all their data? This cannot be undone.')) return;
    await deleteDoc(doc(db, 'users', clientId));
    setClients(cs => cs.filter(c => c.id !== clientId));
  };

  const handlePipelineStage = async (clientId, stage) => {
    await updateDoc(doc(db, 'users', clientId), { pipelineStage: stage });
    setClients(cs => cs.map(c => c.id === clientId ? { ...c, pipelineStage: stage } : c));
  };

  const filteredListings = listings.filter(l => {
    if (listingClientFilter && l.clientId !== listingClientFilter) return false;
    if (listingStatusFilter === 'new' && (l.clientResponse || (l.status || '').length > 0)) return false;
    if (listingStatusFilter === 'interested' && l.clientResponse !== 'yes') return false;
    if (listingStatusFilter === 'not_interested' && l.clientResponse !== 'no') return false;
    return true;
  });

  const STAGE_COLORS = {
    'Onboarding': { bg: '#e8f0fe', color: '#1a56c4' },
    'Documents': { bg: '#fff3cd', color: '#856404' },
    'Searching': { bg: '#d4edda', color: '#1a7a3c' },
    'Offer': { bg: '#fdf3e2', color: '#a06b1a' },
    'Signed': { bg: '#d4edda', color: '#1a7a3c' },
    'Utilities done': { bg: 'var(--gold-card)', color: 'var(--gold-dark)' },
    'Checked in': { bg: 'var(--card-bg)', color: 'var(--text-muted)' },
    'Left review': { bg: 'var(--card-bg)', color: 'var(--text-muted)' },
  };

  if (loading) return <div className="loading-screen">Loading admin panel...</div>;

  const draftCount = clients.filter(c => c.status === 'draft').length;
  const activeCount = clients.filter(c => c.status !== 'draft').length;
  const TABS = [['clients', `Clients (${clients.length})`], ['listings', 'All listings'], ['pipeline', 'Pipeline']];

  const statusLabel = (l) => {
    const s = l.status || '';
    if (!s) return l.clientResponse === 'yes' ? 'Client interested' : l.clientResponse === 'no' ? 'Not interested' : 'Awaiting response';
    return s;
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Admin panel</div>
          <div className="page-sub">{activeCount} active · {draftCount} draft · {listings.length} listings</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-ghost" onClick={() => setShowNewClient(true)}>+ Add client</button>
          <button className="btn-primary" onClick={() => setShowNewListing(true)}>+ Push listing</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--card-bg)', borderRadius: 10, padding: 4, maxWidth: 480 }}>
        {TABS.map(([v, l]) => (
          <button key={v} onClick={() => setMainTab(v)} style={{ flex: 1, padding: '9px 16px', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: 'none', fontFamily: "'DM Sans', sans-serif", background: mainTab === v ? 'var(--near-black)' : 'transparent', color: mainTab === v ? 'var(--gold-bg)' : 'var(--text-muted)', transition: 'all 0.15s' }}>{l}</button>
        ))}
      </div>

      {/* ── Clients tab ── */}
      {mainTab === 'clients' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {clients.length === 0 && <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No clients yet.</div>}
          {clients.map(c => {
            const isDraft = c.status === 'draft';
            const ls = linkState[c.id];
            const stage = c.pipelineStage || 'Onboarding';
            const stageStyle = STAGE_COLORS[stage] || {};
            const isExpanded = expandedClient === c.id;
            const clientListings = listings.filter(l => l.clientId === c.id);
            return (
              <div key={c.id} style={{ background: 'var(--card-bg)', borderRadius: 12, borderLeft: `4px solid ${isDraft ? 'var(--gold-mid)' : 'var(--gold)'}`, overflow: 'hidden' }}>
                {/* Main row */}
                <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', background: isDraft ? 'var(--gold-mid)' : 'var(--gold)', color: 'var(--gold-deeper)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                    {c.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{c.name || c.email}</div>
                      {isDraft && <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', background: 'var(--gold-card)', color: 'var(--gold-dark)', padding: '2px 8px', borderRadius: 20 }}>Draft</span>}
                      {!isDraft && <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', background: 'var(--success-bg)', color: 'var(--success)', padding: '2px 8px', borderRadius: 20 }}>Active</span>}
                      <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, ...stageStyle }}>{stage}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                      {c.email}{c.maxRent && ` · Budget €${c.maxRent}`}{c.searchStarted && ` · Started ${c.searchStarted}`}
                    </div>
                  </div>
                  {!isDraft && (
                    <div style={{ display: 'flex', gap: 16, marginRight: 8 }}>
                      {[[c.listingsCount || 0, 'Found'], [c.wantCount || 0, 'Want'], [c.viewingCount || 0, 'Viewing']].map(([val, label]) => (
                        <div key={label} style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 17, fontWeight: 700 }}>{val}</div>
                          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>{label}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button className="btn-ghost" style={{ fontSize: 11, padding: '6px 10px' }} onClick={() => setEditClient(c)}>Edit</button>
                    <button className="btn-ghost" style={{ fontSize: 11, padding: '6px 10px' }} onClick={() => setDocModal(c)}>Docs</button>
                    <button className="btn-ghost" style={{ fontSize: 11, padding: '6px 10px' }} disabled={ls?.loading} onClick={() => handleGenerateLink(c)}>
                      {ls?.loading ? '...' : c.inviteSent ? 'New link' : 'Generate link'}
                    </button>
                    <button className="btn-ghost" style={{ fontSize: 11, padding: '6px 10px' }} onClick={() => setExpandedClient(isExpanded ? null : c.id)}>
                      {isExpanded ? '▲' : '▼'}
                    </button>
                    <button onClick={() => handleDeleteClient(c.id)} style={{ fontSize: 11, padding: '6px 10px', borderRadius: 8, border: '1.5px solid var(--danger)', background: 'var(--danger-bg)', color: 'var(--danger)', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>Delete</button>
                  </div>
                </div>

                {/* Link panel */}
                {ls?.links && ls.links.map(({ email, link }) => (
                  <div key={email} style={{ padding: '0 20px 12px' }}>
                    {ls.links.length > 1 && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{email}</div>}
                    <CopyLinkPanel link={link} onClose={() => setLinkState(s => ({ ...s, [c.id]: null }))} />
                  </div>
                ))}
                {ls?.error && <div style={{ padding: '0 20px 12px', fontSize: 13, color: 'var(--danger)' }}>Error: {ls.error}</div>}

                {/* Expanded: pipeline + listings */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid var(--gold-card)', padding: '16px 20px', background: 'var(--gold-bg)' }}>
                    {/* Pipeline stage selector */}
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 8 }}>Pipeline stage</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {PIPELINE_STAGES.map(s => (
                          <button key={s} onClick={() => handlePipelineStage(c.id, s)} style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: '1.5px solid', borderColor: stage === s ? 'var(--near-black)' : 'var(--gold-mid)', background: stage === s ? 'var(--near-black)' : 'var(--gold-card)', color: stage === s ? 'var(--gold-bg)' : 'var(--near-black)', fontFamily: "'DM Sans',sans-serif", transition: 'all 0.12s' }}>{s}</button>
                        ))}
                      </div>
                    </div>
                    {/* Client listings */}
                    <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 8 }}>Listings ({clientListings.length})</div>
                    {clientListings.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No listings pushed yet.</div>}
                    {clientListings.map(l => (
                      <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--card-bg)', borderRadius: 8, marginBottom: 6 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{l.address}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{[l.area, l.size, l.beds && `${l.beds} bed`, `€${(l.price || 0).toLocaleString()}`].filter(Boolean).join(' · ')}</div>
                          {l.adminNotes && <div style={{ fontSize: 11, color: 'var(--gold-dark)', marginTop: 2, fontStyle: 'italic' }}>Note: {l.adminNotes}</div>}
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20, background: l.clientResponse === 'yes' ? 'var(--success-bg)' : l.clientResponse === 'no' ? 'var(--danger-bg)' : 'var(--gold-card)', color: l.clientResponse === 'yes' ? 'var(--success)' : l.clientResponse === 'no' ? 'var(--danger)' : 'var(--gold-dark)', whiteSpace: 'nowrap' }}>
                          {statusLabel(l)}
                        </span>
                        <button className="btn-ghost" style={{ fontSize: 11, padding: '5px 10px', flexShrink: 0 }} onClick={() => setStatusModal(l)}>Update status</button>
                        <button onClick={async () => { if (window.confirm('Delete this listing?')) { await deleteDoc(doc(db, 'listings', l.id)); setListings(ls => ls.filter(x => x.id !== l.id)); } }} style={{ fontSize: 11, padding: '5px 10px', borderRadius: 7, border: '1.5px solid var(--danger)', background: 'var(--danger-bg)', color: 'var(--danger)', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", flexShrink: 0 }}>Delete</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── All listings tab ── */}
      {mainTab === 'listings' && (
        <div>
          {/* Filters */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <select value={listingClientFilter} onChange={e => setListingClientFilter(e.target.value)} style={{ fontSize: 13, border: '1.5px solid var(--gold-mid)', borderRadius: 8, padding: '7px 12px', background: 'var(--card-bg)' }}>
              <option value="">All clients</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name || c.email}</option>)}
            </select>
            <select value={listingStatusFilter} onChange={e => setListingStatusFilter(e.target.value)} style={{ fontSize: 13, border: '1.5px solid var(--gold-mid)', borderRadius: 8, padding: '7px 12px', background: 'var(--card-bg)' }}>
              <option value="">All responses</option>
              <option value="new">Awaiting response</option>
              <option value="interested">Interested</option>
              <option value="not_interested">Not interested</option>
            </select>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', alignSelf: 'center' }}>{filteredListings.length} listings</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filteredListings.map(l => {
              const client = clients.find(c => c.id === l.clientId);
              return (
                <div key={l.id} style={{ background: 'var(--card-bg)', borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{l.address}</div>
                      {l.area && <span style={{ fontSize: 11, color: 'var(--gold-dark)' }}>{l.area}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                      {[l.size, l.beds && `${l.beds} bed`, l.furnishing, l.availableFrom].filter(Boolean).join(' · ')}{l.price && ` · €${l.price.toLocaleString()}/mo`}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                      Client: <strong>{client?.name || l.clientId}</strong>
                      {l.noReasons?.length > 0 && ` · Feedback: ${l.noReasons.join(', ')}`}
                    </div>
                    {l.adminNotes && <div style={{ fontSize: 11, color: 'var(--gold-dark)', marginTop: 4, fontStyle: 'italic' }}>Admin note: {l.adminNotes}</div>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: l.clientResponse === 'yes' ? 'var(--success-bg)' : l.clientResponse === 'no' ? 'var(--danger-bg)' : 'var(--gold-card)', color: l.clientResponse === 'yes' ? 'var(--success)' : l.clientResponse === 'no' ? 'var(--danger)' : 'var(--gold-dark)' }}>
                      {statusLabel(l)}
                    </span>
                    {(l.status || '').length > 0 && <span style={{ fontSize: 11, color: 'var(--blue)' }}>{l.status}</span>}
                    <button className="btn-ghost" style={{ fontSize: 11, padding: '5px 10px' }} onClick={() => setStatusModal(l)}>Update status</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Pipeline overview tab ── */}
      {mainTab === 'pipeline' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
            {PIPELINE_STAGES.map(stage => {
              const stageClients = clients.filter(c => (c.pipelineStage || 'Onboarding') === stage);
              const stageStyle = STAGE_COLORS[stage] || {};
              return (
                <div key={stage} style={{ background: 'var(--card-bg)', borderRadius: 12, padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 8px', borderRadius: 12, ...stageStyle }}>{stage}</span>
                    <span style={{ fontSize: 18, fontWeight: 700 }}>{stageClients.length}</span>
                  </div>
                  {stageClients.map(c => (
                    <div key={c.id} style={{ fontSize: 13, padding: '5px 0', borderBottom: '1px solid var(--gold-card)', color: 'var(--near-black)' }}>
                      {c.name || c.email}
                    </div>
                  ))}
                  {stageClients.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showNewClient && <NewClientModal onClose={() => setShowNewClient(false)} onCreated={fetchAll} />}
      {showNewListing && <NewListingModal clients={clients} onClose={() => setShowNewListing(false)} onCreated={fetchAll} />}
      {editClient && <EditClientModal client={editClient} onClose={() => setEditClient(null)} onSaved={fetchAll} />}
      {docModal && <DocApprovalPanel client={docModal} onClose={() => setDocModal(null)} />}
      {statusModal && (
        <StatusModal
          listing={statusModal}
          onClose={() => setStatusModal(null)}
          onSaved={(id, status, adminNotes) => setListings(ls => ls.map(l => l.id === id ? { ...l, status, adminNotes } : l))}
        />
      )}
    </div>
  );
}
