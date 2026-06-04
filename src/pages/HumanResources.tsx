import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchApi } from '../lib/api';
import { Users, UserPlus, FileText, BrainCircuit, Search, Plus, Briefcase, Upload, Cpu } from 'lucide-react';

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

const HumanResources: React.FC = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'staff' | 'applicants' | 'screening' | 'attendance'>('staff');
  
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceLog[]>([]);
  const [loading, setLoading] = useState(true);

  // AI Screening State
  const [jobDescription, setJobDescription] = useState('');
  const [isScreening, setIsScreening] = useState(false);
  const [screeningResults, setScreeningResults] = useState<Applicant[]>([]);
  
  // New Staff Form State
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [newStaff, setNewStaff] = useState({ name: '', email: '', phone: '', role: '', department: '', salary: 0, hire_date: new Date().toISOString().split('T')[0] });

  // New Applicant Form State
  const [showAddApplicant, setShowAddApplicant] = useState(false);
  const [newApplicant, setNewApplicant] = useState({ name: '', email: '', phone: '', role_applied: '', experience_years: 0, skills: '', resume_text: '' });

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'staff') {
        const data = await fetchApi('/hr/employees');
        setEmployees(data);
      } else if (activeTab === 'applicants') {
        const data = await fetchApi('/hr/applicants');
        setApplicants(data);
      } else if (activeTab === 'attendance') {
        const [logsData, employeesData] = await Promise.all([
          fetchApi('/hr/attendance'),
          fetchApi('/hr/employees')
        ]);
        setAttendanceLogs(logsData);
        setEmployees(employeesData);
      }
    } catch (error) {
      console.error('[HR] Fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetchApi('/hr/employees', { method: 'POST', body: JSON.stringify(newStaff) });
      setShowAddStaff(false);
      fetchData();
      setNewStaff({ name: '', email: '', phone: '', role: '', department: '', salary: 0, hire_date: new Date().toISOString().split('T')[0] });
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
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                    <Briefcase className="w-5 h-5 text-indigo-600" />
                    {t('hr_active_employees', 'Active Employees')}
                  </h2>
                  <button 
                    onClick={() => setShowAddStaff(!showAddStaff)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition shadow-md flex items-center gap-2"
                  >
                    <UserPlus className="w-4 h-4" />
                    {showAddStaff ? t('hr_cancel', 'Cancel') : t('hr_add_employee', 'Add Employee')}
                  </button>
                </div>

                {showAddStaff && (
                  <form onSubmit={handleAddStaff} className="bg-white p-6 rounded-xl border border-indigo-100 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{t('hr_full_name', 'Full Name')}</label>
                      <input type="text" required value={newStaff.name} onChange={e => setNewStaff({...newStaff, name: e.target.value})} className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{t('hr_role', 'Role')}</label>
                      <input type="text" required value={newStaff.role} onChange={e => setNewStaff({...newStaff, role: e.target.value})} className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{t('hr_department', 'Department')}</label>
                      <input type="text" required value={newStaff.department} onChange={e => setNewStaff({...newStaff, department: e.target.value})} className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{t('hr_email', 'Email')}</label>
                      <input type="email" value={newStaff.email} onChange={e => setNewStaff({...newStaff, email: e.target.value})} className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                    </div>
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
                    </div>
                  ))}
                  {employees.length === 0 && (
                    <div className="col-span-full py-12 text-center text-gray-400">{t('hr_no_employees', 'No employees found. Add one above.')}</div>
                  )}
                </div>
              </div>
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
                      <div className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                      </div>
                      <span className="font-bold text-sm text-emerald-600">{t('hr_device_online', 'Online')}</span>
                    </div>

                    <div className="mt-4 pt-3 border-t border-gray-100 text-xs text-gray-400 flex justify-between">
                      <span>IP: 192.168.1.180</span>
                      <span>Port: 5005 (ADMS)</span>
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
                  <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-indigo-600" />
                    {t('hr_attendance_records', 'Smart Attendance Log')}
                  </h3>

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
          </>
        )}
      </div>
    </div>
  );
};

export default HumanResources;
