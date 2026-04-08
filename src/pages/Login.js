import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { isSignInWithEmailLink, signInWithEmailLink } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../hooks/useAuth';

const WORKER_URL = 'https://alh-email-worker.home-f67.workers.dev/';
const FIREBASE_API_KEY = 'AIzaSyAhIlt30p-huvswMLh3OOvsNrHwWR8LeEI';
const PORTAL_URL = 'https://itsyouitsus.github.io/ALH-Portal/#/login';

// Get magic link from Firebase REST API (returnOobLink:true skips Firebase's own email)
async function getMagicLink(email) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestType: 'EMAIL_SIGNIN',
        email,
        continueUrl: PORTAL_URL,
        returnOobLink: true,
      }),
    }
  );
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.oobLink;
}

async function sendBrandedEmail(email, magicLink, isInvite = false) {
  const html = `
    <!DOCTYPE html><html><head><meta charset="utf-8"></head>
    <body style="margin:0;padding:0;background:#f7f5f0;font-family:'Helvetica Neue',Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f5f0;padding:40px 20px;">
        <tr><td align="center">
          <table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;">
            <tr><td style="background:#0f0f0d;padding:32px 40px;text-align:center;">
              <div style="font-family:Georgia,serif;font-size:22px;color:#c9a96e;letter-spacing:0.04em;">Amsterdam Life Homes</div>
              <div style="font-size:12px;color:rgba(247,245,240,0.5);margin-top:4px;letter-spacing:0.08em;text-transform:uppercase;">Your personal housing portal</div>
            </td></tr>
            <tr><td style="padding:40px 40px 32px;">
              <p style="font-size:15px;color:#555;line-height:1.6;margin:0 0 24px;">
                ${isInvite
                  ? 'We have set up your personal housing portal. Click the button below to activate it and see the properties we have lined up for you.'
                  : 'Here is your sign-in link for the Amsterdam Life Homes portal. No password needed.'}
              </p>
              <div style="text-align:center;margin:32px 0;">
                <a href="${magicLink}" style="display:inline-block;background:#0f0f0d;color:#c9a96e;text-decoration:none;font-size:14px;font-weight:600;letter-spacing:0.06em;padding:16px 36px;border-radius:6px;">
                  ${isInvite ? 'Open my portal' : 'Sign in to my portal'}
                </a>
              </div>
              <p style="font-size:13px;color:#999;line-height:1.6;margin:0;">
                This link expires in 24 hours and can only be used once.<br>
                If you did not expect this email, you can safely ignore it.
              </p>
            </td></tr>
            <tr><td style="background:#f7f5f0;padding:24px 40px;border-top:1px solid #e8e4dc;text-align:center;">
              <p style="font-size:12px;color:#aaa;margin:0;">Amsterdam Life Homes &nbsp;·&nbsp; <a href="mailto:home@amsterdamlifehomes.com" style="color:#aaa;">home@amsterdamlifehomes.com</a></p>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </body></html>
  `;
  await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: email,
      subject: isInvite ? 'Your Amsterdam Life Homes portal is ready' : 'Sign in to Amsterdam Life Homes',
      html,
    }),
  });
}

// Exported for use in Admin.js
export { getMagicLink, sendBrandedEmail };

