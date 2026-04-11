import React, { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { db } from '../firebase';
import { collection, query, where, getDocs, doc, setDoc, serverTimestamp } from 'firebase/firestore';

const DOCUMENT_TYPES = [
  { id: 'passport', name: 'Copy of passport(s)', hint: 'Photo page, clearly visible, not expired', employed: true, self: true },
  { id: 'contract', name: 'Employment contract', hint: 'Full contract including any extension clauses', employed: true, self: false },
  { id: 'intro_letter', name: 'Introduction letter + photo', hint: 'One-pager PDF, written personally to the landlord', employed: true, self: true },
  { id: 'extend_letter', name: "Employer's letter of intent to extend", hint: 'Only needed for temporary contracts', employed: true, self: false },
  { id: 'employer_statement', name: "Employer's statement", hint: 'Required if contract is older than 6 months', employed: true, self: false },
  { id: 'payslips', name: 'Last 3 payslips', hint: 'Only needed if you have already received salary', employed: true, self: false },
  { id: 'bank_salary', name: 'Bank statement showing salary (3 months)', hint: 'Only needed if you have already received salary', employed: true, self: false },
  { id: 'work_permit', name: 'Work permit or employer permission', hint: 'Required for non-EU / non-Schengen zone nationals', employed: true, self: false },
  { id: 'tax_ruling', name: '30% tax ruling approval', hint: 'Only if you are entitled to the ruling', employed: true, self: false },
  { id: 'brp', name: 'BRP registration', hint: 'Only if you already live in the Netherlands', employed: true, self: true },
  { id: 'hr_contact', name: 'HR contact details', hint: 'Phone and email of your HR department', employed: true, self: false },
  { id: 'address', name: 'Current full home address', hint: 'Your current official residential address', employed: true, self: true },
  { id: 'bank_card', name: 'Bank card copy (front + back)', hint: 'Debit card only — the account that will pay rent', employed: true, self: true },
  { id: 'bank_account', name: 'Bank account number', hint: 'For initial payment a foreign account is accepted', employed: true, self: true },
  { id: 'landlord_ref', name: 'Previous landlord statement', hint: 'Proof you have been a good tenant or homeowner', employed: true, self: true },
  { id: 'kvk', name: 'Business registration (KvK)', hint: 'Company must be at least 2 years old', employed: false, self: true },
  { id: 'pnl', name: 'P&L / accountant income statement (2 years)', hint: 'Signed by a registered accountant', employed: false, self: true },
];

export default function Documents() {
  const { user } = useAuth();
  const [empMode, setEmpMode] = useState('employed');
  const [records, setRecords] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    getDocs(query(collection(db, 'documents'), where('clientId', '==', user.uid))).then(snap => {
      const r = {};
      snap.docs.forEach(d => { r[d.data().docTypeId] = d.data(); });
      setRecords(r);
      setLoading(false);
    });
  }, [user]);

  const handleToggle = async (docTypeId, value) => {
    const ref = doc(db, 'documents', `${user.uid}_${docTypeId}`);
    await setDoc(ref, { clientId: user.uid, docTypeId, ready: value, updatedAt: serverTimestamp() }, { merge: true });
    setRecords(r => ({ ...r, [docTypeId]: { ...r[docTypeId], ready: value } }));
  };

  const relevant = DOCUMENT_TYPES.filter(d =>
    empMode === 'employed' ? d.employed : empMode === 'self' ? d.self : d.employed || d.self
  );
  const done = relevant.filter(d => records[d.id]?.ready).length;
  const approved = relevant.filter(d => records[d.id]?.adminApproved === true).length;
  const pct = relevant.length ? Math.round(done / relevant.length * 100) : 0;

  if (loading) return <div className="loading-screen">Loading documents...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Documents</div>
          <div className="page-sub">Track which documents are ready to send to your agent</div>
        </div>
      </div>

      {/* Employment type toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {[['employed', 'Employed'], ['self', 'Self-employed'], ['both', 'Both']].map(([v, l]) => (
          <button key={v} onClick={() => setEmpMode(v)} style={{
            padding: '9px 22px', borderRadius: 8, border: '1.5px solid',
            borderColor: empMode === v ? 'var(--near-black)' : 'var(--gold-mid)',
            background: empMode === v ? 'var(--near-black)' : 'var(--card-bg)',
            color: empMode === v ? 'var(--gold-bg)' : 'var(--text-muted)',
            fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
            fontWeight: 500, transition: 'all 0.15s',
          }}>{l}</button>
        ))}
      </div>

      {/* Progress bar */}
      <div style={{ background: 'var(--card-bg)', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{done} of {relevant.length} marked ready</span>
            {approved > 0 && <span style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600 }}>✓ {approved} approved by agent</span>}
          </div>
          <div style={{ height: 6, background: 'var(--gold-mid)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: pct + '%', background: 'var(--gold)', borderRadius: 3, transition: 'width 0.4s' }} />
          </div>
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--near-black)' }}>{pct}%</div>
      </div>

      {/* Document list */}
      <div style={{ background: 'var(--card-bg)', borderRadius: 14, overflow: 'hidden', marginBottom: 16 }}>
        {relevant.map((dt, idx) => {
          const rec = records[dt.id] || {};
          const isReady = !!rec.ready;
          const isApproved = rec.adminApproved === true;
          const isRejected = rec.adminApproved === false;

          return (
            <div key={dt.id}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 20px', borderBottom: idx < relevant.length - 1 ? '1px solid var(--gold-bg)' : 'none', cursor: isApproved ? 'default' : 'pointer', background: isApproved ? 'var(--success-bg)' : isRejected ? 'var(--danger-bg)' : 'transparent', transition: 'background 0.15s' }}
              onClick={() => !isApproved && handleToggle(dt.id, !isReady)}
              onMouseEnter={e => { if (!isApproved) e.currentTarget.style.background = isRejected ? 'var(--danger-bg)' : 'var(--gold-card)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = isApproved ? 'var(--success-bg)' : isRejected ? 'var(--danger-bg)' : 'transparent'; }}
            >
              {/* Checkbox */}
              <div style={{ width: 22, height: 22, borderRadius: 5, flexShrink: 0, marginTop: 1, border: `2px solid ${isApproved ? 'var(--success)' : isReady ? 'var(--near-black)' : 'var(--gold)'}`, background: isApproved ? 'var(--success)' : isReady ? 'var(--near-black)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
                {(isReady || isApproved) && <svg width="11" height="9" viewBox="0 0 11 9" fill="none"><path d="M1 4L4 7.5L10 1" stroke="#f5edd9" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: isApproved ? 'var(--success)' : isReady ? 'var(--text-muted)' : 'var(--near-black)', textDecoration: isReady && !isApproved ? 'line-through' : 'none' }}>
                  {dt.name}
                </div>
                {dt.hint && !isApproved && (
                  <div style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 2, lineHeight: 1.4 }}>{dt.hint}</div>
                )}
                {/* Agent feedback */}
                {isApproved && (
                  <div style={{ fontSize: 12, color: 'var(--success)', marginTop: 3, fontWeight: 600 }}>✓ Approved by your agent</div>
                )}
                {isRejected && rec.adminComment && (
                  <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4, lineHeight: 1.5 }}>
                    <strong>Agent comment:</strong> {rec.adminComment}
                  </div>
                )}
              </div>

              {/* Status badge */}
              <span style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 20, whiteSpace: 'nowrap', flexShrink: 0, background: isApproved ? 'var(--success)' : isRejected ? 'var(--danger)' : isReady ? 'var(--success-bg)' : 'var(--gold-card)', color: isApproved ? 'white' : isRejected ? 'white' : isReady ? 'var(--success)' : 'var(--gold-dark)' }}>
                {isApproved ? '✓ Approved' : isRejected ? '✕ Needs revision' : isReady ? '✓ Ready' : 'Mark ready'}
              </span>
            </div>
          );
        })}
      </div>

      {/* Notes */}
      <div style={{ background: 'var(--card-bg)', borderRadius: 14, padding: '18px 22px' }}>
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 10 }}>Important notes</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.9 }}>
          1) Municipal taxes: approx. €50/month (single) or €70/month per household.<br />
          2) The landlord may increase rent once per year per the legal index.<br />
          3) Send documents to <strong style={{ color: 'var(--near-black)' }}>home@amsterdamlifehomes.com</strong> — your agent will confirm receipt.
        </div>
      </div>
    </div>
  );
}
