import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { autoPullOnce } from './services/attendanceSync';
import { AuthProvider } from './contexts/AuthContext';
import { PermissionsProvider } from './contexts/PermissionsContext';
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
import HumanResources from './pages/HumanResources';
import EmployeePortal from './pages/EmployeePortal';
import EmployeePerformance from './pages/EmployeePerformance';

function App() {
  useEffect(() => { autoPullOnce(); }, []);

  return (
    <AuthProvider>
      <PermissionsProvider>
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
                <Route
                  path="dashboard"
                  element={
                    <ProtectedRoute module="dashboard">
                      <Dashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="inventory"
                  element={
                    <ProtectedRoute module="inventory">
                      <Inventory />
                    </ProtectedRoute>
                  }
                />
                <Route path="suppliers" element={<Navigate to="/settings?tab=suppliers" replace />} />
                <Route
                  path="orders"
                  element={
                    <ProtectedRoute module="orders">
                      <Orders />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="orders/new"
                  element={
                    <ProtectedRoute module="orders">
                      <CreateOrder />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="orders/:id"
                  element={
                    <ProtectedRoute module="orders">
                      <OrderDetail />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="usage-reports"
                  element={
                    <ProtectedRoute module="usage_reports">
                      <UsageReports />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="fleet"
                  element={
                    <ProtectedRoute module="fleet">
                      <TruckGranite />
                    </ProtectedRoute>
                  }
                />
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
                <Route
                  path="settings"
                  element={
                    <ProtectedRoute module="settings">
                      <Settings />
                    </ProtectedRoute>
                  }
                />
                
                {/* Accounting Module Routes */}
                <Route
                  path="accounting/dashboard"
                  element={
                    <ProtectedRoute module="accounting">
                      <AccountingDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="accounting/invoices"
                  element={
                    <ProtectedRoute module="accounting">
                      <Invoices />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="accounting/transactions"
                  element={
                    <ProtectedRoute module="accounting">
                      <Transactions />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="accounting/accounts"
                  element={
                    <ProtectedRoute module="accounting">
                      <ChartOfAccounts />
                    </ProtectedRoute>
                  }
                />
                
                {/* HR Module Routes */}
                <Route
                  path="hr"
                  element={
                    <ProtectedRoute module="hr">
                      <HumanResources />
                    </ProtectedRoute>
                  }
                />

                {/* Employee Portal / My Tasks Route — lives under HR */}
                <Route
                  path="hr/my-tasks"
                  element={
                    <ProtectedRoute module="employee_portal">
                      <EmployeePortal />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="hr/my-performance"
                  element={
                    <ProtectedRoute module="employee_portal">
                      <EmployeePerformance />
                    </ProtectedRoute>
                  }
                />
              </Route>
            </Routes>
          </Router>
        </SyncProvider>
      </PermissionsProvider>
    </AuthProvider>
  );
}

export default App;
