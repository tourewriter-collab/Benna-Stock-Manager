import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import Orders from './pages/Orders';
import OrderDetail from './pages/OrderDetail';
import CreateOrder from './pages/CreateOrder';
import UsageReports from './pages/UsageReports';
import TruckGranite from './pages/TruckGranite';
import AdminUsers from './pages/AdminUsers';
import Settings from './pages/Settings';
import AccountingDashboard from './pages/AccountingDashboard';
import Invoices from './pages/Invoices';
import Transactions from './pages/Transactions';
import ChartOfAccounts from './pages/ChartOfAccounts';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import { SyncProvider } from './contexts/SyncContext';

function App() {
  return (
    <AuthProvider>
      <SyncProvider>
        <Router future={{ v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="inventory" element={<Inventory />} />
              <Route path="suppliers" element={<Navigate to="/settings?tab=suppliers" replace />} />
              <Route path="orders" element={<Orders />} />
              <Route path="orders/new" element={<CreateOrder />} />
              <Route path="orders/:id" element={<OrderDetail />} />
              <Route path="usage-reports" element={<UsageReports />} />
              <Route path="fleet" element={<TruckGranite />} />
              <Route
                path="categories"
                element={<Navigate to="/settings?tab=categories" replace />}
              />
              <Route
                path="admin/users"
                element={
                  <ProtectedRoute requiredRole="admin">
                    <AdminUsers />
                  </ProtectedRoute>
                }
              />
              <Route path="settings" element={<Settings />} />
              
              {/* Accounting Module Routes */}
              <Route path="accounting/dashboard" element={<AccountingDashboard />} />
              <Route path="accounting/invoices" element={<Invoices />} />
              <Route path="accounting/transactions" element={<Transactions />} />
              <Route path="accounting/accounts" element={<ChartOfAccounts />} />
            </Route>
          </Routes>
        </Router>
      </SyncProvider>
    </AuthProvider>
  );
}

export default App;
