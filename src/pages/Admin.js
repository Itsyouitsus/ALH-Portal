import React, { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { db } from '../firebase';
import { collection, getDocs, doc, setDoc, addDoc, updateDoc, deleteDoc, serverTimestamp, orderBy, query } from 'firebase/firestore';
import { auth } from '../firebase';

const WORKER_URL = 'https://alh-email-worker.home-f67.workers.dev/';
const FIREBASE_API_KEY = 'AIzaSyAhIlt30p-huvswMLh3OOvsNrHwWR8LeEI';
const PORTAL_URL = 'https://itsyouitsus.github.io/ALH-Portal/#/login';

async function getMagicLink(email) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestType: 'EMAIL_SIGNIN', email, continueUrl: PORTAL_URL, returnOobLink: true }),
    }
  );
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.oobLink;
}

async function sendInviteEmail(email, magicLink) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f7f5f0;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f5f0;padding:40px 20px;">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;">
<tr><td style="background:#0f0f0d;padding:32px 40px;text-align:center;">
<div style="font-family:Georgia,serif;font-size:22px;color:#c9a96e;letter-spacing:0.04em;">Amsterdam Life Homes</div>
<div style="font-size:12px;color:rgba(247,245,240,0.5);margin-top:4px;letter-spacing:0.08em;text-transform:uppercase;">Your personal housing portal</div>
</td></tr>
<tr><td style="padding:40px 40px 32px;">
<p style="font-size:15px;color:#555;line-height:1.6;margin:0 0 24px;">We have set up your personal housing portal. Click the button below to activate it and see the properties we have lined up for you.</p>
<div style="text-align:center;margin:32px 0;">
<a href="${magicLink}" style="display:inline-block;background:#0f0f0d;color:#c9a96e;text-decoration:none;font-size:14px;font-weight:600;letter-spacing:0.06em;padding:16px 36px;border-radius:6px;">Open my portal</a>
</div>
<p style="font-size:13px;color:#999;line-height:1.6;margin:0;">This link expires in 24 hours and can only be used once.<br>If you did not expect this email, you can safely ignore it.</p>
</td></tr>
<tr><td style="background:#f7f5f0;padding:24px 40px;border-top:1px solid #e8e4dc;text-align:center;">
<p style="font-size:12px;color:#aaa;margin:0;">Amsterdam Life Homes &nbsp;·&nbsp; <a href="mailto:home@amsterdamlifehomes.com" style="color:#aaa;">home@amsterdamlifehomes.com</a></p>
</td></tr>
</table></td></tr></table></body></html>`;
  await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: email, subject: 'Your Amsterdam Life Homes portal is ready', html }),
  });
}

function NewClientModal({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [email2, setEmail2] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!name || !email) return;
    setSaving(true);
    setError('');
    try {
      const emails = [email, email2].filter(Boolean);
      for (const em of emails) {
        const clientRef = doc(collection(db, 'pendingClients'));
        await setDoc(clientRef, { name, email: em, primaryEmail: email, allEmails: emails, role: 'client', createdAt: serverTimestamp(), searchStarted: new Date().toISOString().split('T')[0] });
        const link = await getMagicLink(em);
        await sendInviteEmail(em, link);
      }
      onCreated();
      onClose();
    } catch (err) {
      setError(err.message || 'Something went wrong');
    }
    setSaving(false);
  };

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(26,22,18,0.55)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:500,padding:24 }} onClick={onClose}>
      <div style={{ background:'var(--gold-bg)',borderRadius:16,padding:'32px 28px',width:'100%',maxWidth:440 }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize:20,fontWeight:700,marginBottom:20 }}>Add new client</div>
        <div className="field"><label>Full name</label><input value={name} onChange={e => setName(e.target.value)} placeholder="Sarah & James Collins"/></div>
        <div className="field"><label>Email address</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="client@example.com"/></div>
        <div className="field">
          <label>Second email <span style={{ fontWeight:400,color:'var(--text-muted)' }}>(optional)</span></label>
          <input type="email" value={email2} onChange={e => setEmail2(e.target.value)} placeholder="partner@example.com"/>
        </div>
        <div style={{ fontSize:12,color:'var(--text-muted)',marginBottom:error ? 8 : 20 }}>Both addresses will receive a portal invite and can sign in independently.</div>
        {error && <div style={{ fontSize:13,color:'var(--danger)',marginBottom:16 }}>{error}</div>}
        <div style={{ display:'flex',gap:10 }}>
          <button className="btn-ghost" onClick={onClose} style={{ flex:1 }}>Cancel</button>
          <button className="btn-primary" onClick={handleCreate} disabled={!name||!email||saving} style={{ flex:1 }}>{saving ? 'Sending invites...' : 'Create & invite'}</button>
        </div>
      </div>
    </div>
  );
}

function NewListingModal({ clients, onClose, onCreated }) {
  const [form, setForm] = useState({ address:'',area:'',city:'Amsterdam',price:'',serviceCosts:'',size:'',beds:'',furnishing:'Furnished',availableFrom:'',energyLabel:'',floor:'',elevator:'',deposit:'',minPeriod:'',notes:'' });
  const [selectedClients, setSelectedClients] = useState([]);
  const [saving, setSaving] = useState(false);
  const set = (k,v) => setForm(f => ({ ...f,[k]:v }));
  const toggleClient = id => setSelectedClients(s => s.includes(id) ? s.filter(x => x !== id) : [...s,id]);
  const handleCreate = async () => {
    if (!form.address || !form.price || selectedClients.length === 0) return;
    setSaving(true);
    try {
      for (const clientId of selectedClients) {
        await addDoc(collection(db,'listings'), { ...form,price:parseInt(form.price),serviceCosts:parseInt(form.serviceCosts)||0,beds:parseInt(form.beds)||null,clientId,status:'new',clientResponse:null,noReasons:[],createdAt:serverTimestamp() });
      }
      onCreated(); onClose();
    } catch (err) { alert('Error: '+err.message); }
    setSaving(false);
  };
  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(26,22,18,0.55)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:500,padding:24,overflowY:'auto' }} onClick={onClose}>
      <div style={{ background:'var(--gold-bg)',borderRadius:16,padding:'32px 28px',width:'100%',maxWidth:560,margin:'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize:20,fontWeight:700,marginBottom:20 }}>Add & push listing</div>
        <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10 }}>
          <div className="field" style={{ gridColumn:'1/-1' }}><label>Address</label><input value={form.address} onChange={e => set('address',e.target.value)} placeholder="Keizersgracht 142"/></div>
          <div className="field"><label>Neighbourhood</label><input value={form.area} onChange={e => set('area',e.target.value)} placeholder="Canal Ring"/></div>
          <div className="field"><label>City</label><input value={form.city} onChange={e => set('city',e.target.value)}/></div>
          <div className="field"><label>Rent (€/month)</label><input type="number" value={form.price} onChange={e => set('price',e.target.value)} placeholder="2950"/></div>
          <div className="field"><label>Service costs (€)</label><input type="number" value={form.serviceCosts} onChange={e => set('serviceCosts',e.target.value)} placeholder="0"/></div>
          <div className="field"><label>Deposit (€)</label><input type="number" value={form.deposit} onChange={e => set('deposit',e.target.value)} placeholder="5900"/></div>
          <div className="field"><label>Size (m²)</label><input value={form.size} onChange={e => set('size',e.target.value)} placeholder="85 m²"/></div>
          <div className="field"><label>Bedrooms</label><input type="number" value={form.beds} onChange={e => set('beds',e.target.value)} placeholder="2"/></div>
          <div className="field"><label>Furnishing</label><select value={form.furnishing} onChange={e => set('furnishing',e.target.value)}>{['Furnished','Unfurnished','Shell'].map(o => <option key={o}>{o}</option>)}</select></div>
          <div className="field"><label>Available from</label><input value={form.availableFrom} onChange={e => set('availableFrom',e.target.value)} placeholder="Immediately / 1 May"/></div>
          <div className="field"><label>Energy label</label><input value={form.energyLabel} onChange={e => set('energyLabel',e.target.value)} placeholder="A"/></div>
          <div className="field"><label>Floor</label><input value={form.floor} onChange={e => set('floor',e.target.value)} placeholder="3rd floor"/></div>
          <div className="field"><label>Min. rental period</label><input value={form.minPeriod} onChange={e => set('minPeriod',e.target.value)} placeholder="12 months"/></div>
          <div className="field"><label>Elevator</label><select value={form.elevator} onChange={e => set('elevator',e.target.value)}><option value="">Unknown</option><option>Yes</option><option>No</option></select></div>
          <div className="field" style={{ gridColumn:'1/-1' }}><label>Notes for client</label><textarea value={form.notes} onChange={e => set('notes',e.target.value)} placeholder="Any extra context..." style={{ width:'100%',background:'var(--gold-bg)',border:'1px solid var(--gold-mid)',borderRadius:7,padding:'9px 12px',fontSize:13,resize:'vertical',minHeight:60,fontFamily:"'DM Sans', sans-serif" }}/></div>
        </div>
        <div style={{ marginTop:16 }}>
          <div style={{ fontSize:13,fontWeight:600,marginBottom:10 }}>Push to clients (select at least one)</div>
          <div style={{ display:'flex',flexDirection:'column',gap:6 }}>
            {clients.map(c => (
              <label key={c.id} style={{ display:'flex',alignItems:'center',gap:10,cursor:'pointer',padding:'8px 12px',borderRadius:8,background:selectedClients.includes(c.id)?'var(--gold-card)':'var(--card-bg)',border:`1px solid ${selectedClients.includes(c.id)?'var(--gold)':'transparent'}`,transition:'all 0.12s' }}>
                <input type="checkbox" checked={selectedClients.includes(c.id)} onChange={() => toggleClient(c.id)} style={{ accentColor:'var(--near-black)',width:16,height:16 }}/>
                <div>
                  <div style={{ fontSize:13,fontWeight:600 }}>{c.name}</div>
                  <div style={{ fontSize:11,color:'var(--text-muted)' }}>{c.email} · Budget {c.maxRent||'?'}</div>
                </div>
              </label>
            ))}
          </div>
        </div>
        <div style={{ display:'flex',gap:10,marginTop:24 }}>
          <button className="btn-ghost" onClick={onClose} style={{ flex:1 }}>Cancel</button>
          <button className="btn-primary" onClick={handleCreate} disabled={!form.address||!form.price||selectedClients.length===0||saving} style={{ flex:1 }}>{saving ? 'Pushing...' : `Push to ${selectedClients.length} client${selectedClients.length!==1?'s':''}`}</button>
        </div>
      </div>
    </div>
  );
}

export default function Admin() {
  const { profile } = useAuth();
  const [tab, setTab] = useState('clients');
  const [clients, setClients] = useState([]);
  const [pending, setPending] = useState([]);
  const [listings, setListings] = useState([]);
  const [showNewClient, setShowNewClient] = useState(false);
  const [showNewListing, setShowNewListing] = useState(false);
  const [loading, setLoading] = useState(true);

  if (profile?.role !== 'admin') return <div className="page"><div className="page-title">Access denied</div></div>;

  const fetchAll = async () => {
    const [uSnap, lSnap, pSnap] = await Promise.all([
      getDocs(collection(db,'users')),
      getDocs(query(collection(db,'listings'), orderBy('createdAt','desc'))),
      getDocs(collection(db,'pendingClients')),
    ]);
    const allUsers = uSnap.docs.map(d => ({ id:d.id,...d.data() })).filter(u => u.role !== 'admin');
    const allListings = lSnap.docs.map(d => ({ id:d.id,...d.data() }));
    const allPending = pSnap.docs.map(d => ({ id:d.id,...d.data() }));
    const clientsWithStats = allUsers.map(u => {
      const uL = allListings.filter(l => l.clientId === u.id);
      return { ...u,listingsCount:uL.length,wantCount:uL.filter(l => l.clientResponse==='yes').length,viewingCount:uL.filter(l => l.status==='viewing').length };
    });
    setClients(clientsWithStats);
    setListings(allListings);
    setPending(allPending);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const updateListingStatus = async (id, status) => {
    await updateDoc(doc(db,'listings',id), { status });
    setListings(ls => ls.map(l => l.id===id ? { ...l,status } : l));
  };

  const resendInvite = async (p) => {
    try {
      const link = await getMagicLink(p.email);
      await sendInviteEmail(p.email, link);
      alert(`Invite resent to ${p.email}`);
    } catch (err) { alert('Error: '+err.message); }
  };

  const deletePending = async (id) => {
    await deleteDoc(doc(db,'pendingClients',id));
    setPending(ps => ps.filter(p => p.id !== id));
  };

  if (loading) return <div className="loading-screen">Loading admin panel...</div>;

  const TABS = [['clients',`Active (${clients.length})`],['pending',`Pending (${pending.length})`],['listings','All listings']];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Admin panel</div>
          <div className="page-sub">{clients.length} active · {pending.length} pending · {listings.length} listings</div>
        </div>
        <div style={{ display:'flex',gap:10 }}>
          <button className="btn-ghost" onClick={() => setShowNewClient(true)}>+ Add client</button>
          <button className="btn-primary" onClick={() => setShowNewListing(true)}>+ Push listing</button>
        </div>
      </div>

      <div style={{ display:'flex',gap:4,marginBottom:24,background:'var(--card-bg)',borderRadius:10,padding:4,maxWidth:480 }}>
        {TABS.map(([v,l]) => (
          <button key={v} onClick={() => setTab(v)} style={{ flex:1,padding:'9px 16px',borderRadius:7,fontSize:13,fontWeight:500,cursor:'pointer',border:'none',fontFamily:"'DM Sans', sans-serif",background:tab===v?'var(--near-black)':'transparent',color:tab===v?'var(--gold-bg)':'var(--text-muted)',transition:'all 0.15s' }}>{l}</button>
        ))}
      </div>

      {tab === 'clients' && (
        <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
          {clients.length === 0 && <div className="card" style={{ textAlign:'center',padding:40,color:'var(--text-muted)' }}>No active clients yet.</div>}
          {clients.map(c => (
            <div key={c.id} style={{ display:'flex',alignItems:'center',gap:16,background:'var(--card-bg)',borderRadius:12,padding:'16px 20px',borderLeft:'4px solid var(--gold)' }}>
              <div style={{ width:40,height:40,borderRadius:'50%',background:'var(--gold)',color:'var(--gold-deeper)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:13,flexShrink:0 }}>
                {c.name?.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase()||'?'}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14,fontWeight:700 }}>{c.name||c.email}</div>
                <div style={{ fontSize:12,color:'var(--text-muted)',marginTop:1 }}>{c.email}{c.maxRent&&` · Budget ${c.maxRent}`}{c.searchStarted&&` · Started ${c.searchStarted}`}</div>
              </div>
              <div style={{ display:'flex',gap:20 }}>
                {[[c.listingsCount||0,'Found'],[c.wantCount||0,'Want'],[c.viewingCount||0,'Viewing']].map(([val,label]) => (
                  <div key={label} style={{ textAlign:'center' }}>
                    <div style={{ fontSize:18,fontWeight:700,color:label==='Want'?'var(--success)':label==='Viewing'?'var(--blue)':'var(--near-black)' }}>{val}</div>
                    <div style={{ fontSize:10,textTransform:'uppercase',letterSpacing:'0.05em',color:'var(--text-muted)' }}>{label}</div>
                  </div>
                ))}
              </div>
              <button className="btn-ghost" style={{ fontSize:12 }}>Open portal</button>
            </div>
          ))}
        </div>
      )}

      {tab === 'pending' && (
        <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
          {pending.length === 0 && <div className="card" style={{ textAlign:'center',padding:40,color:'var(--text-muted)' }}>No pending invites. All clients have activated their portal.</div>}
          {pending.map(p => (
            <div key={p.id} style={{ display:'flex',alignItems:'center',gap:16,background:'var(--card-bg)',borderRadius:12,padding:'16px 20px',borderLeft:'4px solid var(--gold-mid)' }}>
              <div style={{ width:40,height:40,borderRadius:'50%',background:'var(--gold-mid)',color:'var(--gold-deeper)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:13,flexShrink:0 }}>
                {p.name?.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase()||'?'}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14,fontWeight:700 }}>{p.name}</div>
                <div style={{ fontSize:12,color:'var(--text-muted)',marginTop:1 }}>
                  {p.email}
                  {p.allEmails?.length > 1 && <span style={{ marginLeft:8,background:'var(--gold-card)',padding:'1px 7px',borderRadius:10,fontSize:11 }}>+{p.allEmails.length-1} more</span>}
                  {p.createdAt && ` · Invited ${new Date(p.createdAt.seconds*1000).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}`}
                </div>
              </div>
              <span style={{ fontSize:11,fontWeight:600,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--gold-dark)',background:'var(--gold-card)',padding:'4px 10px',borderRadius:20 }}>Awaiting activation</span>
              <button className="btn-ghost" style={{ fontSize:12 }} onClick={() => resendInvite(p)}>Resend</button>
              <button onClick={() => deletePending(p.id)} style={{ background:'none',border:'none',cursor:'pointer',color:'var(--text-muted)',fontSize:18,padding:'0 4px',lineHeight:1 }} title="Remove">×</button>
            </div>
          ))}
        </div>
      )}

      {tab === 'listings' && (
        <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
          {listings.length === 0 && <div className="card" style={{ textAlign:'center',padding:40,color:'var(--text-muted)' }}>No listings pushed yet.</div>}
          {listings.map(l => {
            const client = clients.find(c => c.id===l.clientId);
            const statusClass = l.status==='viewing'?'pill-viewing':l.clientResponse==='yes'?'pill-want':l.clientResponse==='no'?'pill-pass':'pill-new';
            const statusLabel = l.status==='viewing'?'Viewing scheduled':l.clientResponse==='yes'?'Client wants to view':l.clientResponse==='no'?'Not interested':'Awaiting response';
            return (
              <div key={l.id} style={{ background:'var(--card-bg)',borderRadius:12,padding:'14px 18px',display:'flex',alignItems:'flex-start',gap:14 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14,fontWeight:700 }}>{l.address}</div>
                  <div style={{ fontSize:12,color:'var(--text-muted)',marginTop:2 }}>{[l.area,l.size,l.beds&&`${l.beds} beds`,l.furnishing,l.availableFrom].filter(Boolean).join(' · ')}{l.price&&` · €${l.price.toLocaleString()}/mo`}</div>
                  <div style={{ fontSize:12,color:'var(--text-muted)',marginTop:4 }}>Client: <strong>{client?.name||l.clientId}</strong>{l.noReasons?.length>0&&` · Feedback: ${l.noReasons.join(', ')}`}</div>
                </div>
                <div style={{ display:'flex',flexDirection:'column',alignItems:'flex-end',gap:8 }}>
                  <span className={`pill ${statusClass}`}>{statusLabel}</span>
                  {l.clientResponse==='yes'&&l.status!=='viewing'&&(
                    <button className="btn-primary" style={{ fontSize:11,padding:'5px 12px' }} onClick={() => updateListingStatus(l.id,'viewing')}>Schedule viewing</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showNewClient && <NewClientModal onClose={() => setShowNewClient(false)} onCreated={fetchAll}/>}
      {showNewListing && <NewListingModal clients={clients} onClose={() => setShowNewListing(false)} onCreated={fetchAll}/>}
    </div>
  );
}
