import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ClipboardList, CheckCircle2, Circle, AlertCircle, RefreshCw } from 'lucide-react';
import { fetchApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

interface Task {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
  due_date: string;
  assigned_by_name?: string;
  created_at: string;
}

const EmployeePortal: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const data = await fetchApi('/hr/tasks');
      setTasks(data || []);
    } catch (error) {
      console.error('[EmployeePortal] Error fetching tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (taskId: string, newStatus: 'pending' | 'in_progress' | 'completed') => {
    setUpdatingId(taskId);
    try {
      await fetchApi(`/hr/tasks/${taskId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      });
      // Update local state directly for responsive feedback
      setTasks(prev =>
        prev.map(t => (t.id === taskId ? { ...t, status: newStatus } : t))
      );
    } catch (error) {
      console.error('[EmployeePortal] Failed to update task status:', error);
      alert('Failed to update task status.');
    } finally {
      setUpdatingId(null);
    }
  };

  const stats = {
    total: tasks.length,
    pending: tasks.filter(t => t.status === 'pending').length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
    completed: tasks.filter(t => t.status === 'completed').length,
  };

  return (
    <div className="space-y-6">
      {/* Premium Glassmorphic Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0a0c10] to-[#1a1a1a] p-8 text-white shadow-2xl border border-white/10">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 h-64 w-64 rounded-full bg-white/5 blur-3xl"></div>
        <div className="absolute bottom-0 left-10 h-40 w-40 rounded-full bg-gold-500/20 blur-3xl"></div>

        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight mb-2 flex items-center gap-3">
              <ClipboardList className="w-8 h-8 text-gold-400" />
              {t('my_assigned_tasks', 'My Assigned Tasks')}
            </h1>
            <p className="text-gold-200 text-sm max-w-xl">
              {t('portal_welcome', 'Welcome, {{name}}. View and track the operations and project tasks assigned to you here.').replace('{{name}}', user?.name || '')}
            </p>
          </div>
          <button
            onClick={fetchTasks}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 backdrop-blur-md px-4 py-2 rounded-xl text-sm font-semibold border border-white/20 transition-all active:scale-95"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {t('refresh', 'Refresh')}
          </button>
        </div>
      </div>

      {/* Analytics widgets */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white/80 backdrop-blur-md border border-gray-100 p-5 rounded-2xl shadow-sm flex flex-col justify-between">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t('total_tasks', 'Total Tasks')}</span>
          <span className="text-3xl font-black text-[#0a0c10] mt-2">{stats.total}</span>
        </div>
        <div className="bg-amber-50/50 backdrop-blur-md border border-amber-100 p-5 rounded-2xl shadow-sm flex flex-col justify-between">
          <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">{t('pending_tasks', 'Pending')}</span>
          <span className="text-3xl font-black text-amber-700 mt-2">{stats.pending}</span>
        </div>
        <div className="bg-gold-50/50 backdrop-blur-md border border-gold-100 p-5 rounded-2xl shadow-sm flex flex-col justify-between">
          <span className="text-xs font-bold text-gold-600 uppercase tracking-wider">{t('in_progress_tasks', 'In Progress')}</span>
          <span className="text-3xl font-black text-gold-700 mt-2">{stats.inProgress}</span>
        </div>
        <div className="bg-emerald-50/50 backdrop-blur-md border border-emerald-100 p-5 rounded-2xl shadow-sm flex flex-col justify-between">
          <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">{t('completed_tasks', 'Completed')}</span>
          <span className="text-3xl font-black text-emerald-700 mt-2">{stats.completed}</span>
        </div>
      </div>

      {/* Tasks Grid/List */}
      <div className="bg-white/70 backdrop-blur-xl border border-white/40 shadow-xl rounded-2xl p-6 min-h-[400px]">
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0a0c10]"></div>
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <CheckCircle2 className="w-12 h-12 text-gray-300 mb-3" />
            <p className="font-semibold text-gray-500">{t('no_tasks_assigned', 'No tasks assigned to you.')}</p>
            <p className="text-xs text-gray-400 mt-1">{t('tasks_all_clear', 'All clear! You are fully caught up.')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {tasks.map(task => (
              <div
                key={task.id}
                className={`bg-white rounded-2xl border p-5 shadow-sm transition-all hover:shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden group ${
                  task.status === 'completed'
                    ? 'border-emerald-100 bg-emerald-50/10'
                    : task.status === 'in_progress'
                    ? 'border-gold-100'
                    : 'border-gray-100'
                }`}
              >
                {/* Decorative border accent */}
                <div
                  className={`absolute left-0 top-0 bottom-0 w-1.5 ${
                    task.status === 'completed'
                      ? 'bg-emerald-500'
                      : task.status === 'in_progress'
                      ? 'bg-gold-500'
                      : 'bg-amber-400'
                  }`}
                />

                <div className="space-y-2 flex-1 pl-3">
                  <div className="flex items-center gap-3">
                    <h3 className={`font-bold text-lg ${task.status === 'completed' ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                      {task.title}
                    </h3>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold capitalize ${
                        task.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : task.status === 'in_progress'
                          ? 'bg-gold-100 text-gold-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {t(task.status)}
                    </span>
                  </div>

                  {task.description && (
                    <p className={`text-sm ${task.status === 'completed' ? 'text-gray-400' : 'text-gray-600'} leading-relaxed`}>
                      {task.description}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-4 text-xs font-semibold text-gray-400 pt-1">
                    {task.due_date && (
                      <span className="flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                        {t('due_date', 'Due Date')}: <span className="text-gray-700">{task.due_date}</span>
                      </span>
                    )}
                    {task.assigned_by_name && (
                      <span>
                        {t('assigned_by', 'Assigned by')}: <span className="text-gray-600">{task.assigned_by_name}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Status action buttons */}
                <div className="flex items-center gap-2 self-stretch md:self-auto border-t md:border-t-0 pt-3 md:pt-0 mt-2 md:mt-0 pl-3 md:pl-0">
                  {updatingId === task.id ? (
                    <div className="w-6 h-6 border-2 border-gray-300 border-t-gold-600 rounded-full animate-spin" />
                  ) : (
                    <>
                      {task.status !== 'completed' && task.status !== 'in_progress' && (
                        <button
                          onClick={() => handleUpdateStatus(task.id, 'in_progress')}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-gold-50 text-gold-700 hover:bg-gold-100 border border-gold-100 transition duration-200"
                        >
                          <Circle className="w-3.5 h-3.5" />
                          {t('start_task', 'Start')}
                        </button>
                      )}
                      {task.status !== 'completed' && (
                        <button
                          onClick={() => handleUpdateStatus(task.id, 'completed')}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition duration-200"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {t('complete_task', 'Complete')}
                        </button>
                      )}
                      {task.status === 'completed' && (
                        <button
                          onClick={() => handleUpdateStatus(task.id, 'in_progress')}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-gray-100 text-gray-600 hover:bg-gray-200 transition duration-200"
                        >
                          {t('reopen_task', 'Reopen')}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default EmployeePortal;
