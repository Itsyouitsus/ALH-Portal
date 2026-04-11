import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import Nav from './components/Nav';
import Login from './pages/Login';
import Home from './pages/Home';
import Listings from './pages/Listings';
import Profile from './pages/Profile';
import Documents from './pages/Documents';
import Admin from './pages/Admin';
import './index.css';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen">Amsterdam Life Homes</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AdminRoute({ children }) {
  const { user, profile, loading } = useAuth();
  if (loading) return <div className="loading-screen">Amsterdam Life Homes</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (profile && profile.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

function ClientRoute({ children }) {
  const { user, profile, loading } = useAuth();
  if (loading) return <div className="loading-screen">Amsterdam Life Homes</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (profile && profile.role === 'admin') return <Navigate to="/admin" replace />;
  return children;
}

function AppLayout() {
  const { user, profile, loading } = useAuth();
  if (loading) return <div className="loading-screen">Amsterdam Life Homes</div>;
  if (!user) return null;

  const isAdmin = profile?.role === 'admin';

  return (
    <>
      <Nav />
      <Routes>
        {/* Admin-only routes */}
        <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />

        {/* Client-only routes */}
        <Route path="/"          element={<ClientRoute><Home /></ClientRoute>} />
        <Route path="/listings"  element={<ClientRoute><Listings /></ClientRoute>} />
        <Route path="/profile"   element={<ClientRoute><Profile /></ClientRoute>} />
        <Route path="/documents" element={<ClientRoute><Documents /></ClientRoute>} />

        {/* Fallback — redirect based on role */}
        <Route path="*" element={isAdmin ? <Navigate to="/admin" replace /> : <Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          />
        </Routes>
      </HashRouter>
    </AuthProvider>
  );
}
