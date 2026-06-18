import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, CreditCard as Edit, Trash2, Shield, Key, X } from 'lucide-react';
import { fetchApi } from '../lib/api';
import { useSync } from '../contexts/SyncContext';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  created_at: string;
}

interface UserPermission {
  module: string;
  action: string;
  allowed: boolean;
}

const MODULES = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'orders', label: 'Orders' },
  { key: 'usage_reports', label: 'Usage Reports' },
  { key: 'fleet', label: 'Fleet' },
  { key: 'accounting', label: 'Accounting' },
  { key: 'hr', label: 'Human Resources' },
  { key: 'settings', label: 'Settings' },
  { key: 'employee_portal', label: 'Employee Tasks Portal' }
];

const ACTIONS = [
  { key: 'view', label: 'View' },
  { key: 'create', label: 'Create' },
  { key: 'edit', label: 'Edit' },
  { key: 'delete', label: 'Delete' }
];

const AdminUsers: React.FC = () => {
  const { t } = useTranslation();
  const { refreshStatus, triggerSync, isOnline } = useSync();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  
  // Permissions Matrix State
  const [permissionsUser, setPermissionsUser] = useState<User | null>(null);
  const [userPermissions, setUserPermissions] = useState<UserPermission[]>([]);
  const [savingPermissions, setSavingPermissions] = useState(false);

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const data = await fetchApi('/users');
      setUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
    setLoading(false);
  };

  const handleDelete = async (user: User) => {
    if (user.email === 'cheickahmedt@gmail.com' || user.email === 'admin@inventory.com') {
      alert('Cannot delete the default admin');
      return;
    }
    if (!confirm(t('confirm_delete'))) return;

    try {
      await fetchApi(`/users/${user.id}`, { method: 'DELETE' });
      fetchUsers();
      await refreshStatus();
      if (isOnline) triggerSync();
    } catch (error) {
      console.error('Error deleting user:', error);
    }
  };

  const handleSave = async (formData: any) => {
    try {
      setMessage(null);

      if (editingUser) {
        await fetchApi(`/users/${editingUser.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: formData.name,
            role: formData.role
          })
        });
        setMessage({ type: 'success', text: 'User updated successfully!' });
      } else {
        await fetchApi('/users', {
          method: 'POST',
          body: JSON.stringify(formData)
        });
        setMessage({ type: 'success', text: 'User created successfully!' });
      }

      setIsModalOpen(false);
      setEditingUser(null);
      fetchUsers();
      await refreshStatus();
      if (isOnline) triggerSync();

      setTimeout(() => setMessage(null), 5000);
    } catch (error: any) {
      console.error('Error saving user:', error);
      const errorMessage = error.message || 'Failed to save user. Please try again.';
      setMessage({ type: 'error', text: errorMessage });

      setTimeout(() => setMessage(null), 5000);
    }
  };

  // Open Permissions Matrix Modal
  const handleEditPermissions = async (user: User) => {
    setPermissionsUser(user);
    setUserPermissions([]);
    try {
      const dbPermissions = await fetchApi(`/users/${user.id}/permissions`);
      // Map to full matrix grid
      const mappedPermissions: UserPermission[] = [];
      
      MODULES.forEach(mod => {
        ACTIONS.forEach(act => {
          const matched = dbPermissions.find((p: any) => p.module === mod.key && p.action === act.key);
          mappedPermissions.push({
            module: mod.key,
            action: act.key,
            allowed: matched ? matched.allowed === 1 : false
          });
        });
      });
      
      setUserPermissions(mappedPermissions);
    } catch (error) {
      console.error('Error fetching user permissions:', error);
    }
  };

  const handleTogglePermission = (moduleKey: string, actionKey: string) => {
    setUserPermissions(prev =>
      prev.map(p =>
        p.module === moduleKey && p.action === actionKey
          ? { ...p, allowed: !p.allowed }
          : p
      )
    );
  };

  const handleSavePermissions = async () => {
    if (!permissionsUser) return;
    setSavingPermissions(true);
    try {
      await fetchApi(`/users/${permissionsUser.id}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({ permissions: userPermissions }),
      });
      setMessage({ type: 'success', text: `Permissions updated for ${permissionsUser.name}!` });
      setPermissionsUser(null);
      setTimeout(() => setMessage(null), 5000);
    } catch (error) {
      console.error('Error saving user permissions:', error);
      alert('Failed to save permissions.');
    } finally {
      setSavingPermissions(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">{t('admin_users', 'User Accounts')}</h1>
        <button
          onClick={() => {
            setEditingUser(null);
            setIsModalOpen(true);
          }}
          className="bg-navy text-white px-4 py-2 rounded-lg hover:bg-opacity-90 flex items-center shadow-md font-semibold transition"
        >
          <Plus className="w-4 h-4 mr-2" />
          {t('add_user', 'Add User')}
        </button>
      </div>

      {message && (
        <div
          className={`px-4 py-3 rounded-lg border ${
            message.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">{t('loading')}</div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="py-4 px-6 font-bold text-xs uppercase tracking-wider text-gray-500">{t('name')}</th>
                <th className="py-4 px-6 font-bold text-xs uppercase tracking-wider text-gray-500">{t('email')}</th>
                <th className="py-4 px-6 font-bold text-xs uppercase tracking-wider text-gray-500">{t('role')}</th>
                <th className="py-4 px-6 font-bold text-xs uppercase tracking-wider text-gray-500">{t('created_at')}</th>
                <th className="py-4 px-6 font-bold text-xs uppercase tracking-wider text-gray-500 text-right">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50/55 transition">
                  <td className="py-4 px-6 font-medium text-gray-900">{user.name}</td>
                  <td className="py-4 px-6 text-gray-600">{user.email}</td>
                  <td className="py-4 px-6">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                      user.role === 'admin' ? 'bg-neutral-100 text-neutral-800' :
                      user.role === 'audit_manager' ? 'bg-amber-100 text-amber-800' :
                      'bg-slate-100 text-slate-700'
                    }`}>
                      {t(user.role)}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-gray-400 text-sm">{new Date(user.created_at).toLocaleDateString()}</td>
                  <td className="py-4 px-6 text-right">
                    <div className="flex items-center justify-end space-x-2">
                      <button
                        onClick={() => handleEditPermissions(user)}
                        className="p-1.5 rounded-lg text-neutral-600 hover:bg-neutral-50 transition flex items-center gap-1"
                        title={t('permissions', 'Edit Permissions')}
                      >
                        <Shield className="w-4 h-4" />
                        <span className="text-xs font-bold">{t('permissions', 'Permissions')}</span>
                      </button>
                      <button
                        onClick={() => {
                          setEditingUser(user);
                          setIsModalOpen(true);
                        }}
                        className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 transition"
                        title={t('edit')}
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(user)}
                        className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 transition"
                        title={t('delete')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* User Add/Edit Modal */}
      {isModalOpen && (
        <UserFormModal
          user={editingUser}
          onClose={() => {
            setIsModalOpen(false);
            setEditingUser(null);
          }}
          onSave={handleSave}
        />
      )}

      {/* Permissions Matrix Modal */}
      {permissionsUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl border border-gray-100 flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <Shield className="w-6 h-6 text-neutral-600" />
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{t('user_permissions', 'User Access Permissions')}</h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {t('managing_permissions_for', 'Manage modular privileges for')} <span className="font-bold text-neutral-600">{permissionsUser.name}</span> ({permissionsUser.email})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPermissionsUser(null)}
                className="text-gray-400 hover:text-gray-600 bg-gray-50 hover:bg-gray-100 p-1.5 rounded-full transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-2">
              {permissionsUser.role === 'admin' ? (
                <div className="bg-neutral-50 border border-neutral-100 p-5 rounded-2xl text-center flex flex-col items-center gap-3">
                  <Key className="w-8 h-8 text-neutral-600" />
                  <h3 className="font-bold text-neutral-900">{t('admin_full_access', 'Administrator Status')}</h3>
                  <p className="text-sm text-neutral-700 max-w-md">
                    {t('admin_bypass_info', 'This user has the Administrator role. Administrators bypass all permission matrices and have full write/read access to all components, databases, and logs.')}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {permissionsUser.role === 'audit_manager' && (
                    <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl text-xs text-amber-800 leading-relaxed">
                      💡 <strong>{t('audit_manager_note_title', 'Audit Manager default policy:')}</strong> {t('audit_manager_note_desc', 'This role implicitly receives view-only access to all modules. You only need to explicitly grant write capabilities (Create, Edit, Delete) as required.')}
                    </div>
                  )}

                  <div className="border border-gray-100 rounded-xl overflow-hidden shadow-sm">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                          <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider">{t('module', 'Module / Component')}</th>
                          {ACTIONS.map(act => (
                            <th key={act.key} className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">{t(act.key, act.label)}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {MODULES.map(mod => (
                          <tr key={mod.key} className="hover:bg-gray-50/50">
                            <td className="py-3 px-4">
                              <span className="font-semibold text-gray-800 text-sm">{mod.label}</span>
                              <code className="block text-[10px] text-gray-400 font-mono mt-0.5">{mod.key}</code>
                            </td>
                            {ACTIONS.map(act => {
                              const match = userPermissions.find(p => p.module === mod.key && p.action === act.key);
                              const isChecked = match ? match.allowed : false;

                              // Audit managers automatically get view permissions by default
                              const isImplicitlyAllowed = permissionsUser.role === 'audit_manager' && act.key === 'view';
                              // Everyone gets employee tasks portal view/edit access by default
                              const isTasksPortalImplicit = mod.key === 'employee_portal' && (act.key === 'view' || act.key === 'edit');
                              // Dashboard view is allowed for everyone by default
                              const isDashboardViewImplicit = mod.key === 'dashboard' && act.key === 'view';

                              const isDisabled = isImplicitlyAllowed || isTasksPortalImplicit || isDashboardViewImplicit;

                              return (
                                <td key={act.key} className="py-3 px-4 text-center">
                                  <input
                                    type="checkbox"
                                    checked={isDisabled ? true : isChecked}
                                    disabled={isDisabled}
                                    onChange={() => handleTogglePermission(mod.key, act.key)}
                                    className={`w-4 h-4 rounded text-neutral-600 border-gray-300 focus:ring-neutral-500 ${
                                      isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                                    }`}
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-4 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setPermissionsUser(null)}
                className="px-4 py-2 border rounded-xl hover:bg-gray-50 text-sm font-semibold transition"
              >
                {t('cancel')}
              </button>
              {permissionsUser.role !== 'admin' && (
                <button
                  type="button"
                  onClick={handleSavePermissions}
                  disabled={savingPermissions}
                  className="px-5 py-2 bg-neutral-600 hover:bg-neutral-700 text-white rounded-xl text-sm font-bold shadow-md transition disabled:opacity-50"
                >
                  {savingPermissions ? t('saving', 'Saving...') : t('save_permissions', 'Save Matrix')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const UserFormModal: React.FC<{
  user: User | null;
  onClose: () => void;
  onSave: (data: any) => void;
}> = ({ user, onClose, onSave }) => {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    password: '',
    role: user?.role || 'user',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100">
        <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-100">
          <h2 className="text-2xl font-bold text-gray-900">{user ? t('edit_user', 'Edit User') : t('add_user', 'Add User')}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 bg-gray-50 hover:bg-gray-100 p-1.5 rounded-full transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{t('name', 'Name')}</label>
            <input
              type="text"
              placeholder={t('name')}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-navy focus:border-transparent text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{t('email', 'Email')}</label>
            <input
              type="email"
              placeholder={t('email')}
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-navy focus:border-transparent text-sm"
              required
              disabled={!!user}
            />
          </div>
          {!user && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{t('password', 'Password')}</label>
              <input
                type="password"
                placeholder={t('password')}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-navy focus:border-transparent text-sm"
                required
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{t('role', 'Role')}</label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-navy focus:border-transparent text-sm bg-white"
            >
              <option value="user">{t('user_role', 'Standard User')}</option>
              <option value="audit_manager">{t('audit_manager', 'Audit Manager')}</option>
              <option value="admin">{t('admin', 'Administrator')}</option>
            </select>
          </div>
          <div className="flex justify-end space-x-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded-xl hover:bg-gray-50 text-sm font-semibold transition"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-navy hover:bg-opacity-95 text-white rounded-xl text-sm font-bold shadow-md transition"
            >
              {t('save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AdminUsers;
