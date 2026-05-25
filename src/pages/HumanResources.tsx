import React, { useState, useEffect } from 'react';

import { fetchApi } from '../lib/api';
import { Users, UserPlus, FileText, BrainCircuit, Search, Plus, Briefcase } from 'lucide-react';

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

const HumanResources: React.FC = () => {
  // const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'staff' | 'applicants' | 'screening'>('staff');
  
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
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
      alert('Failed to add staff');
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
      alert('Failed to add applicant');
    }
  };

  const handleRunScreening = async () => {
    if (!jobDescription.trim()) {
      alert('Please enter a job description to screen against.');
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
        alert(res.message || 'Screening complete.');
      }
    } catch (error: any) {
      alert('Screening error: ' + error.message);
    } finally {
      setIsScreening(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header section with Glassmorphism */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-900 to-navy p-8 text-white shadow-2xl border border-white/10">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 h-64 w-64 rounded-full bg-white/5 blur-3xl"></div>
        <div className="absolute bottom-0 left-10 h-40 w-40 rounded-full bg-blue-500/20 blur-3xl"></div>
        
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight mb-2 flex items-center gap-3">
              <Users className="w-8 h-8 text-indigo-400" />
              Human Resources Hub
            </h1>
            <p className="text-indigo-200 text-sm max-w-xl leading-relaxed">
              Manage your workforce, process job applications, and leverage Ikiké AI to autonomously screen and assess candidates against job requirements.
            </p>
          </div>
          
          {/* Glassy Tabs */}
          <div className="flex p-1.5 space-x-1 bg-white/10 backdrop-blur-md rounded-xl border border-white/20 shadow-inner">
            <button
              onClick={() => setActiveTab('staff')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-300 ${activeTab === 'staff' ? 'bg-white text-indigo-900 shadow-md transform scale-105' : 'text-white/80 hover:bg-white/10 hover:text-white'}`}
            >
              <Briefcase className="w-4 h-4" />
              Staff
            </button>
            <button
              onClick={() => setActiveTab('applicants')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-300 ${activeTab === 'applicants' ? 'bg-white text-indigo-900 shadow-md transform scale-105' : 'text-white/80 hover:bg-white/10 hover:text-white'}`}
            >
              <FileText className="w-4 h-4" />
              Applicants
            </button>
            <button
              onClick={() => setActiveTab('screening')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-300 ${activeTab === 'screening' ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-md transform scale-105 border border-white/20' : 'text-white/80 hover:bg-white/10 hover:text-white'}`}
            >
              <BrainCircuit className="w-4 h-4" />
              AI Screening
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
                    Active Employees
                  </h2>
                  <button 
                    onClick={() => setShowAddStaff(!showAddStaff)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition shadow-md flex items-center gap-2"
                  >
                    <UserPlus className="w-4 h-4" />
                    {showAddStaff ? 'Cancel' : 'Add Employee'}
                  </button>
                </div>

                {showAddStaff && (
                  <form onSubmit={handleAddStaff} className="bg-white p-6 rounded-xl border border-indigo-100 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Full Name</label>
                      <input type="text" required value={newStaff.name} onChange={e => setNewStaff({...newStaff, name: e.target.value})} className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Role</label>
                      <input type="text" required value={newStaff.role} onChange={e => setNewStaff({...newStaff, role: e.target.value})} className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Department</label>
                      <input type="text" required value={newStaff.department} onChange={e => setNewStaff({...newStaff, department: e.target.value})} className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Email</label>
                      <input type="email" value={newStaff.email} onChange={e => setNewStaff({...newStaff, email: e.target.value})} className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                    </div>
                    <div className="md:col-span-2 flex justify-end mt-2">
                      <button type="submit" className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium shadow-md hover:bg-indigo-700 transition">Save Employee</button>
                    </div>
                  </form>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {employees.map(emp => (
                    <div key={emp.id} className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition p-5 group relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-bl-full -z-10 transition-transform group-hover:scale-110"></div>
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h3 className="font-bold text-gray-900">{emp.name}</h3>
                          <p className="text-sm text-indigo-600 font-medium">{emp.role}</p>
                        </div>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${emp.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-700'}`}>
                          {emp.status}
                        </span>
                      </div>
                      <div className="space-y-2 text-sm text-gray-600">
                        <p className="flex justify-between border-b border-gray-50 pb-1">
                          <span className="text-gray-400">Dept</span>
                          <span className="font-medium text-gray-800">{emp.department}</span>
                        </p>
                        <p className="flex justify-between border-b border-gray-50 pb-1">
                          <span className="text-gray-400">Hired</span>
                          <span className="font-medium text-gray-800">{emp.hire_date}</span>
                        </p>
                      </div>
                    </div>
                  ))}
                  {employees.length === 0 && (
                    <div className="col-span-full py-12 text-center text-gray-400">No employees found. Add one above.</div>
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
                    Job Applicants
                  </h2>
                  <button 
                    onClick={() => setShowAddApplicant(!showAddApplicant)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition shadow-md flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    {showAddApplicant ? 'Cancel' : 'Add Applicant'}
                  </button>
                </div>

                {showAddApplicant && (
                  <form onSubmit={handleAddApplicant} className="bg-white p-6 rounded-xl border border-indigo-100 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Full Name</label>
                      <input type="text" required value={newApplicant.name} onChange={e => setNewApplicant({...newApplicant, name: e.target.value})} className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Role Applied</label>
                      <input type="text" required value={newApplicant.role_applied} onChange={e => setNewApplicant({...newApplicant, role_applied: e.target.value})} className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Email</label>
                      <input type="email" required value={newApplicant.email} onChange={e => setNewApplicant({...newApplicant, email: e.target.value})} className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Experience (Years)</label>
                      <input type="number" required value={newApplicant.experience_years} onChange={e => setNewApplicant({...newApplicant, experience_years: parseInt(e.target.value)})} className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Skills / Resume Details</label>
                      <textarea rows={3} value={newApplicant.resume_text} onChange={e => setNewApplicant({...newApplicant, resume_text: e.target.value})} className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"></textarea>
                    </div>
                    <div className="md:col-span-2 flex justify-end mt-2">
                      <button type="submit" className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium shadow-md hover:bg-indigo-700 transition">Save Applicant</button>
                    </div>
                  </form>
                )}

                <div className="overflow-hidden bg-white shadow-sm border border-gray-200 rounded-xl">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Candidate</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Role & Exp</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">AI Score</th>
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
                            {app.experience_years} years exp.
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize
                              ${app.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : ''}
                              ${app.status === 'reviewed' ? 'bg-blue-100 text-blue-800' : ''}
                              ${app.status === 'accepted' ? 'bg-emerald-100 text-emerald-800' : ''}
                              ${app.status === 'rejected' ? 'bg-red-100 text-red-800' : ''}
                            `}>
                              {app.status}
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
                              <span className="text-sm text-gray-400 italic">Not screened</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {applicants.length === 0 && (
                    <div className="py-12 text-center text-gray-400">No applicants found.</div>
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
                      <h2 className="text-xl font-bold text-indigo-900">Ikiké Strategic AI Screening</h2>
                      <p className="text-sm text-indigo-700 mt-1 max-w-3xl">
                        Enter a job description below. Ikiké will autonomously evaluate all <span className="font-bold">pending</span> applicants against these criteria, assign a clinical fit score, and provide a professional assessment.
                      </p>
                    </div>
                  </div>

                  <div className="mt-6">
                    <label className="block text-sm font-bold text-indigo-900 mb-2">Target Job Description & Requirements</label>
                    <textarea 
                      rows={6}
                      value={jobDescription}
                      onChange={e => setJobDescription(e.target.value)}
                      placeholder="e.g. Seeking a Senior Supply Chain Manager with 5+ years experience. Must be proficient in logistics software, OHADA accounting standards, and team leadership..."
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
                            Ikiké is Analyzing Profiles...
                          </>
                        ) : (
                          <>
                            <Search className="w-5 h-5" />
                            Run Autonomous AI Screening
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {screeningResults.length > 0 && (
                  <div className="mt-8 space-y-4">
                    <h3 className="text-lg font-bold text-gray-900 border-b pb-2">Screening Results</h3>
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
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Fit Score</span>
                          </div>
                        </div>

                        <div className="mt-4 bg-gray-50 rounded-lg p-4 text-sm text-gray-700 leading-relaxed border border-gray-100">
                          <strong className="text-indigo-900 block mb-1 text-xs uppercase tracking-wider">Ikiké Clinical Assessment:</strong>
                          {res.ai_assessment}
                        </div>
                      </div>
                    ))}
                  </div>
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
