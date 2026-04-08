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

function AppLayout() {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen">Amsterdam Life Homes</div>;
  if (!user) return null;
  return (
    <>
      <Nav />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/listings" element={<Listings />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/documents" element={<Documents />} />
        <Route path="/admin" element={<Admin />} />
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