// In-app email confirm card — replaces the browser window.prompt
function EmailConfirmCard({ onConfirm }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!email) return;
    setLoading(true);
    setError('');
    try {
      await onConfirm(email);
    } catch {
      setError('That email does not match the one used to request this link. Please try again.');
      setLoading(false);
    }
  };

  return (
    <>
      <div style={{ fontSize:18,fontWeight:600,marginBottom:8 }}>Confirm your email</div>
      <div style={{ fontSize:13,color:'var(--text-muted)',marginBottom:24,lineHeight:1.5 }}>
        It looks like you opened this link on a different device or browser. Enter the email address you used to request the link to continue.
      </div>
      <div className="field" style={{ textAlign:'left' }}>
        <label>Email address</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" autoFocus onKeyDown={e => e.key==='Enter' && handleSubmit()}/>
      </div>
      {error && <div style={{ fontSize:13,color:'var(--danger)',marginTop:8,textAlign:'left' }}>{error}</div>}
      <button className="btn-primary" onClick={handleSubmit} disabled={!email||loading} style={{ width:'100%',marginTop:20,padding:'12px 20px',fontSize:14 }}>
        {loading ? 'Signing you in...' : 'Continue'}
      </button>
    </>
  );
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) { navigate('/'); return; }
    if (isSignInWithEmailLink(auth, window.location.href)) {
      const storedEmail = window.localStorage.getItem('alhLoginEmail');
      if (storedEmail) {
        setLoading(true);
        signInWithEmailLink(auth, storedEmail, window.location.href)
          .then(() => { window.localStorage.removeItem('alhLoginEmail'); navigate('/'); })
          .catch(() => { setError('Link expired or invalid. Please request a new one.'); setLoading(false); });
      } else {
        setNeedsConfirm(true);
      }
    }
  }, [user, navigate]);

  const handleConfirmEmail = async (confirmedEmail) => {
    await signInWithEmailLink(auth, confirmedEmail, window.location.href);
    window.localStorage.removeItem('alhLoginEmail');
    navigate('/');
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError('');
    try {
      const link = await getMagicLink(email);
      await sendBrandedEmail(email, link, false);
      window.localStorage.setItem('alhLoginEmail', email);
      setSent(true);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight:'100vh',background:'var(--gold-bg)',display:'flex',alignItems:'center',justifyContent:'center',padding:'24px' }}>
      <div style={{ width:'100%',maxWidth:420,textAlign:'center' }}>
        <div style={{ fontFamily:"'Cormorant Garamond', serif",fontSize:32,fontWeight:500,color:'var(--near-black)',marginBottom:6 }}>Amsterdam Life Homes</div>
        <div style={{ fontSize:14,color:'var(--text-muted)',marginBottom:40 }}>Your personal housing search portal</div>
        <div style={{ background:'var(--card-bg)',borderRadius:16,padding:'36px 32px' }}>
          {loading && !needsConfirm ? (
            <div style={{ color:'var(--text-muted)',fontSize:15 }}>Signing you in...</div>
          ) : needsConfirm ? (
            <EmailConfirmCard onConfirm={handleConfirmEmail}/>
          ) : sent ? (
            <>
              <div style={{ fontSize:36,marginBottom:16 }}>✉️</div>
              <div style={{ fontSize:17,fontWeight:600,marginBottom:8 }}>Check your inbox</div>
              <div style={{ fontSize:14,color:'var(--text-muted)',lineHeight:1.6 }}>
                We sent a sign-in link to <strong>{email}</strong>.<br/>Click it to open your portal.
              </div>
              <button onClick={() => setSent(false)} style={{ marginTop:24,background:'none',border:'none',color:'var(--gold-dark)',fontSize:13,cursor:'pointer',textDecoration:'underline' }}>
                Use a different email
              </button>
            </>
          ) : (
            <form onSubmit={handleSend}>
              <div style={{ textAlign:'left',marginBottom:20 }}>
                <div style={{ fontSize:18,fontWeight:600,marginBottom:6 }}>Sign in</div>
                <div style={{ fontSize:13,color:'var(--text-muted)' }}>Enter your email and we will send you a sign-in link.</div>
              </div>
              <div className="field" style={{ textAlign:'left' }}>
                <label>Email address</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" required autoFocus/>
              </div>
              {error && <div style={{ fontSize:13,color:'var(--danger)',marginTop:10,textAlign:'left' }}>{error}</div>}
              <button type="submit" className="btn-primary" style={{ width:'100%',marginTop:20,padding:'12px 20px',fontSize:14 }} disabled={!email}>
                Send sign-in link
              </button>
            </form>
          )}
        </div>
        <div style={{ marginTop:32,fontSize:12,color:'var(--text-light)' }}>
          Access is by invitation only.<br/>Contact your Amsterdam Life Homes agent to get started.
        </div>
      </div>
    </div>
  );
}
