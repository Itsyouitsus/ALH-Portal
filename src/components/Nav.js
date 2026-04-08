import React from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
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
const AdminIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.07 4.93a10 10 0 010 14.14M4.93 4.93a10 10 0 000 14.14"/>
  </svg>
);

export default function Nav() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isAdmin = profile?.role === 'admin';

  const initials = profile?.name
    ? profile.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : user?.email?.[0]?.toUpperCase() || '?';

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  const mobileLinks = [
    { to: '/', label: 'Home', icon: <HomeIcon /> },
    { to: '/listings', label: 'Listings', icon: <ListIcon /> },
    { to: '/documents', label: 'Docs', icon: <DocIcon /> },
    { to: '/profile', label: 'Profile', icon: <UserIcon /> },
    ...(isAdmin ? [{ to: '/admin', label: 'Admin', icon: <AdminIcon /> }] : []),
  ];

  return (
    <>
      <nav className="nav">
        <NavLink to="/" className="nav-logo">Amsterdam Life Homes</NavLink>
        <div className="nav-links">
          <NavLink to="/" end className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>Home</NavLink>
          <NavLink to="/listings" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>Listings</NavLink>
          <NavLink to="/profile" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>My profile</NavLink>
          <NavLink to="/documents" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>Documents</NavLink>
          {isAdmin && (
            <NavLink to="/admin" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
              Admin <span className="admin-badge">Admin</span>
            </NavLink>
          )}
        </div>
        <div className="nav-right">
          <div className="nav-avatar">{initials}</div>
          <button className="nav-logout" onClick={handleLogout}>Logout</button>
        </div>
      </nav>

      <nav className="mobile-nav">
        {mobileLinks.map(link => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === '/'}
            className={({ isActive }) => 'mobile-nav-item' + (isActive ? ' active' : '')}
          >
            {link.icon}
            {link.label}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
