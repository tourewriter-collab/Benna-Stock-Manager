import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Users, UserPlus, FileText, BrainCircuit, Search, Plus, Briefcase, Upload, Cpu, FileSpreadsheet, CheckCircle, AlertTriangle, X, ClipboardList, Calendar, Trash2, Award, RefreshCw } from 'lucide-react';
import { Dialog } from '@headlessui/react';
import EmployeePerformance from './EmployeePerformance';
import { supabase } from '../lib/supabase';
import { pullAttendance } from '../services/attendanceSync';


interface Employee {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  department: string;
  salary: number;
  hire_date: string;
  status: string;
  performance_notes: string;
  device_enroll_id?: string;
  supervisor_id?: number | string;
  supervisor_name?: string;
}

interface Applicant {
  id: string;
  name: string;
  email: string;
  phone: string;
  role_applied: string;
  experience_years: number;
  skills: string;
  resume_text: string;
  ai_score: number;
  ai_assessment: string;
  status: string;
  applied_date: string;
}

interface AttendanceLog {
  id: string;
  employee_id: string | null;
  device_enroll_id: string;
  timestamp: string;
  verification_method: string;
  direction: string;
  source: string;
  employee_name?: string;
  employee_role?: string;
  employee_department?: string;
}

interface Task {
  id: string;
  employee_id: string;
  employee_name?: string;
  employee_email?: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
  due_date: string;
  assigned_by_name?: string;
  created_at: string;
}

