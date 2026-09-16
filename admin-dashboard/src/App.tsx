import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { AstrologersPage } from './pages/AstrologersPage';
import { PricingPage } from './pages/PricingPage';
import { UsersPage } from './pages/UsersPage';
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
        <Route path="*" element={<Navigate to="/astrologers" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
