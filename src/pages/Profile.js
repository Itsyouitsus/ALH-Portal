import React, { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { db } from '../firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

const CHIP_OPTS = {
  bedrooms: ['Studio', '1', '2', '3', '4+'],
  furnishing: ['Furnished', 'Unfurnished', 'Shell'],
  homeType: ['Apartment', 'House', 'Studio', 'Townhouse'],
  outdoor: ['Balcony', 'Garden', 'Rooftop', 'Not needed'],
  parking: ['Yes', 'No'],
};

function ChipGroup({ options, selected, onChange }) {
  const toggle = (v) => onChange(
    selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]
  );
  return (
    <div className="chip-group">
      {options.map(o => (
        <span key={o} className={`chip${selected.includes(o) ? ' on' : ''}`} onClick={() => toggle(o)}>{o}</span>
      ))}
    </div>
  );
}

export default function Profile() {
  const { user } = useAuth();
  const [data, setData] = useState({
    name: '', kids: '', pets: '', phone: '', email: '',
    from: '', livingIn: '', stayUntil: '', beenBefore: '', familiarNeighbourhoods: '',
    lifestyle: '', bike: '',
    employer1: '', office1: '', title1: '', contract1: '', salary1: '',
    employer2: '', office2: '', title2: '', contract2: '', salary2: '',
    taxRuling: '',
    maxRent: '', moveIn: '', minSize: '',
    bedrooms: [], furnishing: [], homeType: [], outdoor: [], parking: [],
    likedAreas: '', dislikedAreas: '', likes: '', dislikes: '',
    source: '', sourceDetail: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, 'users', user.uid)).then(snap => {
      if (snap.exists()) setData(d => ({ ...d, ...snap.data() }));
    });
  }, [user]);

  const set = (k, v) => setData(d => ({ ...d, [k]: v }));
  const salary = (parseInt(data.salary1) || 0) + (parseInt(data.salary2) || 0);

  const handleSave = async () => {
    setSaving(true);
    await setDoc(doc(db, 'users', user.uid), { ...data, email: user.email, updatedAt: serverTimestamp() }, { merge: true });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const Field = ({ label, children }) => (
    <div className="field"><label>{label}</label>{children}</div>
  );
  const Input = ({ k, ...props }) => (
    <input value={data[k]} onChange={e => set(k, e.target.value)} {...props} />
  );
  const Select = ({ k, options, placeholder }) => (
    <select value={data[k]} onChange={e => set(k, e.target.value)}>
      <option value="">{placeholder || 'Select'}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">My profile</div>
          <div className="page-sub">Your search preferences and personal details</div>
        </div>
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save changes'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">Tenants</div>
            <Field label="Full name(s)"><Input k="name" placeholder="e.g. Sarah & James Collins"/></Field>
            <div className="field-row">
              <Field label="Children"><Input k="kids" placeholder="Names & ages"/></Field>
              <Field label="Pets"><Input k="pets" placeholder="Type & name"/></Field>
            </div>
            <Field label="Phone"><Input k="phone" type="tel" placeholder="+31 6 ..."/></Field>
            <Field label="Email"><input value={user?.email} disabled style={{ opacity: 0.6, width: '100%', background: 'var(--gold-bg)', border: '1px solid var(--gold-mid)', borderRadius: 7, padding: '9px 12px', fontSize: 13 }}/></Field>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">Background</div>
            <Field label="Originally from"><Input k="from" placeholder="Country / city"/></Field>
            <Field label="Currently living in"><Input k="livingIn" placeholder="Current city & country"/></Field>
            <Field label="Staying in Amsterdam until"><Input k="stayUntil" placeholder="e.g. Indefinitely / 2028"/></Field>
            <div className="field-row">
              <Field label="Been in Amsterdam before?"><Select k="beenBefore" options={['Yes', 'No']}/></Field>
              <Field label="Familiar with neighbourhoods?"><Select k="familiarNeighbourhoods" options={['Yes', 'Somewhat', 'No']}/></Field>
            </div>
            <Field label="Lifestyle & routine"><textarea className="field" value={data.lifestyle} onChange={e => set('lifestyle', e.target.value)} placeholder="Daily routine, hobbies, work hours..." style={{ width: '100%', background: 'var(--gold-bg)', border: '1px solid var(--gold-mid)', borderRadius: 7, padding: '9px 12px', fontSize: 13, resize: 'vertical', minHeight: 72 }}/></Field>
            <Field label="Will you bike?"><Select k="bike" options={['Yes', 'No', 'Maybe']}/></Field>
          </div>

          <div className="card">
            <div className="card-title">Employment</div>
            <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--gold-card)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10 }}>1st employment</div>
              <Field label="Employer"><Input k="employer1" placeholder="Company name"/></Field>
              <div className="field-row">
                <Field label="Office location"><Input k="office1" placeholder="Amsterdam"/></Field>
                <Field label="Job title"><Input k="title1" placeholder="e.g. Product Manager"/></Field>
              </div>
              <div className="field-row">
                <Field label="Contract type"><Select k="contract1" options={['Permanent', 'Temporary', 'Freelance']}/></Field>
                <Field label="Gross salary (€/month)"><Input k="salary1" type="number" placeholder="5000"/></Field>
              </div>
            </div>
            <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--gold-card)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10 }}>2nd employment (if applicable)</div>
              <Field label="Employer"><Input k="employer2" placeholder="Optional"/></Field>
              <div className="field-row">
                <Field label="Office location"><Input k="office2" placeholder="Optional"/></Field>
                <Field label="Job title"><Input k="title2" placeholder="Optional"/></Field>
              </div>
              <div className="field-row">
                <Field label="Contract type"><Select k="contract2" options={['Permanent', 'Temporary', 'Freelance']}/></Field>
                <Field label="Gross salary (€/month)"><Input k="salary2" type="number" placeholder="0"/></Field>
              </div>
            </div>
            <div className="field-row">
              <Field label="30% tax ruling"><Select k="taxRuling" options={['Yes', 'No', 'Applied for']}/></Field>
              <div className="field">
                <label>Combined gross salary</label>
                <div style={{ fontSize: 22, fontWeight: 700, padding: '4px 0', color: 'var(--near-black)' }}>
                  €{salary.toLocaleString()}/mo
                </div>
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">Wish list</div>
            <Field label="Max rent per month"><Input k="maxRent" placeholder="€ 3,000"/></Field>
            <Field label="Move-in date"><Input k="moveIn" type="date"/></Field>
            <div className="field">
              <label>Bedrooms</label>
              <ChipGroup options={CHIP_OPTS.bedrooms} selected={data.bedrooms} onChange={v => set('bedrooms', v)}/>
            </div>
            <Field label="Min size (m²)"><Input k="minSize" type="number" placeholder="70"/></Field>
            <div className="field">
              <label>Furnishing</label>
              <ChipGroup options={CHIP_OPTS.furnishing} selected={data.furnishing} onChange={v => set('furnishing', v)}/>
            </div>
            <div className="field">
              <label>Home type</label>
              <ChipGroup options={CHIP_OPTS.homeType} selected={data.homeType} onChange={v => set('homeType', v)}/>
            </div>
            <div className="field">
              <label>Outdoor space</label>
              <ChipGroup options={CHIP_OPTS.outdoor} selected={data.outdoor} onChange={v => set('outdoor', v)}/>
            </div>
            <div className="field">
              <label>Parking</label>
              <ChipGroup options={CHIP_OPTS.parking} selected={data.parking} onChange={v => set('parking', v)}/>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">Likes & dislikes</div>
            <Field label="Liked neighbourhoods"><textarea value={data.likedAreas} onChange={e => set('likedAreas', e.target.value)} placeholder="e.g. Jordaan, De Pijp, Oud-Zuid..." style={{ width: '100%', background: 'var(--gold-bg)', border: '1px solid var(--gold-mid)', borderRadius: 7, padding: '9px 12px', fontSize: 13, resize: 'vertical', minHeight: 60, fontFamily: "'DM Sans', sans-serif" }}/></Field>
            <Field label="Disliked areas"><textarea value={data.dislikedAreas} onChange={e => set('dislikedAreas', e.target.value)} placeholder="Areas to avoid..." style={{ width: '100%', background: 'var(--gold-bg)', border: '1px solid var(--gold-mid)', borderRadius: 7, padding: '9px 12px', fontSize: 13, resize: 'vertical', minHeight: 60, fontFamily: "'DM Sans', sans-serif" }}/></Field>
            <Field label="Must-haves in a home"><textarea value={data.likes} onChange={e => set('likes', e.target.value)} placeholder="Natural light, open kitchen, quiet street..." style={{ width: '100%', background: 'var(--gold-bg)', border: '1px solid var(--gold-mid)', borderRadius: 7, padding: '9px 12px', fontSize: 13, resize: 'vertical', minHeight: 60, fontFamily: "'DM Sans', sans-serif" }}/></Field>
            <Field label="Deal-breakers"><textarea value={data.dislikes} onChange={e => set('dislikes', e.target.value)} placeholder="Ground floor bedroom, heavy traffic..." style={{ width: '100%', background: 'var(--gold-bg)', border: '1px solid var(--gold-mid)', borderRadius: 7, padding: '9px 12px', fontSize: 13, resize: 'vertical', minHeight: 60, fontFamily: "'DM Sans', sans-serif" }}/></Field>
          </div>

          <div className="card">
            <div className="card-title">How you found us</div>
            <Field label="Source"><Select k="source" options={['Google', 'Referral', 'IamExpat', 'LinkedIn', 'Instagram', 'Other']}/></Field>
            <Field label="Exact source or referral name"><Input k="sourceDetail" placeholder="e.g. 'Google: amsterdam expat housing agent'"/></Field>
            <Field label="Additional notes"><textarea value={data.notes} onChange={e => set('notes', e.target.value)} placeholder="Anything else we should know..." style={{ width: '100%', background: 'var(--gold-bg)', border: '1px solid var(--gold-mid)', borderRadius: 7, padding: '9px 12px', fontSize: 13, resize: 'vertical', minHeight: 60, fontFamily: "'DM Sans', sans-serif" }}/></Field>
          </div>
        </div>
      </div>
    </div>
  );
}
