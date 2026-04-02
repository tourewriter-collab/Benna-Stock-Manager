import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, CreditCard as Edit, Trash2 } from 'lucide-react';
import { fetchApi } from '../lib/api';
import { useSync } from '../contexts/SyncContext';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  created_at: string;
}

const AdminUsers: React.FC = () => {
  const { t } = useTranslation();
  const { refreshStatus, triggerSync, isOnline } = useSync();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const data = await fetchApi('/api/users');
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
      await fetchApi(`/api/users/${user.id}`, { method: 'DELETE' });
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
        await fetchApi(`/api/users/${editingUser.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: formData.name,
            role: formData.role,
            password: formData.password || undefined
          })
        });
        setMessage({ type: 'success', text: 'User updated successfully!' });
      } else {
        await fetchApi('/api/users', {
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-900">{t('admin_users')}</h1>
        <button
          onClick={() => {
            setEditingUser(null);
            setIsModalOpen(true);
          }}
          className="bg-navy text-white px-4 py-2 rounded-md hover:bg-opacity-90 flex items-center"
        >
          <Plus className="w-4 h-4 mr-2" />
          {t('add_user')}
        </button>
      </div>

      {message && (
        <div
          className={`mb-4 px-4 py-3 rounded-md ${
            message.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">{t('loading')}</div>
      ) : (
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">{t('name')}</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">{t('email')}</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">{t('role')}</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">{t('created_at')}</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-t hover:bg-gray-50">
                  <td className="py-3 px-4">{user.name}</td>
                  <td className="py-3 px-4">{user.email}</td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {user.role}
                    </span>
                  </td>
                  <td className="py-3 px-4">{new Date(user.created_at).toLocaleDateString()}</td>
                  <td className="py-3 px-4">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => {
                          setEditingUser(user);
                          setIsModalOpen(true);
                        }}
                        className="text-yellow-600 hover:text-yellow-800"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(user)} className="text-red-600 hover:text-red-800">
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">{user ? t('edit_user') : t('add_user')}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            placeholder={t('name')}
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-3 py-2 border rounded-md"
            required
          />
          <input
            type="email"
            placeholder={t('email')}
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="w-full px-3 py-2 border rounded-md"
            required
            disabled={!!user}
          />
          {!user && (
            <input
              type="password"
              placeholder={t('password')}
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="w-full px-3 py-2 border rounded-md"
              required
            />
          )}
          <select
            value={formData.role}
            onChange={(e) => setFormData({ ...formData, role: e.target.value })}
            className="w-full px-3 py-2 border rounded-md"
          >
            <option value="user">{t('user_role')}</option>
            <option value="audit_manager">{t('audit_manager')}</option>
            <option value="admin">{t('admin')}</option>
          </select>
          <div className="flex justify-end space-x-3">
            <button type="button" onClick={onClose} className="px-4 py-2 border rounded-md hover:bg-gray-50">
              {t('cancel')}
            </button>
            <button type="submit" className="px-4 py-2 bg-navy text-white rounded-md hover:bg-opacity-90">
              {t('save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AdminUsers;
