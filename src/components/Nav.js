import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../hooks/useAuth';

const HomeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/>
    <path d="M9 21V12h6v9"/>
  </svg>
);
const ListIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="3" y="4" width="18" height="4" rx="1"/>
    <rect x="3" y="10" width="18" height="4" rx="1"/>
    <rect x="3" y="16" width="18" height="4" rx="1"/>
  </svg>
);
const DocIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="8" y1="13" x2="16" y2="13"/>
    <line x1="8" y1="17" x2="12" y2="17"/>
  </svg>
);
const UserIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
);
const EyeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);

const link = ({ isActive }) => 'nav-link' + (isActive ? ' active' : '');

export default function Nav() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const isAdmin = profile?.role === 'admin';

  const initials = profile?.name
    ? profile.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : user?.email?.[0]?.toUpperCase() || '?';

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  const adminDesktopLinks = [
    { to: '/admin', label: 'Clients', end: false },
  ];

  const clientDesktopLinks = [
    { to: '/', label: 'Home', end: true },
    { to: '/listings', label: 'Listings', end: false },
    { to: '/profile', label: 'My profile', end: false },
    { to: '/documents', label: 'Documents', end: false },
    { to: '/renting-preview', label: 'Renting ✦', end: false },
  ];

  const clientMobileLinks = [
    { to: '/', label: 'Home', icon: <HomeIcon />, end: true },
    { to: '/listings', label: 'Listings', icon: <ListIcon />, end: false },
    { to: '/documents', label: 'Docs', icon: <DocIcon />, end: false },
    { to: '/profile', label: 'Profile', icon: <UserIcon />, end: false },
    { to: '/renting-preview', label: 'Preview', icon: <EyeIcon />, end: false },
  ];

  return (
    <>
      <nav className="nav">
        <NavLink to={isAdmin ? '/admin' : '/'} className="nav-logo">Amsterdam Life Homes</NavLink>

        <div className="nav-links">
          {isAdmin ? (
            <NavLink to="/admin" className={link}>Admin panel</NavLink>
          ) : (
            clientDesktopLinks.map(l => (
              <NavLink key={l.to} to={l.to} end={l.end} className={link}>{l.label}</NavLink>
            ))
          )}
        </div>

        <div className="nav-right">
          <div className="nav-avatar">{initials}</div>
          <button className="nav-logout" onClick={handleLogout}>Logout</button>
        </div>
      </nav>

      {!isAdmin && (
        <nav className="mobile-nav">
          {clientMobileLinks.map(l => (
            <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => 'mobile-nav-item' + (isActive ? ' active' : '')}>
              {l.icon}
              {l.label}
            </NavLink>
          ))}
        </nav>
      )}
    </>
  );
}