const HumanResources: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'staff' | 'applicants' | 'screening' | 'attendance' | 'tasks' | 'performance'>('staff');
  
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceLog[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [deviceStatus, setDeviceStatus] = useState<{ online: boolean; lastSeen: string | null; sn: string; ip: string; port: number } | null>(null);

  // Users for supervisor assignment
  const [users, setUsers] = useState<any[]>([]);

  // Supervisor assignment modal state
  const [supervisorModal, setSupervisorModal] = useState<{ open: boolean; employee: Employee | null }>({ open: false, employee: null });
  const [supervisorModalValue, setSupervisorModalValue] = useState<string>('');
  const [supervisorSaving, setSupervisorSaving] = useState(false);

  // Delete employee modal state
  const [deleteModal, setDeleteModal] = useState<{ open: boolean; employee: Employee | null }>({ open: false, employee: null });
  const [deletePassword, setDeletePassword] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Task Assignment State
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTask, setNewTask] = useState({ employee_id: '', title: '', description: '', due_date: '' });

  // AI Screening State
  const [jobDescription, setJobDescription] = useState('');
  const [isScreening, setIsScreening] = useState(false);
  const [screeningResults, setScreeningResults] = useState<Applicant[]>([]);

  // Performance Tab State
  const [allPerformanceRecords, setAllPerformanceRecords] = useState<any[]>([]);
  const [selectedPerfEmployee, setSelectedPerfEmployee] = useState<string | null>(null);
  const [showAddPerf, setShowAddPerf] = useState(false);
  const [newPerf, setNewPerf] = useState({
    employee_id: '', month: new Date().toISOString().slice(0, 7),
    task_score: 80, boss_review_score: 0, boss_commentary: '',
    attendance_score: 80, peer_feedback_score: 0, skill_dev_score: 70, overtime_score: 70
  });
  const [bossCommentaryLoading, setBossCommentaryLoading] = useState(false);
  const [perfSaving, setPerfSaving] = useState(false);

  // New Staff Form State
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [newStaff, setNewStaff] = useState({ name: '', email: '', phone: '', role: '', department: '', salary: 0, hire_date: new Date().toISOString().split('T')[0], supervisor_id: '' });

  // Excel Import State
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);

  // New Applicant Form State
  const [showAddApplicant, setShowAddApplicant] = useState(false);
  const [newApplicant, setNewApplicant] = useState({ name: '', email: '', phone: '', role_applied: '', experience_years: 0, skills: '', resume_text: '' });

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchCalculatedAttendance = async (empId: string, monthStr: string) => {
    if (!empId || !monthStr) return;
    try {
      const res = await fetchApi(`/hr/performance/calculate-fixed-scores?employee_id=${empId}&month=${monthStr}`);
      if (res && res.attendance_score !== undefined) {
        setNewPerf(prev => ({ ...prev, attendance_score: res.attendance_score }));
      }
    } catch (e) {
      console.error('[HR Performance] Error fetching calculated attendance score:', e);
    }
  };

  useEffect(() => {
    if (newPerf.employee_id && newPerf.month) {
      fetchCalculatedAttendance(newPerf.employee_id, newPerf.month);
    }
  }, [newPerf.employee_id, newPerf.month]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'staff') {
        const data = await fetchApi('/hr/employees');
        setEmployees(data);
        // Fetch users for supervisor dropdown — admins assign supervisors
        if (user?.role === 'admin') {
          const usersData = await fetchApi('/users').catch(() => []);
          setUsers(usersData || []);
        }
      } else if (activeTab === 'applicants') {
        const data = await fetchApi('/hr/applicants');
        setApplicants(data);
      } else if (activeTab === 'attendance') {
        const [logsData, employeesData, statusData] = await Promise.all([
          fetchApi('/hr/attendance'),
          fetchApi('/hr/employees'),
          fetchApi('/hr/attendance/device-status').catch(() => null)
        ]);
        setAttendanceLogs(logsData);
        setEmployees(employeesData);
        if (statusData) {
          setDeviceStatus(statusData);
        }
      } else if (activeTab === 'tasks') {
        const [tasksData, employeesData] = await Promise.all([
          fetchApi('/hr/tasks'),
          fetchApi('/hr/employees')
        ]);
        setTasks(tasksData || []);
        setEmployees(employeesData || []);
      } else if (activeTab === 'performance') {
        const [perfData, employeesData] = await Promise.all([
          fetchApi('/hr/performance/all').catch(() => []),
          fetchApi('/hr/employees')
        ]);
        setAllPerformanceRecords(perfData || []);
        setEmployees(employeesData || []);
        if (user?.role === 'admin') {
          const usersData = await fetchApi('/users').catch(() => []);
          setUsers(usersData || []);
        }
      }
    } catch (error) {
      console.error('[HR] Fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePullAttendance = async () => {
    setIsSyncing(true);
    try {
      const result = await pullAttendance();
      if (result.errors.length > 0) {
        alert(t('hr_sync_error_alert', 'Sync completed with errors: ') + result.errors.join(', '));
      } else {
        alert(t('hr_sync_success_alert', 'Successfully pulled {{count}} records from biometric device!').replace('{{count}}', String(result.count)));
      }
      fetchData();
    } catch (err: any) {
      alert(t('hr_sync_failed_alert', 'Failed to pull attendance data: ') + (err.message || err));
    } finally {
      setIsSyncing(false);
    }
  };

  const handleTranslateCommentary = async () => {
    if (!newPerf.boss_commentary.trim()) return;
    setBossCommentaryLoading(true);
    try {
      const res = await fetchApi('/hr/performance/boss-score', {
        method: 'POST',
        body: JSON.stringify({ commentary: newPerf.boss_commentary })
      });
      if (res && res.score !== undefined) {
        setNewPerf(prev => ({ ...prev, boss_review_score: res.score }));
      }
    } catch (e) {
      console.error('[HR Perf] Commentary translation error:', e);
    } finally {
      setBossCommentaryLoading(false);
    }
  };

  const handleSavePerformance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPerf.employee_id || !newPerf.month) return;
    setPerfSaving(true);
    try {
      await fetchApi('/hr/performance', {
        method: 'POST',
        body: JSON.stringify(newPerf)
      });
      setShowAddPerf(false);
      setNewPerf(prev => ({ ...prev, employee_id: '', boss_commentary: '', boss_review_score: 0 }));
      fetchData();
    } catch (err: any) {
      alert('Failed to save performance: ' + err.message);
    } finally {
      setPerfSaving(false);
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.employee_id || !newTask.title) return;
    try {
      await fetchApi('/hr/tasks', { method: 'POST', body: JSON.stringify(newTask) });
      setShowAddTask(false);
      fetchData();
      setNewTask({ employee_id: '', title: '', description: '', due_date: '' });
    } catch (error) {
      alert(t('hr_alert_failed_task', 'Failed to assign task'));
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm(t('confirm_delete_task', 'Are you sure you want to delete this task?'))) return;
    try {
      await fetchApi(`/hr/tasks/${taskId}`, { method: 'DELETE' });
      fetchData();
    } catch (error) {
      alert(t('hr_alert_failed_delete_task', 'Failed to delete task'));
    }
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetchApi('/hr/employees', { method: 'POST', body: JSON.stringify(newStaff) });
      setShowAddStaff(false);
      fetchData();
      setNewStaff({ name: '', email: '', phone: '', role: '', department: '', salary: 0, hire_date: new Date().toISOString().split('T')[0], supervisor_id: '' });
    } catch (error) {
      alert(t('hr_alert_failed_staff', 'Failed to add staff'));
    }
  };

  const handleAddApplicant = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetchApi('/hr/applicants', { method: 'POST', body: JSON.stringify(newApplicant) });
      setShowAddApplicant(false);
      fetchData();
      setNewApplicant({ name: '', email: '', phone: '', role_applied: '', experience_years: 0, skills: '', resume_text: '' });
    } catch (error) {
      alert(t('hr_alert_failed_applicant', 'Failed to add applicant'));
    }
  };

  const handleRunScreening = async () => {
    if (!jobDescription.trim()) {
      alert(t('hr_alert_enter_desc', 'Please enter a job description to screen against.'));
      return;
    }
    setIsScreening(true);
    try {
      const res = await fetchApi('/hr/assess', {
        method: 'POST',
        body: JSON.stringify({ jobDescription })
      });
      if (res.results) {
        setScreeningResults(res.results);
      } else {
        alert(res.message || t('hr_alert_screening_complete', 'Screening complete.'));
      }
    } catch (error: any) {
      alert(t('hr_alert_screening_error', 'Screening error: ') + error.message);
    } finally {
      setIsScreening(false);
    }
  };

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset target so same file can be re-selected
    e.target.value = '';

    setIsImporting(true);
    setImportResult(null);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = (event.target?.result as string).split(',')[1];
        try {
          const res = await fetchApi('/hr/employees/import', {
            method: 'POST',
            body: JSON.stringify({ fileBase64: base64 }),
          });
          setImportResult({ imported: res.imported, skipped: res.skipped, errors: res.errors || [] });
          if (res.imported > 0) fetchData();
        } catch (err: any) {
          setImportResult({ imported: 0, skipped: 0, errors: [err.message || t('hr_import_failed', 'Import failed')] });
        } finally {
          setIsImporting(false);
        }
      };
      reader.readAsDataURL(file);
    } catch {
      setIsImporting(false);
    }
  };

  const handleDownloadTemplate = () => {
    // Build a minimal CSV template users can open in Excel
    const header = 'Name,Role,Department,Email,Phone,Salary,Hire Date,Status,Notes';
    const example = 'Jane Doe,Accountant,Finance,jane@example.com,+237600000000,350000,2024-01-15,active,';
    const blob = new Blob([header + '\n' + example], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'benna_staff_import_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleEnrollEmployee = async (employeeId: string, deviceEnrollId: string) => {
    try {
      await fetchApi(`/hr/employees/${employeeId}/enroll`, {
        method: 'PUT',
        body: JSON.stringify({ device_enroll_id: deviceEnrollId })
      });
      alert(t('hr_enroll_success', 'Employee mapped to device ID successfully'));
      fetchData();
    } catch (error) {
      alert(t('hr_enroll_error', 'Failed to update device enroll ID'));
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      if (!content) return;
      
      try {
        const res = await fetchApi('/hr/attendance/upload', {
          method: 'POST',
          body: JSON.stringify({ fileContent: content })
        });
        alert(t('hr_upload_success', 'Successfully imported {{count}} attendance logs!').replace('{{count}}', String(res.count)));
        fetchData();
      } catch (error: any) {
        alert(t('hr_upload_error', 'Failed to import attendance data: ') + error.message);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      {/* Header section with Glassmorphism */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-900 to-navy p-8 text-white shadow-2xl border border-white/10">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 h-64 w-64 rounded-full bg-white/5 blur-3xl"></div>
        <div className="absolute bottom-0 left-10 h-40 w-40 rounded-full bg-blue-500/20 blur-3xl"></div>
        
        <div className="relative z-10 flex flex-col xl:flex-row items-center justify-between gap-6">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight mb-2 flex items-center gap-3">
              <Users className="w-8 h-8 text-indigo-400" />
              {t('hr_hub_title', 'Human Resources Hub')}
            </h1>
            <p className="text-indigo-200 text-sm max-w-xl leading-relaxed">
              {t('hr_hub_subtitle', 'Manage your workforce, process job applications, and leverage Ikiké AI to autonomously screen and assess candidates against job requirements.')}
            </p>
          </div>
          
          {/* Glassy Tabs */}
          <div className="flex flex-wrap p-1.5 gap-1.5 bg-white/10 backdrop-blur-md rounded-xl border border-white/20 shadow-inner">
            <button
              onClick={() => setActiveTab('staff')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-300 ${activeTab === 'staff' ? 'bg-white text-indigo-900 shadow-md transform scale-105' : 'text-white/80 hover:bg-white/10 hover:text-white'}`}
            >
              <Briefcase className="w-4 h-4" />
              {t('hr_tab_staff', 'Staff')}
            </button>
            <button
              onClick={() => setActiveTab('applicants')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-300 ${activeTab === 'applicants' ? 'bg-white text-indigo-900 shadow-md transform scale-105' : 'text-white/80 hover:bg-white/10 hover:text-white'}`}
            >
              <FileText className="w-4 h-4" />
              {t('hr_tab_applicants', 'Applicants')}
            </button>
            <button
              onClick={() => setActiveTab('screening')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-300 ${activeTab === 'screening' ? 'bg-gradient-to-r from-blue-50 to-indigo-600 text-white shadow-md transform scale-105 border border-white/20' : 'text-white/80 hover:bg-white/10 hover:text-white'}`}
            >
              <BrainCircuit className="w-4 h-4" />
              {t('hr_tab_screening', 'AI Screening')}
            </button>
            <button
              onClick={() => setActiveTab('attendance')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-300 ${activeTab === 'attendance' ? 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white shadow-md transform scale-105 border border-white/20' : 'text-white/80 hover:bg-white/10 hover:text-white'}`}
            >
              <Cpu className="w-4 h-4" />
              {t('hr_tab_attendance', 'Attendance')}
            </button>
            <button
              onClick={() => setActiveTab('tasks')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-300 ${activeTab === 'tasks' ? 'bg-gradient-to-r from-blue-500 to-teal-500 text-white shadow-md transform scale-105 border border-white/20' : 'text-white/80 hover:bg-white/10 hover:text-white'}`}
            >
              <ClipboardList className="w-4 h-4" />
              {t('hr_tab_tasks', 'Tasks')}
            </button>
            {(user?.role === 'admin' || employees.some(emp => String(emp.supervisor_id) === String(user?.id))) && (
              <button
                onClick={() => { setSelectedPerfEmployee(null); setActiveTab('performance'); }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-300 ${activeTab === 'performance' ? 'bg-gradient-to-r from-amber-400 to-orange-500 text-white shadow-md transform scale-105 border border-white/20' : 'text-white/80 hover:bg-white/10 hover:text-white'}`}
              >
                <Award className="w-4 h-4" />
                {t('hr_tab_performance', 'Performance')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="bg-white/70 backdrop-blur-xl border border-white/40 shadow-xl rounded-2xl min-h-[500px] p-6 relative">
        {loading && activeTab !== 'screening' ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          </div>
        ) : (
          <>
            {/* ── STAFF TAB ── */}
            {activeTab === 'staff' && (
              <div className="space-y-6">
                <div className="flex flex-wrap justify-between items-center gap-3">
                  <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                    <Briefcase className="w-5 h-5 text-indigo-600" />
                    {t('hr_active_employees', 'Active Employees')}
                    <span className="ml-1 text-xs font-semibold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">{employees.length}</span>
                  </h2>
                  <div className="flex items-center gap-2">
                    {/* Download Template */}
                    <button
                      onClick={handleDownloadTemplate}
                      className="text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-400 px-3 py-2 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100"
                      title={t('hr_download_template', 'Download import template')}
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      {t('hr_download_template', 'Template')}
                    </button>

                    {/* Excel Import */}
                    <label className={`cursor-pointer flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition shadow-sm border ${
                      isImporting
                        ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700'
                    }`}>
                      {isImporting ? (
                        <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />{t('hr_importing', 'Importing...')}</>
                      ) : (
                        <><FileSpreadsheet className="w-4 h-4" />{t('hr_import_excel', 'Import Excel')}</>
                      )}
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={handleExcelImport}
                        disabled={isImporting}
                        className="hidden"
                      />
                    </label>

                    {/* Manual Add */}
                    <button 
                      onClick={() => { setShowAddStaff(!showAddStaff); setImportResult(null); }}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition shadow-md flex items-center gap-2"
                    >
                      <UserPlus className="w-4 h-4" />
                      {showAddStaff ? t('hr_cancel', 'Cancel') : t('hr_add_employee', 'Add Employee')}
                    </button>
                  </div>
                </div>

                {/* Import Result Banner */}
                {importResult && (
                  <div className={`rounded-xl border p-4 flex items-start gap-3 ${
                    importResult.errors.length > 0 || importResult.imported === 0
                      ? 'bg-amber-50 border-amber-200'
                      : 'bg-emerald-50 border-emerald-200'
                  }`}>
                    {importResult.imported > 0 && importResult.errors.length === 0 ? (
                      <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 text-sm">
                      <p className="font-bold text-gray-800">
                        {t('hr_import_result', 'Import Complete')} — {importResult.imported} {t('hr_import_added', 'added')}, {importResult.skipped} {t('hr_import_skipped', 'skipped')}
                      </p>
                      {importResult.errors.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {importResult.errors.map((err, i) => (
                            <li key={i} className="text-amber-700 text-xs font-mono">{err}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <button onClick={() => setImportResult(null)} className="text-gray-400 hover:text-gray-600">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {showAddStaff && (
                  <form onSubmit={handleAddStaff} className="bg-white p-6 rounded-xl border border-indigo-100 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{t('hr_full_name', 'Full Name')} *</label>
                      <input type="text" required value={newStaff.name} onChange={e => setNewStaff({...newStaff, name: e.target.value})} className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" placeholder="Jane Doe" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{t('hr_role', 'Role')} *</label>
                      <input type="text" required value={newStaff.role} onChange={e => setNewStaff({...newStaff, role: e.target.value})} className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" placeholder="Accountant" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{t('hr_department', 'Department')} *</label>
                      <input type="text" required value={newStaff.department} onChange={e => setNewStaff({...newStaff, department: e.target.value})} className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" placeholder="Finance" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{t('hr_hire_date', 'Hire Date')} *</label>
                      <input type="date" required value={newStaff.hire_date} onChange={e => setNewStaff({...newStaff, hire_date: e.target.value})} className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{t('hr_email', 'Email')}</label>
                      <input type="email" value={newStaff.email} onChange={e => setNewStaff({...newStaff, email: e.target.value})} className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" placeholder="jane@company.com" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{t('hr_phone', 'Phone')}</label>
                      <input type="tel" value={newStaff.phone} onChange={e => setNewStaff({...newStaff, phone: e.target.value})} className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" placeholder="+237 6XX XXX XXX" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{t('hr_salary', 'Monthly Salary (FCFA)')}</label>
                      <input type="number" min="0" value={newStaff.salary} onChange={e => setNewStaff({...newStaff, salary: parseFloat(e.target.value) || 0})} className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" placeholder="350000" />
                    </div>
                    {user?.role === 'admin' && (
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Supervisor</label>
                        <select 
                          value={newStaff.supervisor_id || ''} 
                          onChange={e => setNewStaff({...newStaff, supervisor_id: e.target.value})} 
                          className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm bg-white"
                        >
                          <option value="">-- No Supervisor (Admin only) --</option>
                          {users.map(u => (
                            <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="md:col-span-2 flex justify-end mt-2">
                      <button type="submit" className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium shadow-md hover:bg-indigo-700 transition">{t('hr_save_employee', 'Save Employee')}</button>
                    </div>
                  </form>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {employees.map(emp => (
                    <div key={emp.id} className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition p-5 group relative overflow-hidden flex flex-col justify-between min-h-[180px]">
                      <div>
                        <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-bl-full -z-10 transition-transform group-hover:scale-110"></div>
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <h3 className="font-bold text-gray-900">{emp.name}</h3>
                            <p className="text-sm text-indigo-600 font-medium">{emp.role}</p>
                          </div>
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${emp.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-700'}`}>
                            {t(emp.status)}
                          </span>
                        </div>
                        <div className="space-y-2 text-sm text-gray-600">
                          <p className="flex justify-between border-b border-gray-50 pb-1">
                            <span className="text-gray-400">{t('hr_dept', 'Dept')}</span>
                            <span className="font-medium text-gray-800">{emp.department}</span>
                          </p>
                          <p className="flex justify-between border-b border-gray-50 pb-1">
                            <span className="text-gray-400">{t('hr_hired', 'Hired')}</span>
                            <span className="font-medium text-gray-800">{emp.hire_date}</span>
                          </p>
                        </div>
                      </div>
                      
                      {/* Mapping ID UI */}
                      <div className="flex items-center justify-between border-t border-gray-100 pt-3 mt-4">
                        <span className="text-gray-400 text-xs font-semibold flex items-center gap-1">
                          <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                          {t('hr_device_id', 'Device ID')}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {emp.device_enroll_id ? (
                            <span className="font-bold text-xs text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-md">{emp.device_enroll_id}</span>
                          ) : (
                            <span className="text-xs text-gray-400 italic bg-gray-50 px-2.5 py-1 rounded-md">{t('none')}</span>
                          )}
                          <button
                            onClick={() => {
                              const newId = prompt(t('hr_map_device_id', 'Map Device ID'), emp.device_enroll_id || '');
                              if (newId !== null) {
                                handleEnrollEmployee(emp.id, newId);
                              }
                            }}
                            className="text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 p-1.5 rounded-md transition"
                            title={t('edit')}
                          >
                            {t('edit')}
                          </button>
                        </div>
                      </div>

                      {/* Supervisor UI */}
                      <div className="flex items-center justify-between border-t border-gray-100 pt-3 mt-2">
                        <span className="text-gray-400 text-xs font-semibold flex items-center gap-1">
                          <Users className="w-3.5 h-3.5 text-indigo-400" />
                          Supervisor
                        </span>
                        <div className="flex items-center gap-1.5">
                          {emp.supervisor_name ? (
                            <span className="font-bold text-xs text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-md">{emp.supervisor_name}</span>
                          ) : (
                            <span className="text-xs text-gray-400 italic bg-gray-50 px-2.5 py-1 rounded-md">None</span>
                          )}
                          {user?.role === 'admin' && (
                            <button
                              onClick={() => {
                                setSupervisorModal({ open: true, employee: emp });
                                setSupervisorModalValue(emp.supervisor_id ? String(emp.supervisor_id) : '');
                              }}
                              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 p-1.5 rounded-md transition"
                              title="Assign Supervisor"
                            >
                              {t('edit')}
                            </button>
                          )}
                        </div>
                      </div>

                      {user?.role === 'admin' && (
                        <div className="flex justify-end border-t border-gray-100 pt-3 mt-2">
                          <button
                            onClick={() => {
                              setDeleteModal({ open: true, employee: emp });
                              setDeletePassword('');
                            }}
                            className="text-xs font-bold text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 px-2.5 py-1.5 rounded-md transition flex items-center gap-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete Employee
                          </button>
                        </div>
                      )}

                    </div>
                  ))}
                  {employees.length === 0 && (
                    <div className="col-span-full py-12 text-center text-gray-400">{t('hr_no_employees', 'No employees found. Add one above.')}</div>
                  )}
                </div>
              </div>
            )}

              {/* ── SUPERVISOR ASSIGNMENT MODAL ── */}
              {supervisorModal.open && supervisorModal.employee && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                  <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-6 w-full max-w-md mx-4 relative">
                    <button
                      onClick={() => setSupervisorModal({ open: false, employee: null })}
                      className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 transition"
                    >
                      <X className="w-5 h-5" />
                    </button>
                    <div className="flex items-center gap-3 mb-5">
                      <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                        <Users className="w-5 h-5 text-indigo-600" />
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900 text-sm">Assign Supervisor</h3>
                        <p className="text-xs text-gray-500">{supervisorModal.employee.name} · {supervisorModal.employee.role}</p>
                      </div>
                    </div>

                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Select Supervisor</label>
                    <select
                      value={supervisorModalValue}
                      onChange={e => setSupervisorModalValue(e.target.value)}
                      className="w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm bg-white mb-5"
                    >
                      <option value="">— No Supervisor (Admin Managed) —</option>
                      {users.map(u => (
                        <option key={u.id} value={String(u.id)}>
                          {u.name} · {u.role} ({u.email})
                        </option>
                      ))}
                    </select>

                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => setSupervisorModal({ open: false, employee: null })}
                        className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium transition"
                      >
                        Cancel
                      </button>
                      <button
                        disabled={supervisorSaving}
                        onClick={async () => {
                          if (!supervisorModal.employee) return;
                          setSupervisorSaving(true);
                          try {
                            await fetchApi(`/hr/employees/${supervisorModal.employee.id}`, {
                              method: 'PUT',
                              body: JSON.stringify({
                                supervisor_id: supervisorModalValue === '' ? null : parseInt(supervisorModalValue)
                              })
                            });
                            setSupervisorModal({ open: false, employee: null });
                            fetchData();
                          } catch (e: any) {
                            alert('Failed to update supervisor: ' + e.message);
                          } finally {
                            setSupervisorSaving(false);
                          }
                        }}
                        className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-semibold shadow-md transition"
                      >
                        {supervisorSaving ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

            {/* Delete Employee Modal */}
            {deleteModal.open && deleteModal.employee && (
              <Dialog 
                open={deleteModal.open} 
                onClose={() => setDeleteModal({ open: false, employee: null })} 
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
              >
                <Dialog.Panel className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-6 w-full max-w-md mx-4 relative">
                  <button 
                    onClick={() => setDeleteModal({ open: false, employee: null })} 
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 transition"
                  >
                    <X className="w-5 h-5" />
                  </button>
                  
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                      <Trash2 className="w-5 h-5 text-red-600" />
                    </div>
                    <div>
                      <Dialog.Title className="font-bold text-gray-900 text-base">Delete Employee</Dialog.Title>
                      <p className="text-xs text-gray-500">{deleteModal.employee.name} · {deleteModal.employee.role}</p>
                    </div>
                  </div>

                  <p className="text-sm text-gray-600 mb-4 leading-relaxed">
                    This action is permanent and cannot be undone. To verify, please enter the admin security password below:
                  </p>

                  <div className="mb-5">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Admin Password</label>
                    <input
                      type="password"
                      value={deletePassword}
                      onChange={e => setDeletePassword(e.target.value)}
                      className="w-full rounded-lg border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500 text-sm"
                      placeholder="Enter admin password"
                    />
                  </div>

                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => setDeleteModal({ open: false, employee: null })}
                      className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium transition"
                    >
                      Cancel
                    </button>
                    <button
                      disabled={deleting || !deletePassword}
                      onClick={async () => {
                        const adminPass = import.meta.env.VITE_ADMIN_PASSWORD;
                        if (deletePassword !== adminPass) {
                          alert('Incorrect admin password');
                          return;
                        }
                        setDeleting(true);
                        try {
                          const { error } = await supabase.from('employees').delete().eq('id', deleteModal.employee!.id);
                          if (error) throw error;
                          alert('Employee deleted successfully');
                          setDeleteModal({ open: false, employee: null });
                          setDeletePassword('');
                          fetchData();
                        } catch (e: any) {
                          alert('Deletion failed: ' + e.message);
                        } finally {
                          setDeleting(false);
                        }
                      }}
                      className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-semibold shadow-md transition"
                    >
                      {deleting ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </Dialog.Panel>
              </Dialog>
            )}
            {/* ── APPLICANTS TAB ── */}
            {activeTab === 'applicants' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-indigo-600" />
                    {t('hr_job_applicants', 'Job Applicants')}
                  </h2>
                  <button 
                    onClick={() => setShowAddApplicant(!showAddApplicant)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition shadow-md flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    {showAddApplicant ? t('hr_cancel', 'Cancel') : t('hr_add_applicant', 'Add Applicant')}
                  </button>
                </div>

                {showAddApplicant && (
                  <form onSubmit={handleAddApplicant} className="bg-white p-6 rounded-xl border border-indigo-100 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{t('hr_full_name', 'Full Name')}</label>
                      <input type="text" required value={newApplicant.name} onChange={e => setNewApplicant({...newApplicant, name: e.target.value})} className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{t('hr_role_applied', 'Role Applied')}</label>
                      <input type="text" required value={newApplicant.role_applied} onChange={e => setNewApplicant({...newApplicant, role_applied: e.target.value})} className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{t('hr_email', 'Email')}</label>
                      <input type="email" required value={newApplicant.email} onChange={e => setNewApplicant({...newApplicant, email: e.target.value})} className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{t('hr_experience_years', 'Experience (Years)')}</label>
                      <input type="number" required value={newApplicant.experience_years} onChange={e => setNewApplicant({...newApplicant, experience_years: parseInt(e.target.value)})} className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{t('hr_skills_resume', 'Skills / Resume Details')}</label>
                      <textarea rows={3} value={newApplicant.resume_text} onChange={e => setNewApplicant({...newApplicant, resume_text: e.target.value})} className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"></textarea>
                    </div>
                    <div className="md:col-span-2 flex justify-end mt-2">
                      <button type="submit" className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium shadow-md hover:bg-indigo-700 transition">{t('hr_save_applicant', 'Save Applicant')}</button>
                    </div>
                  </form>
                )}

                <div className="overflow-hidden bg-white shadow-sm border border-gray-200 rounded-xl">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">{t('hr_candidate', 'Candidate')}</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">{t('hr_role_exp', 'Role & Exp')}</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">{t('hr_status', 'Status')}</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">{t('hr_ai_score', 'AI Score')}</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {applicants.map(app => (
                        <tr key={app.id} className="hover:bg-gray-50 transition">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="font-semibold text-gray-900">{app.name}</div>
                            <div className="text-sm text-gray-500">{app.email}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                            <span className="font-medium text-indigo-700 block">{app.role_applied}</span>
                            {app.experience_years} {t('hr_years_exp', 'years exp.')}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize
                              ${app.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : ''}
                              ${app.status === 'reviewed' ? 'bg-blue-100 text-blue-800' : ''}
                              ${app.status === 'accepted' ? 'bg-emerald-100 text-emerald-800' : ''}
                              ${app.status === 'rejected' ? 'bg-red-100 text-red-800' : ''}
                            `}>
                              {t(app.status)}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {app.ai_score > 0 ? (
                              <div className="flex items-center gap-2">
                                <div className="w-full bg-gray-200 rounded-full h-2 max-w-[80px]">
                                  <div className={`h-2 rounded-full ${app.ai_score >= 80 ? 'bg-emerald-500' : app.ai_score >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${app.ai_score}%` }}></div>
                                </div>
                                <span className="font-bold text-sm text-gray-700">{app.ai_score}%</span>
                              </div>
                            ) : (
                              <span className="text-sm text-gray-400 italic">{t('hr_not_screened', 'Not screened')}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {applicants.length === 0 && (
                    <div className="py-12 text-center text-gray-400">{t('hr_no_applicants', 'No applicants found.')}</div>
                  )}
                </div>
              </div>
            )}

            {/* ── AI SCREENING TAB ── */}
            {activeTab === 'screening' && (
              <div className="space-y-6">
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl p-6 shadow-sm">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="p-3 bg-white rounded-xl shadow-sm text-indigo-600">
                      <BrainCircuit className="w-8 h-8" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-indigo-900">{t('hr_ai_screening_title', 'Ikiké Strategic AI Screening')}</h2>
                      <p className="text-sm text-indigo-700 mt-1 max-w-3xl">
                        {t('hr_ai_screening_subtitle_pre', 'Enter a job description below. Ikiké will autonomously evaluate all')} <span className="font-bold">{t('pending')}</span> {t('hr_ai_screening_subtitle_post', 'applicants against these criteria, assign a clinical fit score, and provide a professional assessment.')}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6">
                    <label className="block text-sm font-bold text-indigo-900 mb-2">{t('hr_job_desc_req', 'Target Job Description & Requirements')}</label>
                    <textarea 
                      rows={6}
                      value={jobDescription}
                      onChange={e => setJobDescription(e.target.value)}
                      placeholder={t('hr_job_desc_placeholder', 'e.g. Seeking a Senior Supply Chain Manager with 5+ years experience. Must be proficient in logistics software, OHADA accounting standards, and team leadership...')}
                      className="w-full rounded-xl border-indigo-200 shadow-inner focus:border-indigo-500 focus:ring-indigo-500 text-sm p-4 bg-white"
                    ></textarea>
                    
                    <div className="mt-4 flex justify-end">
                      <button 
                        onClick={handleRunScreening}
                        disabled={isScreening || !jobDescription.trim()}
                        className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-3 rounded-xl font-bold shadow-lg transition-all flex items-center gap-3"
                      >
                        {isScreening ? (
                          <>
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                            {t('hr_analyzing_profiles', 'Ikiké is Analyzing Profiles...')}
                          </>
                        ) : (
                          <>
                            <Search className="w-5 h-5" />
                            {t('hr_run_screening', 'Run Autonomous AI Screening')}
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {screeningResults.length > 0 && (
                  <div className="mt-8 space-y-4">
                    <h3 className="text-lg font-bold text-gray-900 border-b pb-2">{t('hr_screening_results', 'Screening Results')}</h3>
                    {screeningResults.map(res => (
                      <div key={res.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 relative overflow-hidden group">
                        <div className={`absolute top-0 left-0 w-1.5 h-full ${res.ai_score >= 80 ? 'bg-emerald-500' : res.ai_score >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}></div>
                        
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-bold text-gray-900 text-lg">{res.name}</h4>
                            <span className="text-sm font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded mt-1 inline-block">{res.role_applied}</span>
                          </div>
                          <div className="text-right">
                            <div className="text-3xl font-black tracking-tighter" style={{ color: res.ai_score >= 80 ? '#10b981' : res.ai_score >= 50 ? '#eab308' : '#ef4444' }}>
                              {res.ai_score}%
                            </div>
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{t('hr_fit_score', 'Fit Score')}</span>
                          </div>
                        </div>

                        <div className="mt-4 bg-gray-50 rounded-lg p-4 text-sm text-gray-700 leading-relaxed border border-gray-100">
                          <strong className="text-indigo-900 block mb-1 text-xs uppercase tracking-wider">{t('hr_clinical_assessment', 'Ikiké Clinical Assessment:')}</strong>
                          {res.ai_assessment}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── ATTENDANCE TAB ── */}
            {activeTab === 'attendance' && (
              <div className="space-y-6">
                {/* Status and Upload Widgets */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Terminal status */}
                  <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between">
                    <div>
                      <h3 className="font-bold text-gray-800 text-lg mb-1 flex items-center gap-2">
                        <Cpu className="w-5 h-5 text-indigo-500" />
                        {t('hr_device_status', 'Terminal Connection')}
                      </h3>
                      <p className="text-xs text-gray-500">Hysoon Facial & Fingerprint Biometric Station</p>
                    </div>

                    <div className="mt-4 flex items-center gap-3">
                      {deviceStatus?.online ? (
                        <>
                          <div className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                          </div>
                          <span className="font-bold text-sm text-emerald-600">{t('hr_device_online', 'Online')}</span>
                        </>
                      ) : (
                        <>
                          <div className="relative flex h-3 w-3">
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
                          </div>
                          <span className="font-bold text-sm text-rose-500">
                            {t('hr_device_offline', 'Offline')}
                          </span>
                        </>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-gray-100 text-xs text-gray-400 flex flex-col gap-1">
                      <div className="flex justify-between">
                        <span>IP: {deviceStatus?.ip || '192.168.1.200'}</span>
                        <span>Port: {deviceStatus?.port || 5005} (ADMS)</span>
                      </div>
                      {deviceStatus?.lastSeen && (
                        <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                          <span>SN: {deviceStatus.sn || 'N/A'}</span>
                          <span>Seen: {new Date(deviceStatus.lastSeen).toLocaleTimeString()}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* USB Uploader Dropzone */}
                  <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm lg:col-span-2">
                    <h3 className="font-bold text-gray-800 text-lg mb-2 flex items-center gap-2">
                      <Upload className="w-5 h-5 text-indigo-500" />
                      {t('hr_usb_import', 'USB Log Import')}
                    </h3>
                    
                    <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 hover:border-indigo-400 rounded-xl p-6 cursor-pointer bg-slate-50/50 hover:bg-slate-50 transition relative overflow-hidden group">
                      <input 
                        type="file" 
                        accept=".txt,.csv" 
                        onChange={handleFileUpload} 
                        className="hidden" 
                      />
                      <Upload className="w-8 h-8 text-gray-400 group-hover:text-indigo-600 mb-2 transition transform group-hover:-translate-y-1" />
                      <span className="text-xs font-semibold text-gray-700 text-center">{t('hr_drag_drop_usb', 'Drag and drop standard attendance log file (.txt, .csv) here or click to browse.')}</span>
                      <span className="text-[10px] text-gray-400 mt-1">Supports Hysoon AGL logs and standard comma-separated TXT/CSV</span>
                    </label>
                  </div>
                </div>

                {/* Daily Attendance Logs */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                      <FileText className="w-5 h-5 text-indigo-600" />
                      {t('hr_attendance_records', 'Smart Attendance Log')}
                    </h3>
                    <button
                      onClick={handlePullAttendance}
                      disabled={isSyncing}
                      className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition shadow-md flex items-center gap-2"
                    >
                      <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                      {isSyncing ? t('hr_syncing', 'Syncing...') : t('hr_sync_device', 'Sync Device')}
                    </button>
                  </div>

                  <div className="overflow-hidden bg-white shadow-sm border border-gray-200 rounded-xl">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">{t('hr_candidate', 'Employee')}</th>
                          <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">{t('hr_device_id', 'Device ID')}</th>
                          <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">{t('date', 'Time')}</th>
                          <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">{t('hr_verification_method', 'Verification')}</th>
                          <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">{t('hr_direction', 'Direction')}</th>
                          <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">{t('hr_source', 'Source')}</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {attendanceLogs.map(log => (
                          <tr key={log.id} className="hover:bg-gray-50 transition">
                            <td className="px-6 py-4 whitespace-nowrap">
                              {log.employee_name ? (
                                <div>
                                  <div className="font-semibold text-gray-900">{log.employee_name}</div>
                                  <div className="text-xs text-indigo-600 font-medium">{log.employee_role} • {log.employee_department}</div>
                                </div>
                              ) : (
                                <span className="text-gray-400 italic text-sm">Unmapped Employee</span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-700">
                              {log.device_enroll_id}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                              {log.timestamp}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold capitalize
                                ${log.verification_method === 'face' ? 'bg-indigo-100 text-indigo-800' : ''}
                                ${log.verification_method === 'fingerprint' ? 'bg-purple-100 text-purple-800' : ''}
                                ${log.verification_method === 'card' ? 'bg-blue-100 text-blue-800' : ''}
                                ${log.verification_method === 'password' ? 'bg-yellow-100 text-yellow-800' : ''}
                                ${log.verification_method === 'manual' ? 'bg-orange-100 text-orange-800' : ''}
                                ${log.verification_method === 'unknown' ? 'bg-gray-100 text-gray-800' : ''}
                              `}>
                                {t(log.verification_method)}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold capitalize
                                ${log.direction === 'in' ? 'bg-emerald-100 text-emerald-800' : ''}
                                ${log.direction === 'out' ? 'bg-rose-100 text-rose-800' : ''}
                                ${log.direction === 'unknown' ? 'bg-gray-100 text-gray-800' : ''}
                              `}>
                                {t(log.direction)}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold
                                ${log.source === 'online_push' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : ''}
                                ${log.source === 'usb_import' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : ''}
                                ${log.source === 'manual_entry' ? 'bg-slate-100 text-slate-700' : ''}
                              `}>
                                {t(log.source)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {attendanceLogs.length === 0 && (
                      <div className="py-12 text-center text-gray-400">{t('no_data', 'No data available')}</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── TASKS TAB ── */}
            {activeTab === 'tasks' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                    <ClipboardList className="w-5 h-5 text-indigo-600" />
                    {t('hr_task_assignment', 'Employee Task Assignment')}
                  </h2>
                  <button
                    onClick={() => setShowAddTask(!showAddTask)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition shadow-md flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    {showAddTask ? t('hr_cancel', 'Cancel') : t('hr_assign_task', 'Assign New Task')}
                  </button>
                </div>

                {showAddTask && (
                  <form onSubmit={handleAddTask} className="bg-white p-6 rounded-xl border border-indigo-100 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                        {t('hr_employee', 'Select Employee')} *
                      </label>
                      <select
                        required
                        value={newTask.employee_id}
                        onChange={e => setNewTask({ ...newTask, employee_id: e.target.value })}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm bg-white"
                      >
                        <option value="">-- {t('hr_select_employee', 'Select Employee')} --</option>
                        {employees.map(emp => (
                          <option key={emp.id} value={emp.id}>
                            {emp.name} ({emp.role} - {emp.department})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                        {t('hr_task_title', 'Task Title')} *
                      </label>
                      <input
                        type="text"
                        required
                        value={newTask.title}
                        onChange={e => setNewTask({ ...newTask, title: e.target.value })}
                        placeholder={t('hr_task_title_placeholder', 'e.g. Complete inventory audit')}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                        {t('hr_task_due_date', 'Due Date')}
                      </label>
                      <input
                        type="date"
                        value={newTask.due_date}
                        onChange={e => setNewTask({ ...newTask, due_date: e.target.value })}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                        {t('hr_task_description', 'Task Description')}
                      </label>
                      <textarea
                        rows={3}
                        value={newTask.description}
                        onChange={e => setNewTask({ ...newTask, description: e.target.value })}
                        placeholder={t('hr_task_description_placeholder', 'Detail the instructions, tools needed, and desired outcome...')}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                      />
                    </div>

                    <div className="md:col-span-2 flex justify-end mt-2">
                      <button type="submit" className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium shadow-md hover:bg-indigo-700 transition">
                        {t('hr_submit_task', 'Assign Task')}
                      </button>
                    </div>
                  </form>
                )}

                <div className="overflow-hidden bg-white shadow-sm border border-gray-200 rounded-xl">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">{t('hr_task', 'Task')}</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">{t('hr_employee', 'Assigned To')}</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">{t('hr_status', 'Status')}</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">{t('hr_due_date', 'Due Date')}</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">{t('hr_actions', 'Actions')}</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {tasks.map(task => (
                        <tr key={task.id} className="hover:bg-gray-50 transition">
                          <td className="px-6 py-4">
                            <div className="font-semibold text-gray-900">{task.title}</div>
                            {task.description && <div className="text-xs text-gray-500 max-w-md mt-0.5">{task.description}</div>}
                            <div className="text-[10px] text-gray-400 mt-1">
                              {t('hr_assigned_by', 'Assigned by')}: {task.assigned_by_name || 'System'}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="font-semibold text-gray-900">{task.employee_name}</div>
                            <div className="text-xs text-indigo-600 font-medium">{task.employee_email}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold capitalize
                              ${task.status === 'completed' ? 'bg-emerald-100 text-emerald-800' : ''}
                              ${task.status === 'in_progress' ? 'bg-blue-100 text-blue-800' : ''}
                              ${task.status === 'pending' ? 'bg-amber-100 text-amber-800' : ''}
                            `}>
                              {t(task.status)}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                            {task.due_date ? (
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3.5 h-3.5 text-gray-400" />
                                {task.due_date}
                              </span>
                            ) : (
                              <span className="text-gray-400 italic text-xs">{t('none', 'No deadline')}</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <button
                              onClick={() => handleDeleteTask(task.id)}
                              className="text-rose-600 hover:text-rose-800 transition p-1.5 rounded-lg hover:bg-rose-50"
                              title={t('delete')}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {tasks.length === 0 && (
                    <div className="py-12 text-center text-gray-400">{t('hr_no_tasks', 'No tasks assigned yet.')}</div>
                  )}
                </div>
              </div>
            )}

            {/* ── PERFORMANCE TAB (Admin or Supervisor) ── */}
            {activeTab === 'performance' && (user?.role === 'admin' || employees.some(emp => String(emp.supervisor_id) === String(user?.id))) && (
              <div className="space-y-6">
                {/* If drilling into a specific employee's performance */}
                {selectedPerfEmployee ? (
                  <div>
                    <EmployeePerformance
                      overrideEmployeeId={selectedPerfEmployee}
                      onBack={() => setSelectedPerfEmployee(null)}
                    />
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap justify-between items-center gap-3">
                      <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <Award className="w-5 h-5 text-amber-500" />
                        {t('hr_performance_management', 'Performance Management')}
                        <span className="ml-1 text-xs font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{allPerformanceRecords.length} records</span>
                      </h2>
                      <button
                        onClick={() => setShowAddPerf(!showAddPerf)}
                        className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition shadow-md flex items-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        {showAddPerf ? t('hr_cancel', 'Cancel') : t('hr_add_evaluation', 'Add Evaluation')}
                      </button>
                    </div>

                    {showAddPerf && (
                      <form onSubmit={handleSavePerformance} className="bg-white p-6 rounded-2xl border border-amber-100 shadow-md grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                          <h3 className="font-bold text-gray-800 mb-1 text-sm">New Performance Evaluation</h3>
                          <p className="text-xs text-gray-400">Scores are from 0–100. Use the AI commentary translator to auto-score manager feedback.</p>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Employee *</label>
                          <select required value={newPerf.employee_id} onChange={e => setNewPerf({...newPerf, employee_id: e.target.value})} className="w-full rounded-md border-gray-300 shadow-sm focus:border-amber-500 focus:ring-amber-500 sm:text-sm bg-white">
                            <option value="">-- Select Employee --</option>
                            {employees
                              .filter(emp => user?.role === 'admin' || String(emp.supervisor_id) === String(user?.id))
                              .map(emp => (
                                <option key={emp.id} value={emp.id}>{emp.name} ({emp.role})</option>
                              ))
                            }
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Month *</label>
                          <input type="month" required value={newPerf.month} onChange={e => setNewPerf({...newPerf, month: e.target.value})} className="w-full rounded-md border-gray-300 shadow-sm focus:border-amber-500 focus:ring-amber-500 sm:text-sm" />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Task Accomplishment (0–100)</label>
                          <input type="number" min="0" max="100" value={newPerf.task_score} onChange={e => setNewPerf({...newPerf, task_score: parseInt(e.target.value)||0})} className="w-full rounded-md border-gray-300 shadow-sm focus:border-amber-500 focus:ring-amber-500 sm:text-sm" />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                            Attendance Score (0–100) <span className="text-[10px] text-indigo-650 font-bold">(Auto-calculated)</span>
                          </label>
                          <input 
                            type="number" 
                            disabled 
                            value={newPerf.attendance_score} 
                            className="w-full rounded-md border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed shadow-sm focus:outline-none sm:text-sm" 
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Skill Development (0–100)</label>
                          <input type="number" min="0" max="100" value={newPerf.skill_dev_score} onChange={e => setNewPerf({...newPerf, skill_dev_score: parseInt(e.target.value)||0})} className="w-full rounded-md border-gray-300 shadow-sm focus:border-amber-500 focus:ring-amber-500 sm:text-sm" />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Overtime Balance (0–100)</label>
                          <input type="number" min="0" max="100" value={newPerf.overtime_score} onChange={e => setNewPerf({...newPerf, overtime_score: parseInt(e.target.value)||0})} className="w-full rounded-md border-gray-300 shadow-sm focus:border-amber-500 focus:ring-amber-500 sm:text-sm" />
                        </div>

                        <div className="md:col-span-2">
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Manager Commentary (AI will translate to a score)</label>
                          <div className="flex gap-2">
                            <textarea
                              rows={3}
                              value={newPerf.boss_commentary}
                              onChange={e => setNewPerf({...newPerf, boss_commentary: e.target.value})}
                              placeholder="e.g. John has shown exceptional leadership in Q1 but needs to improve his time management..."
                              className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-amber-500 focus:ring-amber-500 sm:text-sm"
                            />
                            <button
                              type="button"
                              onClick={handleTranslateCommentary}
                              disabled={bossCommentaryLoading || !newPerf.boss_commentary.trim()}
                              className="self-start px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition disabled:opacity-50 whitespace-nowrap flex items-center gap-1.5"
                            >
                              {bossCommentaryLoading ? <div className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" /> : <BrainCircuit className="w-3 h-3" />}
                              AI Score
                            </button>
                          </div>
                          {newPerf.boss_review_score > 0 && (
                            <p className="text-xs font-bold text-indigo-700 mt-1.5">
                              ✓ Manager Score translated: <span className="text-lg">{newPerf.boss_review_score}</span>/100
                            </p>
                          )}
                        </div>

                        <div className="md:col-span-2 flex justify-end gap-3 mt-2">
                          <button type="button" onClick={() => setShowAddPerf(false)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition">Cancel</button>
                          <button type="submit" disabled={perfSaving} className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white px-6 py-2 rounded-lg font-medium shadow-md transition">
                            {perfSaving ? 'Saving...' : 'Save Evaluation'}
                          </button>
                        </div>
                      </form>
                    )}

                    {/* Performance records table */}
                    <div className="overflow-hidden bg-white shadow-sm border border-gray-200 rounded-xl">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Employee</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Month</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Tasks</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Manager</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Attend.</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Composite</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Action</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {allPerformanceRecords.map(rec => (
                            <tr key={rec.id} className="hover:bg-amber-50/40 transition">
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="font-semibold text-gray-900">{rec.employee_name}</div>
                                <div className="text-xs text-indigo-600 font-medium">{rec.employee_role}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-700">{rec.month}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-800">{rec.task_score}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-800">{rec.boss_review_score}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-800">{rec.attendance_score}</td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-extrabold ${
                                  rec.composite_score >= 80 ? 'bg-emerald-100 text-emerald-800' :
                                  rec.composite_score >= 60 ? 'bg-amber-100 text-amber-800' :
                                  'bg-rose-100 text-rose-700'
                                }`}>{rec.composite_score}%</span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <button
                                  onClick={() => setSelectedPerfEmployee(rec.employee_id)}
                                  className="text-indigo-600 hover:text-indigo-800 text-xs font-bold flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition"
                                >
                                  View Full
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {allPerformanceRecords.length === 0 && (
                        <div className="py-12 text-center text-gray-400 flex flex-col items-center gap-2">
                          <Award className="w-10 h-10 text-gray-200" />
                          <p className="font-semibold">No performance evaluations compiled yet.</p>
                          <p className="text-sm">Use the "Add Evaluation" button to compile monthly scores for each employee.</p>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default HumanResources;
