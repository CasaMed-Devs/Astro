import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { AstrologersPage } from './pages/AstrologersPage';
import { PricingPage } from './pages/PricingPage';
import { UsersPage } from './pages/UsersPage';
import { AccessSettingsPage } from './pages/AccessSettingsPage';
import { ActivityLogPage } from './pages/ActivityLogPage';
import { RequireAuth } from './components/RequireAuth';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/astrologers"
          element={
            <RequireAuth>
              <AstrologersPage />
            </RequireAuth>
          }
        />
        <Route
          path="/pricing"
          element={
            <RequireAuth>
              <PricingPage />
            </RequireAuth>
          }
        />
        <Route
          path="/users"
          element={
            <RequireAuth>
              <UsersPage />
            </RequireAuth>
          }
        />
        <Route
          path="/access"
          element={
            <RequireAuth>
              <AccessSettingsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/activity"
          element={
            <RequireAuth>
              <ActivityLogPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/astrologers" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
