import React, { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { db } from '../firebase';
import { collection, getDocs, doc, setDoc, addDoc, updateDoc, deleteDoc,
         serverTimestamp, orderBy, query } from 'firebase/firestore';

const WORKER_URL = 'https://alh-email-worker.home-f67.workers.dev/';

// Generate magic link without sending email — returns the raw URL
async function generateMagicLink(email) {
  const res = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, isInvite: true, linkOnly: true }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to generate link');
  return data.link;
}

// ── CopyLinkPanel — shown inline in client row after generating ──────────────
function CopyLinkPanel({ link, onClose }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div style={{ marginTop:10,background:'var(--gold-card)',borderRadius:10,padding:'12px 14px',border:'1px solid var(--gold)' }}>
      <div style={{ fontSize:11,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.07em',color:'var(--text-muted)',marginBottom:6 }}>
        Portal link — copy and paste into your email
      </div>
      <div style={{ display:'flex',gap:8,alignItems:'center' }}>
        <input
          readOnly
          value={link}
          onClick={e => e.target.select()}
          style={{ flex:1,fontSize:11,background:'var(--card-bg)',border:'1px solid var(--gold-mid)',borderRadius:6,padding:'7px 10px',fontFamily:'monospace',color:'var(--near-black)',minWidth:0 }}
        />
        <button className="btn-primary" style={{ fontSize:12,padding:'7px 14px',whiteSpace:'nowrap',flexShrink:0 }} onClick={copy}>
          {copied ? '✓ Copied' : 'Copy link'}
        </button>
        <button onClick={onClose} style={{ background:'none',border:'none',cursor:'pointer',color:'var(--text-muted)',fontSize:18,padding:'0 4px',lineHeight:1 }}>×</button>
      </div>
      <div style={{ fontSize:11,color:'var(--text-muted)',marginTop:6 }}>
        This link expires in 24 hours. Generate a new one if needed.
      </div>
    </div>
  );
}

// ── NewClientModal — creates draft profile, no invite sent ───────────────────
function NewClientModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    name: '', email: '', email2: '',
    phone: '', maxRent: '', moveIn: '', minSize: '',
    from: '', employer1: '', contract1: '', salary1: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleCreate = async () => {
    if (!form.name || !form.email) return;
    setSaving(true);
    setError('');
    try {
      const emails = [form.email, form.email2].filter(Boolean);
      const clientRef = doc(collection(db, 'users'));
      await setDoc(clientRef, {
        name: form.name,
        email: form.email,
        allEmails: emails,
        phone: form.phone,
        maxRent: form.maxRent,
        moveIn: form.moveIn,
        minSize: form.minSize,
        from: form.from,
        employer1: form.employer1,
        contract1: form.contract1,
        salary1: form.salary1,
        notes: form.notes,
        role: 'client',
        status: 'draft',        // draft = profile created, no invite sent yet
        inviteSent: false,
        createdAt: serverTimestamp(),
        searchStarted: new Date().toISOString().split('T')[0],
        // No Firebase Auth uid yet — will be merged on first sign-in
        draftId: clientRef.id,
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err.message || 'Something went wrong');
    }
    setSaving(false);
  };

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(26,22,18,0.55)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:500,padding:24,overflowY:'auto' }} onClick={onClose}>
      <div style={{ background:'var(--gold-bg)',borderRadius:16,padding:'32px 28px',width:'100%',maxWidth:520,margin:'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize:20,fontWeight:700,marginBottom:4 }}>New client profile</div>
        <div style={{ fontSize:13,color:'var(--text-muted)',marginBottom:20 }}>Fill in during video call. No invite is sent until you generate a portal link.</div>

        <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10 }}>
          <div className="field" style={{ gridColumn:'1/-1' }}>
            <label>Full name(s) <span style={{ color:'var(--danger)' }}>*</span></label>
            <input value={form.name} onChange={e => set('name',e.target.value)} placeholder="Sarah & James Collins"/>
          </div>
          <div className="field">
            <label>Primary email <span style={{ color:'var(--danger)' }}>*</span></label>
            <input type="email" value={form.email} onChange={e => set('email',e.target.value)} placeholder="client@example.com"/>
          </div>
          <div className="field">
            <label>Second email <span style={{ fontWeight:400,color:'var(--text-muted)' }}>(optional)</span></label>
            <input type="email" value={form.email2} onChange={e => set('email2',e.target.value)} placeholder="partner@example.com"/>
          </div>
          <div className="field">
            <label>Phone</label>
            <input value={form.phone} onChange={e => set('phone',e.target.value)} placeholder="+31 6 ..."/>
          </div>
          <div className="field">
            <label>Originally from</label>
            <input value={form.from} onChange={e => set('from',e.target.value)} placeholder="Country / city"/>
          </div>
          <div className="field">
            <label>Max rent (€/month)</label>
            <input value={form.maxRent} onChange={e => set('maxRent',e.target.value)} placeholder="3,000"/>
          </div>
          <div className="field">
            <label>Move-in date</label>
            <input type="date" value={form.moveIn} onChange={e => set('moveIn',e.target.value)}/>
          </div>
          <div className="field">
            <label>Employer</label>
            <input value={form.employer1} onChange={e => set('employer1',e.target.value)} placeholder="Company name"/>
          </div>
          <div className="field">
            <label>Contract type</label>
            <select value={form.contract1} onChange={e => set('contract1',e.target.value)}>
              <option value="">Select</option>
              {['Permanent','Temporary','Freelance'].map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Gross salary (€/month)</label>
            <input type="number" value={form.salary1} onChange={e => set('salary1',e.target.value)} placeholder="5000"/>
          </div>
          <div className="field">
            <label>Min size (m²)</label>
            <input type="number" value={form.minSize} onChange={e => set('minSize',e.target.value)} placeholder="70"/>
          </div>
          <div className="field" style={{ gridColumn:'1/-1' }}>
            <label>Notes from video call</label>
            <textarea value={form.notes} onChange={e => set('notes',e.target.value)}
              placeholder="Key things from the call..." rows={3}
              style={{ width:'100%',background:'var(--gold-bg)',border:'1px solid var(--gold-mid)',borderRadius:7,padding:'9px 12px',fontSize:13,resize:'vertical',fontFamily:"'DM Sans',sans-serif" }}/>
          </div>
        </div>

        {error && <div style={{ fontSize:13,color:'var(--danger)',marginBottom:12,marginTop:4 }}>{error}</div>}
        <div style={{ fontSize:12,color:'var(--text-muted)',marginBottom:16,marginTop:8,background:'var(--gold-card)',borderRadius:8,padding:'8px 12px' }}>
          ℹ️ No email will be sent. After the call, use "Generate link" on the client row to get a portal link to include in your follow-up email.
        </div>
        <div style={{ display:'flex',gap:10 }}>
          <button className="btn-ghost" onClick={onClose} style={{ flex:1 }}>Cancel</button>
          <button className="btn-primary" onClick={handleCreate} disabled={!form.name||!form.email||saving} style={{ flex:1 }}>
            {saving ? 'Saving...' : 'Save profile'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── NewListingModal (unchanged) ───────────────────────────────────────────────
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

// ── Main Admin component ──────────────────────────────────────────────────────
export default function Admin() {
  const { profile } = useAuth();
  const [tab, setTab] = useState('clients');
  const [clients, setClients] = useState([]);
  const [listings, setListings] = useState([]);
  const [showNewClient, setShowNewClient] = useState(false);
  const [showNewListing, setShowNewListing] = useState(false);
  const [loading, setLoading] = useState(true);
  // Per-client link generation state: { [clientId]: { loading, link, error } }
  const [linkState, setLinkState] = useState({});

  if (profile?.role !== 'admin') return <div className="page"><div className="page-title">Access denied</div></div>;

  const fetchAll = async () => {
    const [uSnap, lSnap] = await Promise.all([
      getDocs(collection(db,'users')),
      getDocs(query(collection(db,'listings'), orderBy('createdAt','desc'))),
    ]);
    const allUsers = uSnap.docs.map(d => ({ id:d.id,...d.data() })).filter(u => u.role !== 'admin');
    const allListings = lSnap.docs.map(d => ({ id:d.id,...d.data() }));
    const clientsWithStats = allUsers.map(u => {
      const uL = allListings.filter(l => l.clientId === u.id);
      return { ...u,listingsCount:uL.length,wantCount:uL.filter(l => l.clientResponse==='yes').length,viewingCount:uL.filter(l => l.status==='viewing').length };
    });
    // Sort: active clients first, drafts below
    clientsWithStats.sort((a,b) => {
      if (a.status==='draft' && b.status!=='draft') return 1;
      if (a.status!=='draft' && b.status==='draft') return -1;
      return 0;
    });
    setClients(clientsWithStats);
    setListings(allListings);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const updateListingStatus = async (id, status) => {
    await updateDoc(doc(db,'listings',id), { status });
    setListings(ls => ls.map(l => l.id===id ? { ...l,status } : l));
  };

  const handleGenerateLink = async (client) => {
    // Generate links for all emails on this client
    const emails = client.allEmails?.length ? client.allEmails : [client.email];
    setLinkState(s => ({ ...s, [client.id]: { loading: true, links: null, error: null } }));
    try {
      const links = [];
      for (const email of emails) {
        const link = await generateMagicLink(email);
        links.push({ email, link });
      }
      setLinkState(s => ({ ...s, [client.id]: { loading: false, links, error: null } }));
      // Mark inviteSent on the client doc
      await updateDoc(doc(db,'users',client.id), { inviteSent: true, inviteSentAt: serverTimestamp() });
      setClients(cs => cs.map(c => c.id===client.id ? { ...c,inviteSent:true } : c));
    } catch (err) {
      setLinkState(s => ({ ...s, [client.id]: { loading: false, links: null, error: err.message } }));
    }
  };

  const closeLinkPanel = (clientId) => {
    setLinkState(s => ({ ...s, [clientId]: null }));
  };

  if (loading) return <div className="loading-screen">Loading admin panel...</div>;

  const draftCount = clients.filter(c => c.status==='draft').length;
  const activeCount = clients.filter(c => c.status!=='draft').length;
  const TABS = [['clients',`Clients (${clients.length})`],['listings','All listings']];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Admin panel</div>
          <div className="page-sub">{activeCount} active · {draftCount} draft · {listings.length} listings</div>
        </div>
        <div style={{ display:'flex',gap:10 }}>
          <button className="btn-ghost" onClick={() => setShowNewClient(true)}>+ Add client</button>
          <button className="btn-primary" onClick={() => setShowNewListing(true)}>+ Push listing</button>
        </div>
      </div>

      <div style={{ display:'flex',gap:4,marginBottom:24,background:'var(--card-bg)',borderRadius:10,padding:4,maxWidth:360 }}>
        {TABS.map(([v,l]) => (
          <button key={v} onClick={() => setTab(v)} style={{ flex:1,padding:'9px 16px',borderRadius:7,fontSize:13,fontWeight:500,cursor:'pointer',border:'none',fontFamily:"'DM Sans', sans-serif",background:tab===v?'var(--near-black)':'transparent',color:tab===v?'var(--gold-bg)':'var(--text-muted)',transition:'all 0.15s' }}>{l}</button>
        ))}
      </div>

      {tab === 'clients' && (
        <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
          {clients.length === 0 && <div className="card" style={{ textAlign:'center',padding:40,color:'var(--text-muted)' }}>No clients yet. Add your first client above.</div>}

          {clients.map(c => {
            const isDraft = c.status === 'draft';
            const ls = linkState[c.id];
            return (
              <div key={c.id} style={{ background:'var(--card-bg)',borderRadius:12,padding:'16px 20px',borderLeft:`4px solid ${isDraft ? 'var(--gold-mid)' : 'var(--gold)'}` }}>
                <div style={{ display:'flex',alignItems:'center',gap:16 }}>
                  {/* Avatar */}
                  <div style={{ width:40,height:40,borderRadius:'50%',background:isDraft?'var(--gold-mid)':'var(--gold)',color:'var(--gold-deeper)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:13,flexShrink:0 }}>
                    {c.name?.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase()||'?'}
                  </div>

                  {/* Name + email */}
                  <div style={{ flex:1,minWidth:0 }}>
                    <div style={{ display:'flex',alignItems:'center',gap:8 }}>
                      <div style={{ fontSize:14,fontWeight:700 }}>{c.name||c.email}</div>
                      {isDraft && (
                        <span style={{ fontSize:10,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',background:'var(--gold-card)',color:'var(--gold-dark)',padding:'2px 8px',borderRadius:20 }}>Draft</span>
                      )}
                      {!isDraft && c.inviteSent && (
                        <span style={{ fontSize:10,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',background:'var(--success-bg)',color:'var(--success)',padding:'2px 8px',borderRadius:20 }}>Active</span>
                      )}
                    </div>
                    <div style={{ fontSize:12,color:'var(--text-muted)',marginTop:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>
                      {c.email}
                      {c.allEmails?.length > 1 && <span style={{ marginLeft:6,color:'var(--text-muted)' }}>+{c.allEmails.length-1}</span>}
                      {c.maxRent && ` · Budget ${c.maxRent}`}
                      {c.searchStarted && ` · Started ${c.searchStarted}`}
                    </div>
                  </div>

                  {/* Stats — only for active clients */}
                  {!isDraft && (
                    <div style={{ display:'flex',gap:20 }}>
                      {[[c.listingsCount||0,'Found'],[c.wantCount||0,'Want'],[c.viewingCount||0,'Viewing']].map(([val,label]) => (
                        <div key={label} style={{ textAlign:'center' }}>
                          <div style={{ fontSize:18,fontWeight:700,color:label==='Want'?'var(--success)':label==='Viewing'?'var(--blue)':'var(--near-black)' }}>{val}</div>
                          <div style={{ fontSize:10,textTransform:'uppercase',letterSpacing:'0.05em',color:'var(--text-muted)' }}>{label}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{ display:'flex',gap:8,flexShrink:0 }}>
                    {isDraft ? (
                      <button
                        className="btn-primary"
                        style={{ fontSize:12,padding:'7px 14px' }}
                        disabled={ls?.loading}
                        onClick={() => handleGenerateLink(c)}
                      >
                        {ls?.loading ? 'Generating...' : c.inviteSent ? 'New link' : 'Generate link'}
                      </button>
                    ) : (
                      <>
                        <button
                          className="btn-ghost"
                          style={{ fontSize:12 }}
                          disabled={ls?.loading}
                          onClick={() => handleGenerateLink(c)}
                        >
                          {ls?.loading ? '...' : 'New link'}
                        </button>
                        <button className="btn-ghost" style={{ fontSize:12 }}>Open portal</button>
                      </>
                    )}
                  </div>
                </div>

                {/* Link panel — shown below the row after generating */}
                {ls?.links && ls.links.map(({ email, link }) => (
                  <div key={email} style={{ marginTop:email===ls.links[0].email?10:6 }}>
                    {ls.links.length > 1 && (
                      <div style={{ fontSize:11,color:'var(--text-muted)',marginBottom:4 }}>{email}</div>
                    )}
                    <CopyLinkPanel link={link} onClose={() => closeLinkPanel(c.id)}/>
                  </div>
                ))}
                {ls?.error && (
                  <div style={{ marginTop:8,fontSize:13,color:'var(--danger)' }}>Error: {ls.error}</div>
                )}
              </div>
            );
          })}
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
