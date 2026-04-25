import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Users, 
  ClipboardList, 
  Calendar, 
  Palmtree, 
  Brain, 
  FileText, 
  Settings, 
  LogOut, 
  Plus, 
  Trash2, 
  Check, 
  ChevronLeft, 
  ChevronRight,
  Info,
  Archive
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  getSupabaseConfig, 
  saveSupabaseConfig, 
  removeSupabaseConfig, 
  createSupabaseClient,
  setSb,
  getSb
} from './lib/supabase';
import type { 
  Admin, 
  Employee, 
  TaskType, 
  Assignment, 
  ShiftType, 
  ScheduleEntry, 
  LeaveEntry, 
  AppTab 
} from './types';

// Constants
const SESSION_KEY = 'taskflow_session';
const MAX_VL = 15;
const MAX_SL = 10;
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function App() {
  const [loading, setLoading] = useState(true);
  const [loadingText, setLoadingText] = useState('Connecting...');
  const [config, setConfig] = useState(getSupabaseConfig());
  const [user, setUser] = useState<{ name: string; isAdmin: boolean; isGuest: boolean } | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>('schedule');
  const [data, setData] = useState<{
    admins: string[];
    employees: string[];
    tasks: string[];
    assignments: Assignment[];
    shiftTypes: ShiftType[];
    scheduleEntries: ScheduleEntry[];
    leaveEntries: LeaveEntry[];
  }>({
    admins: [],
    employees: [],
    tasks: [],
    assignments: [],
    shiftTypes: [],
    scheduleEntries: [],
    leaveEntries: []
  });

  // Database Initialization
  const initDb = useCallback(async (cfg: { url: string; key: string }) => {
    setLoading(true);
    setLoadingText('Connecting to database...');
    try {
      const client = createSupabaseClient(cfg.url, cfg.key);
      setSb(client);
      
      // Test connection
      const { error } = await client.from('admins').select('id').limit(1);
      if (error) throw error;

      await fetchAllData(client);
      
      // Restore session
      const saved = localStorage.getItem(SESSION_KEY);
      if (saved) {
        const sess = JSON.parse(saved);
        setUser(sess);
      }
      
      setLoading(false);
    } catch (err: any) {
      console.error(err);
      setLoading(false);
      setConfig(null);
      removeSupabaseConfig();
    }
  }, []);

  const fetchAllData = async (client: any) => {
    const [adm, emp, tsk, asgn, aemp, sht, se, lv] = await Promise.all([
      client.from('admins').select('*').order('name'),
      client.from('employees').select('*').order('name'),
      client.from('tasks').select('*').order('name'),
      client.from('assignments').select('*').order('duty_from', { ascending: false }),
      client.from('assignment_employees').select('*'),
      client.from('shift_types').select('*').order('sort_order'),
      client.from('schedule_entries').select('*'),
      client.from('leave_entries').select('*')
    ]);

    const aeMap: Record<string, string[]> = {};
    (aemp.data || []).forEach((r: any) => {
      if (!aeMap[r.assignment_id]) aeMap[r.assignment_id] = [];
      aeMap[r.assignment_id].push(r.employee_name);
    });

    setData({
      admins: (adm.data || []).map((r: any) => r.name),
      employees: (emp.data || []).map((r: any) => r.name),
      tasks: (tsk.data || []).map((r: any) => r.name),
      assignments: (asgn.data || []).map((a: any) => ({
        id: a.id,
        task: a.task_name,
        dutyFrom: a.duty_from,
        dutyTo: a.duty_to,
        dateAssigned: a.date_assigned,
        employees: aeMap[a.id] || [],
        addedBy: a.added_by || ''
      })),
      shiftTypes: sht.data || [],
      scheduleEntries: se.data || [],
      leaveEntries: lv.data || []
    });
  };

  useEffect(() => {
    if (config) {
      initDb(config);
    } else {
      setLoading(false);
    }
  }, [config, initDb]);

  const handleLogin = (name: string, isAdmin: boolean, isGuest: boolean) => {
    const session = { name, isAdmin, isGuest };
    setUser(session);
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    if (isAdmin) setActiveTab('admin');
    else setActiveTab('schedule');
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem(SESSION_KEY);
  };

  const changeConfig = () => {
    removeSupabaseConfig();
    setConfig(null);
    setUser(null);
  };

  if (!config) return <ConfigScreen onSave={(cfg) => { setConfig(cfg); saveSupabaseConfig(cfg.url, cfg.key); }} />;
  if (loading) return <LoadingScreen text={loadingText} />;
  if (!user) return <LoginScreen admins={data.admins} employees={data.employees} onLogin={handleLogin} onResetConfig={changeConfig} />;

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <Topbar user={user} onLogout={handleLogout} />
      <div className="sticky top-0 z-50 overflow-x-auto border-b border-[var(--border)] bg-[var(--surface)] px-4 sm:px-8">
        <div className="flex h-14 items-center gap-2">
          {user.isAdmin && (
            <TabButton 
              active={activeTab === 'admin'} 
              onClick={() => setActiveTab('admin')} 
              icon={<Settings size={18} />} 
              label="Admin" 
            />
          )}
          {!user.isGuest && (
            <TabButton 
              active={activeTab === 'employee'} 
              onClick={() => setActiveTab('employee')} 
              icon={<ClipboardList size={18} />} 
              label="Tasks" 
            />
          )}
          <TabButton 
            active={activeTab === 'schedule'} 
            onClick={() => setActiveTab('schedule')} 
            icon={<Calendar size={18} />} 
            label="Schedule" 
          />
          {!user.isGuest && (
            <TabButton 
              active={activeTab === 'leave'} 
              onClick={() => setActiveTab('leave')} 
              icon={<Palmtree size={18} />} 
              label="Leaves" 
            />
          )}
          {!user.isGuest && (
            <TabButton 
              active={activeTab === 'skills'} 
              onClick={() => setActiveTab('skills')} 
              icon={<Brain size={18} />} 
              label="Skills" 
            />
          )}
          {user.isAdmin && (
            <TabButton 
              active={activeTab === 'notes'} 
              onClick={() => setActiveTab('notes')} 
              icon={<FileText size={18} />} 
              label="Notes" 
            />
          )}
        </div>
      </div>

      <main className="mx-auto max-w-7xl p-4 sm:p-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'admin' && <AdminView data={data} user={user} refresh={() => fetchAllData(getSb())} />}
            {activeTab === 'employee' && <TaskView data={data} user={user} />}
            {activeTab === 'schedule' && <ScheduleView data={data} user={user} refresh={() => fetchAllData(getSb())} />}
            {activeTab === 'leave' && <LeaveView data={data} user={user} refresh={() => fetchAllData(getSb())} />}
            {activeTab === 'skills' && <SkillsView user={user} />}
            {activeTab === 'notes' && <NotesView user={user} />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

// Sub-components (Drafts for now, will implement logic in subsequent steps)
function LoadingScreen({ text }: { text: string }) {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-[var(--bg)] bg-opacity-80 backdrop-blur-md">
      <div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--border)] border-t-[var(--accent)]" />
      <div className="text-sm text-[var(--muted)]">{text}</div>
    </div>
  );
}

function ConfigScreen({ onSave }: { onSave: (cfg: { url: string; key: string }) => void }) {
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_30%_50%,#1a1f2e_0%,#0d0f14_70%)] px-4">
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 shadow-2xl sm:p-10">
        <div className="font-serif text-2xl text-[var(--accent)] sm:text-3xl">HD Management System</div>
        <div className="mb-8 mt-2 text-xs leading-relaxed text-[var(--muted)] sm:text-sm">Connect your Supabase project to get started.</div>
        
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Supabase Project URL</label>
            <input 
              type="text" 
              value={url} 
              onChange={e => setUrl(e.target.value)}
              placeholder="https://your-project.supabase.co"
              className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]" 
            />
          </div>
          <div>
            <label className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Supabase Anon Key</label>
            <input 
              type="text" 
              value={key} 
              onChange={e => setKey(e.target.value)}
              placeholder="your-anon-key"
              className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]" 
            />
          </div>
          <button 
            onClick={() => onSave({ url: url.trim(), key: key.trim() })}
            className="w-full rounded-[var(--radius)] bg-[var(--accent)] py-3 text-sm font-bold text-[#0d0f14] transition-all hover:-translate-y-0.5 hover:bg-[#f0d060]"
          >
            Connect to Supabase
          </button>
        </div>
      </div>
    </div>
  );
}

function LoginScreen({ admins, employees, onLogin, onResetConfig }: any) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const doLogin = () => {
    const n = name.trim();
    if (!n) return;
    const foundAdmin = admins.find((a: string) => a.toLowerCase() === n.toLowerCase());
    if (foundAdmin) return onLogin(foundAdmin, true, false);
    const foundEmp = employees.find((e: string) => e.toLowerCase() === n.toLowerCase());
    if (foundEmp) return onLogin(foundEmp, false, false);
    setError('Name not found. Check spelling or contact admin.');
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_30%_50%,#1a1f2e_0%,#0d0f14_70%)] px-4">
      <div className="relative z-10 w-full max-w-[420px] rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-10 shadow-2xl sm:p-12">
        <div className="font-serif text-3xl text-[var(--accent)]">Sign In</div>
        <div className="mb-8 mt-2 text-sm text-[var(--muted)]">Enter your name to manage or view tasks</div>
        
        <div className="space-y-6">
          <div>
            <label className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Username</label>
            <input 
              type="text" 
              value={name} 
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doLogin()}
              placeholder="Enter your name"
              className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]" 
            />
            {error && <div className="mt-2 text-xs text-[var(--red)]">{error}</div>}
          </div>
          
          <button 
            onClick={doLogin}
            className="w-full rounded-[var(--radius)] bg-[var(--accent)] py-3 text-sm font-bold text-[#0d0f14] transition-all hover:bg-[#f0d060]"
          >
            Log In
          </button>
          
          <div className="flex items-center gap-3">
            <hr className="flex-1 border-[var(--border)]" />
            <span className="text-[10px] text-[var(--muted)]">OR</span>
            <hr className="flex-1 border-[var(--border)]" />
          </div>
          
          <button 
            onClick={() => onLogin('Guest', false, true)}
            className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface2)] py-3 text-sm font-bold text-[var(--text)] transition-all hover:border-[var(--accent)]"
          >
            View as Guest
          </button>

          <div className="text-center">
            <button onClick={onResetConfig} className="text-[10px] text-[var(--muted)] hover:text-[var(--text)] underline decoration-[var(--border)]">Change Database Configuration</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Topbar({ user, onLogout }: any) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3 sm:px-8">
      <div className="font-serif text-xl text-[var(--accent)]">System Overview</div>
      <div className="flex items-center gap-3 sm:gap-4">
        <div className="hidden items-center gap-2 text-xs text-[var(--muted)] sm:flex">
          <div className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent2)]" /> Live
        </div>
        <div className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface2)] px-3 py-1.5 text-xs sm:px-4">
          <div className="h-2 w-2 rounded-full bg-[var(--green)]" />
          <span className="font-medium">{user.name}</span>
          <span className={`font-mono text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${
            user.isAdmin ? 'bg-yellow-500/10 border-yellow-500/30 text-[var(--accent)]' : 
            user.isGuest ? 'bg-purple-500/10 border-purple-500/30 text-[var(--purple)]' : 
            'bg-teal-500/10 border-teal-500/30 text-[var(--accent2)]'
          }`}>
            {user.isAdmin ? 'Admin' : user.isGuest ? 'Guest' : 'Employee'}
          </span>
        </div>
        <button onClick={onLogout} className="flex items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface2)] px-4 py-2 text-xs font-semibold hover:border-[var(--accent)]">
          <LogOut size={14} />
          <span className="hidden sm:inline">Sign Out</span>
        </button>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: any) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-2 border-b-3 px-4 py-3 text-xs font-semibold transition-all hover:text-[var(--text)] ${
        active ? 'border-[var(--accent)] bg-[var(--accent)]/5 text-[var(--accent)]' : 'border-transparent text-[var(--muted)]'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VIEW COMPONENTS 
// ─────────────────────────────────────────────────────────────────────────────

function AdminView({ data, user, refresh }: any) {
  const [adminName, setAdminName] = useState('');
  const [empName, setEmpName] = useState('');
  const [taskName, setTaskName] = useState('');
  
  const [assignTask, setAssignTask] = useState('');
  const [dutyFrom, setDutyFrom] = useState(new Date().toISOString().slice(0, 10));
  const [dutyTo, setDutyTo] = useState(new Date().toISOString().slice(0, 10));
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState('');
  
  const [editingAssignment, setEditingAssignment] = useState<any>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);

  const [historyFilter, setHistoryFilter] = useState({ from: '', to: '', task: '', emp: '' });

  const addAdmin = async () => {
    if (!adminName.trim()) return;
    const { error } = await getSb().from('admins').insert({ name: adminName.trim(), added_by: user.name });
    if (error) alert(error.message);
    else { setAdminName(''); refresh(); }
  };

  const addEmployee = async () => {
    if (!empName.trim()) return;
    const { error } = await getSb().from('employees').insert({ name: empName.trim(), added_by: user.name });
    if (error) alert(error.message);
    else { setEmpName(''); refresh(); }
  };

  const addTaskType = async () => {
    if (!taskName.trim()) return;
    const { error } = await getSb().from('tasks').insert({ name: taskName.trim(), added_by: user.name });
    if (error) alert(error.message);
    else { setTaskName(''); refresh(); }
  };

  const prepareAssign = () => {
    if (!assignTask || !dutyFrom || !dutyTo || selectedEmployees.length === 0) {
      alert('Please fill all fields and select employees');
      return;
    }
    setShowConfirmModal(true);
  };

  const confirmAssign = async () => {
    setShowConfirmModal(false);
    
    if (editingAssignment) {
      // Update existing assignment
      const { error } = await getSb().from('assignments').update({
        task_name: assignTask,
        duty_from: dutyFrom,
        duty_to: dutyTo
      }).eq('id', editingAssignment.id);

      if (error) { alert(error.message); return; }

      // Update employees (delete then re-insert is simplest)
      await getSb().from('assignment_employees').delete().eq('assignment_id', editingAssignment.id);
      const rows = selectedEmployees.map(e => ({ assignment_id: editingAssignment.id, employee_name: e }));
      const { error: e2 } = await getSb().from('assignment_employees').insert(rows);
      
      if (e2) alert(e2.message);
      else { 
        setEditingAssignment(null);
        resetForm();
        refresh(); 
      }
    } else {
      // Create new assignment
      const { data: res, error } = await getSb().from('assignments').insert({
        task_name: assignTask,
        duty_from: dutyFrom,
        duty_to: dutyTo,
        added_by: user.name
      }).select('id').single();

      if (error) { alert(error.message); return; }

      const rows = selectedEmployees.map(e => ({ assignment_id: res.id, employee_name: e }));
      const { error: e2 } = await getSb().from('assignment_employees').insert(rows);
      
      if (e2) {
        alert(e2.message);
      } else {
        // Automation: If SDP or DELTA and autoRotate is checked, create next day assignment
        if (autoRotate && (assignTask === 'SDP' || assignTask === 'DELTA')) {
          const nextTask = assignTask === 'SDP' ? 'DELTA' : 'SDP';
          const nextFrom = new Date(dutyTo);
          nextFrom.setDate(nextFrom.getDate() + 1);
          const nextTo = new Date(nextFrom);
          
          const nextFromStr = nextFrom.toISOString().slice(0, 10);
          const nextToStr = nextTo.toISOString().slice(0, 10);

          const { data: nextRes, error: nextErr } = await getSb().from('assignments').insert({
            task_name: nextTask,
            duty_from: nextFromStr,
            duty_to: nextToStr,
            added_by: `${user.name} (Auto)`
          }).select('id').single();

          if (!nextErr) {
            const nextRows = selectedEmployees.map(e => ({ assignment_id: nextRes.id, employee_name: e }));
            await getSb().from('assignment_employees').insert(nextRows);
          }
        }

        resetForm();
        refresh(); 
      }
    }
  };

  const resetForm = () => {
    setAssignTask('');
    setDutyFrom(new Date().toISOString().slice(0, 10));
    setDutyTo(new Date().toISOString().slice(0, 10));
    setSelectedEmployees([]);
    setEditingAssignment(null);
  };

  const handleEdit = (a: any) => {
    setEditingAssignment(a);
    setAssignTask(a.task);
    setDutyFrom(a.dutyFrom);
    setDutyTo(a.dutyTo);
    setSelectedEmployees(a.employees);
    // Scroll to top of assignment section if needed
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const getConflictedTask = (e: string) => {
    if (assignTask === 'GCASH' || assignTask === 'ELOAD') return null;
    const found = data.assignments.find((a: any) => {
      if (editingAssignment && a.id === editingAssignment.id) return false;
      if (a.task !== 'SDP' && a.task !== 'DELTA') return false;
      if (!a.employees.includes(e)) return false;
      return (dutyFrom <= a.dutyTo && dutyTo >= a.dutyFrom);
    });
    return found ? found.task : null;
  };

  const filteredHistory = data.assignments.filter((a: any) => {
    const overlaps = (f: string, t: string, af: string, at: string) => {
      if (f && at < f) return false;
      if (t && af > t) return false;
      return true;
    };
    if (!overlaps(historyFilter.from, historyFilter.to, a.dutyFrom, a.dutyTo)) return false;
    if (historyFilter.task && a.task !== historyFilter.task) return false;
    if (historyFilter.emp && !a.employees.includes(historyFilter.emp)) return false;
    return true;
  });

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <Card title="Admin Accounts">
          <div className="flex gap-2">
            <input 
              value={adminName} onChange={e => setAdminName(e.target.value)} 
              onKeyDown={e => e.key === 'Enter' && addAdmin()}
              placeholder="New admin..." className="flex-1 bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--accent)]" 
            />
            <button onClick={addAdmin} className="bg-[var(--accent)] text-black px-4 py-2 rounded-lg text-sm font-bold hover:bg-[#f0d060]"><Plus size={16} /></button>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            {data.admins.map((a: string) => (
              <div key={a} className="flex items-center gap-2 bg-[var(--surface2)] px-3 py-2 rounded-lg border border-[var(--border)]">
                <Users size={14} className="text-[var(--accent)]" />
                <span className="text-sm">{a}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Employee Accounts">
          <div className="flex gap-2">
            <input 
              value={empName} onChange={e => setEmpName(e.target.value)} 
              onKeyDown={e => e.key === 'Enter' && addEmployee()}
              placeholder="New employee..." className="flex-1 bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--accent)]" 
            />
            <button onClick={addEmployee} className="bg-[var(--accent)] text-black px-4 py-2 rounded-lg text-sm font-bold hover:bg-[#f0d060]"><Plus size={16} /></button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {data.employees.map((e: string) => (
              <span key={e} className="bg-[var(--accent2)]/10 text-[var(--accent2)] border border-[var(--accent2)]/30 px-3 py-1 rounded-full text-xs font-mono">{e}</span>
            ))}
          </div>
        </Card>

        <Card title="Task Types">
          <div className="flex gap-2">
            <input 
              value={taskName} onChange={e => setTaskName(e.target.value)} 
              onKeyDown={e => e.key === 'Enter' && addTaskType()}
              placeholder="Task name..." className="flex-1 bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--accent)]" 
            />
            <button onClick={addTaskType} className="bg-[var(--accent)] text-black px-4 py-2 rounded-lg text-sm font-bold hover:bg-[#f0d060]"><Plus size={16} /></button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {data.tasks.map((t: string) => (
              <span key={t} className="bg-[var(--purple)]/10 text-[var(--purple)] border border-[var(--purple)]/30 px-3 py-1 rounded-full text-xs font-mono">{t}</span>
            ))}
          </div>
        </Card>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 sm:p-8">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="font-serif text-2xl mb-1">{editingAssignment ? 'Edit Assignment' : 'Assign Task'}</h2>
            <p className="text-sm text-[var(--muted)]">
              {editingAssignment ? `Modifying assignment for ${editingAssignment.task}` : 'Create a new task assignment for a group of employees.'}
            </p>
          </div>
          {editingAssignment && (
            <button 
              onClick={resetForm}
              className="text-xs font-bold text-[var(--red)] border border-[var(--red)]/30 bg-[var(--red)]/5 px-4 py-2 rounded-xl hover:bg-[var(--red)]/10"
            >
              Cancel Edit
            </button>
          )}
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)] mb-2">Select Task</label>
              <select 
                value={assignTask} onChange={e => setAssignTask(e.target.value)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-[var(--radius)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
              >
                <option value="">Choose task...</option>
                {data.tasks.map((t: string) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            {(assignTask === 'SDP' || assignTask === 'DELTA') && (
              <div className="flex items-center gap-2 px-1">
                <input 
                  type="checkbox" 
                  id="autoRotate" 
                  checked={autoRotate} 
                  onChange={e => setAutoRotate(e.target.checked)}
                  className="w-4 h-4 rounded border-[var(--border)] bg-[var(--bg)] text-[var(--accent)]"
                />
                <label htmlFor="autoRotate" className="text-xs text-[var(--muted)] hover:text-[var(--text)] cursor-pointer select-none">
                  Auto-rotate to {assignTask === 'SDP' ? 'DELTA' : 'SDP'} on the next day
                </label>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)] mb-2">Duty From</label>
                <input type="date" value={dutyFrom} onChange={e => setDutyFrom(e.target.value)} className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-[var(--radius)] px-4 py-3 text-sm outline-none" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)] mb-2">Duty To</label>
                <input type="date" value={dutyTo} onChange={e => setDutyTo(e.target.value)} className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-[var(--radius)] px-4 py-3 text-sm outline-none" />
              </div>
            </div>
          </div>
          
          <div className="flex flex-col">
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)] mb-2">Select Employees</label>
            <div className="mb-3">
              <input 
                type="text"
                placeholder="Search employees..."
                value={employeeSearch}
                onChange={e => setEmployeeSearch(e.target.value)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs outline-none focus:border-[var(--accent)]"
              />
            </div>
            <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-2 border border-[var(--border)] rounded-xl bg-[var(--bg)] flex-1">
              {data.employees
                .filter((e: string) => e.toLowerCase().includes(employeeSearch.toLowerCase()))
                .map((e: string) => {
                  const conflict = getConflictedTask(e);

                  return (
                    <button 
                      key={e} 
                      disabled={!!conflict}
                      onClick={() => selectedEmployees.includes(e) ? setSelectedEmployees(selectedEmployees.filter(x => x !== e)) : setSelectedEmployees([...selectedEmployees, e])}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                        selectedEmployees.includes(e) 
                          ? 'bg-[var(--accent)] text-black border-[var(--accent)]' 
                          : conflict 
                            ? 'bg-[var(--red)]/5 border-[var(--red)]/20 text-[var(--red)]/40 cursor-not-allowed'
                            : 'bg-[var(--surface2)] border-[var(--border)] text-[var(--muted)]'
                      }`}
                    >
                      {e} {conflict && `(${conflict})`}
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
        
        <button 
          onClick={prepareAssign} 
          className="w-full bg-[var(--accent)] text-black py-4 rounded-xl font-bold hover:bg-[#f0d060] transition-colors"
        >
          {editingAssignment ? 'Update Assignment' : 'Assign Employees'}
        </button>
      </div>

      {showConfirmModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-8 w-full max-w-md shadow-2xl">
            <h3 className="font-serif text-2xl mb-2">Confirm Assignment</h3>
            <p className="text-sm text-[var(--muted)] mb-8">
              Are you sure you want to {editingAssignment ? 'update this' : 'create this new'} assignment?
            </p>
            
            <div className="bg-[var(--bg)] p-4 rounded-2xl border border-[var(--border)] mb-8 space-y-3">
              <div className="flex justify-between text-xs">
                <span className="text-[var(--muted)]">Task:</span>
                <span className="font-bold text-[var(--accent)]">{assignTask}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-[var(--muted)]">Period:</span>
                <span className="font-mono">{dutyFrom} to {dutyTo}</span>
              </div>
              <div className="flex justify-between text-xs items-start">
                <span className="text-[var(--muted)]">Team:</span>
                <div className="flex flex-wrap gap-1 justify-end max-w-[60%]">
                   {selectedEmployees.map(e => <span key={e} className="bg-[var(--surface2)] px-2 py-0.5 rounded-lg border border-[var(--border)] text-[10px]">{e}</span>)}
                </div>
              </div>
            </div>

            <div className="flex gap-4">
              <button 
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 bg-[var(--surface2)] border border-[var(--border)] py-3 rounded-xl text-sm font-bold hover:border-[var(--muted)]"
              >
                Back
              </button>
              <button 
                onClick={confirmAssign}
                className="flex-1 bg-[var(--accent)] text-black py-3 rounded-xl text-sm font-bold shadow-lg shadow-[var(--accent)]/20"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-2xl">Assignment History</h2>
          <span className="text-[10px] font-mono bg-[var(--surface2)] px-3 py-1 rounded-full border border-[var(--border)] text-[var(--muted)]">{filteredHistory.length} records</span>
        </div>
        
        <div className="flex flex-wrap gap-4 items-end bg-[var(--surface)] p-4 rounded-xl border border-[var(--border)] mb-4">
          <div className="space-y-1">
            <label className="text-[9px] uppercase font-bold text-[var(--muted)]">From</label>
            <input type="date" value={historyFilter.from} onChange={e => setHistoryFilter({...historyFilter, from: e.target.value})} className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs outline-none w-36" />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] uppercase font-bold text-[var(--muted)]">To</label>
            <input type="date" value={historyFilter.to} onChange={e => setHistoryFilter({...historyFilter, to: e.target.value})} className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs outline-none w-36" />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] uppercase font-bold text-[var(--muted)]">Task</label>
            <select value={historyFilter.task} onChange={e => setHistoryFilter({...historyFilter, task: e.target.value})} className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs outline-none w-36">
              <option value="">All</option>
              {data.tasks.map((t: any) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <button onClick={() => setHistoryFilter({from:'', to:'', task:'', emp:''})} className="bg-[var(--surface2)] border border-[var(--border)] px-4 py-2 rounded-lg text-xs font-bold hover:border-[var(--muted)]">Clear</button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[var(--surface2)] text-[10px] uppercase tracking-wider font-bold text-[var(--muted)] border-b border-[var(--border)]">
                <th className="px-6 py-4 w-40">Task</th>
                <th className="px-6 py-4">Duty Period</th>
                <th className="px-6 py-4">Employees</th>
                <th className="px-6 py-4 w-32">Assigned By</th>
                <th className="px-6 py-4 w-20"></th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-[var(--border)]">
              {filteredHistory.map((a: any) => (
                <tr key={a.id} className="hover:bg-white/[0.02] group">
                  <td className="px-6 py-4 font-bold">
                    <span className={`px-2 py-1 rounded-md ${
                      a.task === 'SDP' ? 'text-emerald-400 bg-emerald-500/5' :
                      a.task === 'DELTA' ? 'text-cyan-400 bg-cyan-500/5' :
                      ''
                    }`}>{a.task}</span>
                  </td>
                  <td className="px-6 py-4 font-mono text-[11px] text-[var(--muted)]">{a.dutyFrom} → {a.dutyTo}</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1.5">
                      {a.employees.map((e: string) => (
                        <span 
                          key={e} 
                          className={`px-2 py-0.5 rounded-full text-[10px] border ${
                            a.task === 'SDP' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                            a.task === 'DELTA' ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' :
                            'bg-[var(--purple)]/10 text-[var(--purple)] border border-[var(--purple)]/30'
                          }`}
                        >
                          {e}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-[11px] text-[var(--accent)] font-mono">{a.addedBy}</td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => handleEdit(a)}
                      className="p-2 hover:bg-[var(--surface2)] rounded-lg text-[var(--muted)] hover:text-[var(--accent)] transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Settings size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6">
      <div className="text-[10px] font-bold uppercase tracking-[2px] text-[var(--muted)] mb-5">{title}</div>
      {children}
    </div>
  );
}

function TaskView({ data, user }: any) {
  const [filter, setFilter] = useState<'current' | 'history'>('current');
  const today = new Date().toISOString().slice(0, 10);
  
  const tasks = data.assignments.filter((a: any) => {
    if (filter === 'current') return a.dutyTo >= today;
    return a.dutyTo < today;
  }).sort((a: any, b: any) => {
    if (filter === 'current') return a.dutyFrom.localeCompare(b.dutyFrom);
    return b.dutyFrom.localeCompare(a.dutyFrom);
  });

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-serif text-3xl mb-1">Hello, {user.name}! 👋</h1>
        <p className="text-[var(--muted)]">All task assignments across the team.</p>
      </div>

      <div className="flex gap-2 mb-8 bg-[var(--surface)] p-1 rounded-xl border border-[var(--border)] w-fit">
        <button 
          onClick={() => setFilter('current')}
          className={`px-6 py-2 rounded-lg text-xs font-bold transition-all ${filter === 'current' ? 'bg-[var(--accent)] text-black' : 'text-[var(--muted)] hover:text-[var(--text)]'}`}
        >
          📌 Current & Upcoming
        </button>
        <button 
          onClick={() => setFilter('history')}
          className={`px-6 py-2 rounded-lg text-xs font-bold transition-all ${filter === 'history' ? 'bg-[var(--accent)] text-black' : 'text-[var(--muted)] hover:text-[var(--text)]'}`}
        >
          🕓 Previous Tasks
        </button>
      </div>

      {tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-20 text-center border-2 border-dashed border-[var(--border)] rounded-3xl">
          <Archive size={48} className="text-[var(--muted)] mb-4" />
          <h3 className="text-xl font-serif">No tasks found</h3>
          <p className="text-sm text-[var(--muted)]">Nothing in this category for now.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tasks.map((a: any) => {
            const isMe = a.employees.includes(user.name);
            return (
              <div 
                key={a.id} 
                className={`group relative bg-[var(--surface)] border rounded-[20px] overflow-hidden transition-all hover:-translate-y-1 hover:shadow-2xl ${
                  isMe ? 'border-[var(--accent)]/50 bg-[var(--accent)]/5' : 'border-[var(--border)] hover:border-[var(--accent)]'
                }`}
              >
                <div className="bg-[var(--surface2)] p-5 border-b border-[var(--border)] flex justify-between items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="text-lg font-bold truncate">{a.task}</div>
                    <div className="flex items-center gap-2 mt-1 text-[10px] font-mono text-[var(--muted)]">
                      <Calendar size={12} />
                      {a.dutyFrom} → {a.dutyTo}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className={`text-[9px] font-bold uppercase tracking-widest border px-2 py-0.5 rounded-full ${
                      a.task === 'SDP' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                      a.task === 'DELTA' ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' :
                      'bg-[var(--purple)]/10 text-[var(--purple)] border border-[var(--purple)]/30'
                    }`}>{a.task}</span>
                    {isMe && <span className="text-[9px] font-bold uppercase tracking-widest bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/30 px-2 py-0.5 rounded-full">Your Task ✓</span>}
                  </div>
                </div>
                <div className="p-5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] mb-3">Assigned Team</div>
                  <div className="flex flex-wrap gap-2">
                    {a.employees.map((e: string) => (
                      <div key={e} className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border ${
                        e === user.name ? 'bg-[var(--accent)]/10 border-[var(--accent)] text-[var(--accent)] font-bold' : 'bg-[var(--surface2)] border-[var(--border)] text-[var(--muted)]'
                      }`}>
                        {e === user.name && <div className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />}
                        {e}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ScheduleView({ data, user, refresh }: any) {
  const [currentMonth, setCurrentMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedCell, setSelectedCell] = useState<{ date: string; shiftId?: number; leaveType?: string } | null>(null);
  const [showBulkModal, setShowBulkModal] = useState(false);

  const [year, month] = currentMonth.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const dates = Array.from({ length: daysInMonth }, (_, i) => `${currentMonth}-${String(i + 1).padStart(2, '0')}`);

  // Split dates into weeks (Mon-Sun)
  const weeks: string[][] = [];
  let currentWeek: string[] = [];
  dates.forEach(d => {
    currentWeek.push(d);
    if (new Date(d).getDay() === 0) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  });
  if (currentWeek.length > 0) weeks.push(currentWeek);

  const getShiftEmployees = (date: string, shiftId: number) => {
    return data.scheduleEntries.filter((e: any) => e.schedule_date === date && e.shift_type_id === shiftId).map((e: any) => e.employee_name);
  };

  const getLeaveEmployees = (date: string, type: string) => {
    return data.leaveEntries.filter((e: any) => e.schedule_date === date && e.leave_type === type).map((e: any) => e.employee_name);
  };

  const handleCellClick = (date: string, shiftId?: number, leaveType?: string) => {
    if (!user.isAdmin) return;
    setSelectedCell({ date, shiftId, leaveType });
  };

  const saveCell = async (selected: string[]) => {
    if (!selectedCell) return;
    const { date, shiftId, leaveType } = selectedCell;
    
    // Simple state update for demo purpose - in real app, perform upsert logic
    if (shiftId) {
      // Manage shift entries
      const current = getShiftEmployees(date, shiftId);
      const toAdd = selected.filter(e => !current.includes(e));
      const toRemove = current.filter(e => !selected.includes(e));
      
      if (toAdd.length) {
        await getSb().from('schedule_entries').insert(toAdd.map(e => ({
          schedule_date: date, shift_type_id: shiftId, employee_name: e, added_by: user.name
        })));
      }
      if (toRemove.length) {
        await getSb().from('schedule_entries').delete().eq('schedule_date', date).eq('shift_type_id', shiftId).in('employee_name', toRemove);
      }
    } else if (leaveType) {
      // Manage leave entries
      const current = getLeaveEmployees(date, leaveType);
      const toAdd = selected.filter(e => !current.includes(e));
      const toRemove = current.filter(e => !selected.includes(e));
      
      if (toAdd.length) {
        await getSb().from('leave_entries').insert(toAdd.map(e => ({
          schedule_date: date, employee_name: e, leave_type: leaveType, added_by: user.name
        })));
      }
      if (toRemove.length) {
        await getSb().from('leave_entries').delete().eq('schedule_date', date).eq('leave_type', leaveType).in('employee_name', toRemove);
      }
    }
    
    setSelectedCell(null);
    refresh();
  };

  const handleBulkSave = async (params: any) => {
    const { selectedEmps, shiftId, leaveType, startDate, endDate } = params;
    
    // Generate dates
    const datesInRange: string[] = [];
    let curr = new Date(startDate);
    const end = new Date(endDate);
    while (curr <= end) {
      datesInRange.push(curr.toISOString().slice(0, 10));
      curr.setDate(curr.getDate() + 1);
    }

    if (shiftId) {
      const rows = datesInRange.flatMap(d => selectedEmps.map((emp: string) => ({
        schedule_date: d, shift_type_id: shiftId, employee_name: emp, added_by: user.name
      })));
      await getSb().from('schedule_entries').upsert(rows, { onConflict: 'schedule_date,shift_type_id,employee_name' });
    } else if (leaveType) {
      const rows = datesInRange.flatMap(d => selectedEmps.map((emp: string) => ({
        schedule_date: d, employee_name: emp, leave_type: leaveType, added_by: user.name
      })));
      await getSb().from('leave_entries').upsert(rows, { onConflict: 'schedule_date,employee_name,leave_type' });
    }

    setShowBulkModal(false);
    refresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h2 className="font-serif text-3xl">Monthly Schedule</h2>
          {user.isAdmin && (
            <button 
              onClick={() => setShowBulkModal(true)}
              className="bg-[var(--accent)] text-black px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-[#f0d060]"
            >
              <Plus size={16} /> Bulk Assign
            </button>
          )}
        </div>
        <div className="flex bg-[var(--surface)] border border-[var(--border)] rounded-xl p-1 gap-1">
          <button onClick={() => {
            const d = new Date(year, month - 2, 1);
            setCurrentMonth(d.toISOString().slice(0, 7));
          }} className="p-2 hover:bg-[var(--surface2)] rounded-lg text-[var(--muted)]"><ChevronLeft size={20} /></button>
          <input type="month" value={currentMonth} onChange={e => setCurrentMonth(e.target.value)} className="bg-transparent text-sm font-mono px-2 outline-none" />
          <button onClick={() => {
            const d = new Date(year, month, 1);
            setCurrentMonth(d.toISOString().slice(0, 7));
          }} className="p-2 hover:bg-[var(--surface2)] rounded-lg text-[var(--muted)]"><ChevronRight size={20} /></button>
        </div>
      </div>

      <div className="space-y-12">
        {weeks.map((week, wi) => (
          <div key={wi} className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)] bg-[var(--surface2)] px-3 py-1 rounded-full border border-[var(--border)]">Week {wi + 1}</span>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-[var(--border)]">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-[var(--surface2)] text-left">
                    <th className="px-4 py-3 text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider border-r border-[var(--border)] w-40">Shift</th>
                    {week.map(d => {
                      const isSun = new Date(d).getDay() === 0;
                      const isToday = d === new Date().toISOString().slice(0, 10);
                      return (
                        <th key={d} className={`px-4 py-3 border-r border-[var(--border)] min-w-[140px] text-center ${isSun ? 'text-[var(--red)]' : ''} ${isToday ? 'bg-[var(--accent)]/10 text-[var(--accent)] font-bold' : ''}`}>
                          <div className="text-xl font-serif">{new Date(d).getDate()}</div>
                          <div className="text-[10px] font-bold uppercase">{DAY_NAMES[new Date(d).getDay()]}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {data.shiftTypes.map((st: any) => (
                    <tr key={st.id}>
                      <td className="px-4 py-3 bg-[var(--surface2)] border-r border-[var(--border)] text-xs font-bold">{st.name}</td>
                      {week.map(d => {
                        const emps = getShiftEmployees(d, st.id);
                        return (
                          <td key={d} className="p-1 border-r border-[var(--border)] group relative">
                            <div className="flex flex-wrap gap-1 min-h-[40px] justify-center items-center">
                              {emps.map(e => <span key={e} className="text-[9px] bg-[var(--accent)]/5 border border-[var(--accent)]/20 text-[var(--accent)] px-2 py-0.5 rounded-full font-mono">{e}</span>)}
                              {user.isAdmin && (
                                <button 
                                  onClick={() => handleCellClick(d, st.id)}
                                  className="opacity-0 group-hover:opacity-100 absolute inset-0 flex items-center justify-center bg-[var(--accent)]/10 backdrop-blur-[2px] transition-opacity"
                                >
                                  <Plus size={16} className="text-[var(--accent)]" />
                                </button>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr className="bg-[var(--surface)]">
                    <td className="px-4 py-3 bg-[var(--surface2)] border-r border-[var(--border)] text-xs font-bold text-[#f9a8d4]">Day Off</td>
                    {week.map(d => (
                      <td key={d} className="p-1 border-r border-[var(--border)] group relative">
                         <div className="flex flex-wrap gap-1 min-h-[40px] justify-center items-center">
                            {getLeaveEmployees(d, 'Dayoff').map(e => <span key={e} className="text-[9px] bg-pink-500/10 border border-pink-500/30 text-[#f9a8d4] px-2 py-0.5 rounded-full font-mono">{e}</span>)}
                            {user.isAdmin && <button onClick={() => handleCellClick(d, undefined, 'Dayoff')} className="opacity-0 group-hover:opacity-100 absolute inset-0 flex items-center justify-center bg-pink-500/10 backdrop-blur-[2px] transition-opacity"><Plus size={16} className="text-pink-400" /></button>}
                         </div>
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-[var(--surface)]">
                    <td className="px-4 py-3 bg-[var(--surface2)] border-r border-[var(--border)] text-xs font-bold text-[#c084fc]">Pre-Approved Leave</td>
                    {week.map(d => (
                      <td key={d} className="p-1 border-r border-[var(--border)] group relative">
                         <div className="flex flex-wrap gap-1 min-h-[40px] justify-center items-center">
                            {getLeaveEmployees(d, 'Pre Approved Leave').map(e => <span key={e} className="text-[9px] bg-purple-500/10 border border-purple-500/30 text-[#c084fc] px-2 py-0.5 rounded-full font-mono">{e}</span>)}
                            {user.isAdmin && <button onClick={() => handleCellClick(d, undefined, 'Pre Approved Leave')} className="opacity-0 group-hover:opacity-100 absolute inset-0 flex items-center justify-center bg-purple-500/10 backdrop-blur-[2px] transition-opacity"><Plus size={16} className="text-purple-400" /></button>}
                         </div>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {selectedCell && (
        <SelectionModal 
          title={selectedCell.shiftId ? data.shiftTypes.find((s:any) => s.id === selectedCell.shiftId)?.name : selectedCell.leaveType}
          date={selectedCell.date}
          items={data.employees}
          selected={selectedCell.shiftId ? getShiftEmployees(selectedCell.date, selectedCell.shiftId) : getLeaveEmployees(selectedCell.date, selectedCell.leaveType!)}
          onClose={() => setSelectedCell(null)}
          onSave={saveCell}
          assignments={data.assignments}
        />
      )}

      {showBulkModal && (
        <BulkAssignModal 
          employees={data.employees}
          shiftTypes={data.shiftTypes}
          onClose={() => setShowBulkModal(false)}
          onSave={handleBulkSave}
          assignments={data.assignments}
        />
      )}
    </div>
  );
}

function BulkAssignModal({ employees, shiftTypes, onClose, onSave, assignments }: any) {
  const [selectedEmps, setSelectedEmps] = useState<string[]>([]);
  const [shiftId, setShiftId] = useState<number | string>('');
  const [leaveType, setLeaveType] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));

  const handleSave = () => {
    if (selectedEmps.length === 0 || (!shiftId && !leaveType) || !startDate || !endDate) {
      alert('Please select employees, a shift/leave type, and a date range.');
      return;
    }
    onSave({ selectedEmps, shiftId, leaveType, startDate, endDate });
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-6 sm:p-8 w-full max-w-2xl shadow-2xl overflow-y-auto max-h-[90vh]">
        <h3 className="font-serif text-2xl mb-1">Bulk Assign Schedule</h3>
        <p className="text-sm text-[var(--muted)] mb-6">Assign multiple employees to a shift or leave for a specific date range.</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
           <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] mb-2">From</label>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm outline-none" />
                 </div>
                 <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] mb-2">To</label>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm outline-none" />
                 </div>
              </div>

              <div>
                 <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] mb-2">Assign As</label>
                 <select 
                   value={shiftId || leaveType} 
                   onChange={e => {
                     const val = e.target.value;
                     if (['Dayoff', 'Pre Approved Leave'].includes(val)) {
                       setLeaveType(val);
                       setShiftId('');
                     } else {
                       setShiftId(Number(val));
                       setLeaveType('');
                     }
                   }}
                   className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
                 >
                    <option value="">Select Shift or Leave...</option>
                    <optgroup label="Shifts">
                       {shiftTypes.map((st: any) => <option key={st.id} value={st.id}>{st.name}</option>)}
                    </optgroup>
                    <optgroup label="Leaves">
                       <option value="Dayoff">Day Off</option>
                       <option value="Pre Approved Leave">Pre-Approved Leave</option>
                    </optgroup>
                 </select>
              </div>
           </div>

           <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] mb-2">Select Employees</label>
              <div className="flex flex-wrap gap-2 p-2 border border-[var(--border)] rounded-2xl bg-[var(--bg)] min-h-[120px]">
                {employees.map((e: string) => {
                  const conflicted = assignments.some((a: any) => {
                    if (a.task !== 'SDP' && a.task !== 'DELTA') return false;
                    if (!a.employees.includes(e)) return false;
                    return (startDate <= a.dutyTo && endDate >= a.dutyFrom);
                  });

                  return (
                    <button 
                      key={e} 
                      disabled={conflicted}
                      onClick={() => selectedEmps.includes(e) ? setSelectedEmps(selectedEmps.filter(x => x !== e)) : setSelectedEmps([...selectedEmps, e])}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all border ${
                        selectedEmps.includes(e) 
                          ? 'bg-[var(--accent)] text-black border-[var(--accent)]' 
                          : conflicted 
                            ? 'bg-[var(--red)]/5 border-[var(--red)]/20 text-[var(--red)]/40 cursor-not-allowed'
                            : 'bg-[var(--surface2)] border-[var(--border)] text-[var(--muted)]'
                      }`}
                    >
                      {e} {conflicted && '(Busy)'}
                    </button>
                  );
                })}
              </div>
           </div>
        </div>
        
        <div className="flex gap-4">
          <button onClick={onClose} className="flex-1 bg-[var(--surface2)] border border-[var(--border)] py-3 rounded-xl text-sm font-bold hover:border-[var(--muted)]">Cancel</button>
          <button onClick={handleSave} className="flex-1 bg-[var(--accent)] text-black py-3 rounded-xl text-sm font-bold">Save Bulk Assignment</button>
        </div>
      </div>
    </div>
  );
}

function SelectionModal({ title, date, items, selected: initialSelected, onClose, onSave, assignments }: any) {
  const [selected, setSelected] = useState<string[]>(initialSelected);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-6 sm:p-8 w-full max-w-md shadow-2xl">
        <h3 className="font-serif text-2xl mb-1">{title}</h3>
        <p className="text-sm text-[var(--muted)] mb-6">{date}</p>
        
        <div className="flex flex-wrap gap-2 max-h-[40vh] overflow-y-auto mb-8">
          {items.map((item: string) => {
             const conflicted = assignments.some((a: any) => {
               if (a.task !== 'SDP' && a.task !== 'DELTA') return false;
               if (!a.employees.includes(item)) return false;
               return (date <= a.dutyTo && date >= a.dutyFrom);
             });

             return (
               <button 
                 key={item}
                 disabled={conflicted}
                 onClick={() => selected.includes(item) ? setSelected(selected.filter(x => x !== item)) : setSelected([...selected, item])}
                 className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all border ${
                   selected.includes(item) 
                     ? 'bg-[var(--accent)] text-black border-[var(--accent)] font-bold' 
                     : conflicted 
                       ? 'bg-[var(--red)]/5 border-[var(--red)]/20 text-[var(--red)]/40 cursor-not-allowed'
                       : 'bg-[var(--surface2)] border-[var(--border)] text-[var(--muted)] hover:border-[var(--muted)]'
                 }`}
               >
                 {item} {conflicted && '(Busy)'}
               </button>
             );
          })}
        </div>
        
        <div className="flex gap-4">
          <button onClick={onClose} className="flex-1 bg-[var(--surface2)] border border-[var(--border)] py-3 rounded-xl text-sm font-bold hover:border-[var(--muted)]">Cancel</button>
          <button onClick={() => onSave(selected)} className="flex-1 bg-[var(--accent)] text-black py-3 rounded-xl text-sm font-bold">Save</button>
        </div>
      </div>
    </div>
  );
}

function LeaveView({ data, user, refresh }: any) {
  const [currentMonth, setCurrentMonth] = useState(new Date().toISOString().slice(0, 7));
  const [year, month] = currentMonth.split('-').map(Number);
  
  const [empId, setEmpId] = useState('');
  const [lType, setLType] = useState('Pre Approved Leave');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const monthsLeaves = data.leaveEntries.filter((e: any) => e.schedule_date.startsWith(currentMonth) && e.leave_type !== 'Dayoff');

  const addLeave = async () => {
    if (!empId || !fromDate || !toDate) return;
    // Generate dates between from and to
    const dates: string[] = [];
    let curr = new Date(fromDate);
    const end = new Date(toDate);
    while (curr <= end) {
      dates.push(curr.toISOString().slice(0, 10));
      curr.setDate(curr.getDate() + 1);
    }

    const { error } = await getSb().from('leave_entries').insert(dates.map(d => ({
      schedule_date: d,
      employee_name: empId,
      leave_type: lType,
      added_by: user.name
    })));

    if (error) alert(error.message);
    else { setFromDate(''); setToDate(''); refresh(); }
  };

  const removeLeave = async (date: string, emp: string, type: string) => {
    if (!user.isAdmin) return;
    const { error } = await getSb().from('leave_entries').delete()
      .eq('schedule_date', date)
      .eq('employee_name', emp)
      .eq('leave_type', type);
    if (error) alert(error.message);
    else refresh();
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-serif text-3xl">Pre-Approved Leaves</h2>
        <div className="flex bg-[var(--surface)] border border-[var(--border)] rounded-xl p-1 gap-1">
          <button onClick={() => {
            const d = new Date(year, month - 2, 1);
            setCurrentMonth(d.toISOString().slice(0, 7));
          }} className="p-2 hover:bg-[var(--surface2)] rounded-lg text-[var(--muted)]"><ChevronLeft size={20} /></button>
          <input type="month" value={currentMonth} onChange={e => setCurrentMonth(e.target.value)} className="bg-transparent text-sm font-mono px-2 outline-none" />
          <button onClick={() => {
            const d = new Date(year, month, 1);
            setCurrentMonth(d.toISOString().slice(0, 7));
          }} className="p-2 hover:bg-[var(--surface2)] rounded-lg text-[var(--muted)]"><ChevronRight size={20} /></button>
        </div>
      </div>

      {user.isAdmin && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)] mb-5">➕ Add Leave Record</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 items-end">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-[var(--muted)] uppercase">Employee</label>
              <select value={empId} onChange={e => setEmpId(e.target.value)} className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm outline-none">
                <option value="">Select...</option>
                {data.employees.map((e: string) => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-[var(--muted)] uppercase">Type</label>
              <select value={lType} onChange={e => setLType(e.target.value)} className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm outline-none">
                <option value="Pre Approved Leave">PAL</option>
                <option value="Sick Leave">SL</option>
                <option value="Half Day">HD</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-[var(--muted)] uppercase">From</label>
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-[var(--muted)] uppercase">To</label>
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm" />
            </div>
            <button onClick={addLeave} className="bg-[var(--accent)] text-black font-bold h-10 rounded-lg text-sm hover:bg-[#f0d060]">Add Leave</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {monthsLeaves.length === 0 ? (
          <div className="col-span-full py-20 text-center text-[var(--muted)] border-2 border-dashed border-[var(--border)] rounded-3xl">No leave records for this month</div>
        ) : (
          monthsLeaves.map((l: any) => (
            <div key={l.id} className="bg-[var(--surface)] border border-[var(--border)] p-4 rounded-2xl flex justify-between items-center group">
              <div>
                <div className="font-bold">{l.employee_name}</div>
                <div className="text-[10px] font-mono text-[var(--muted)] mt-0.5">{l.schedule_date}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                  l.leave_type === 'Sick Leave' ? 'bg-orange-500/10 border-orange-500/30 text-orange-400' :
                  l.leave_type === 'Half Day' ? 'bg-green-500/10 border-green-500/30 text-green-400' :
                  'bg-purple-500/10 border-purple-500/30 text-purple-400'
                }`}>
                  {l.leave_type === 'Sick Leave' ? 'SL' : l.leave_type === 'Half Day' ? 'HD' : 'PAL'}
                </span>
                {user.isAdmin && (
                  <button onClick={() => removeLeave(l.schedule_date, l.employee_name, l.leave_type)} className="text-[var(--red)] opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/10 rounded-lg transition-all">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function SkillsView({ user }: any) {
  const [curYear, setCurYear] = useState(new Date().getFullYear());
  const [skills, setSkills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSkills = async () => {
      setLoading(true);
      const { data } = await getSb().from('soft_skills').select('*').eq('year', curYear);
      setSkills(data || []);
      setLoading(false);
    };
    fetchSkills();
  }, [curYear]);

  const saveContent = async (month: number, row: number, content: string) => {
    if (!user.isAdmin) return;
    const { error } = await getSb().from('soft_skills').upsert({
      year: curYear,
      month,
      row_num: row,
      content
    }, { onConflict: 'year,month,row_num' });
    if (error) console.error(error);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-serif text-3xl">Soft Skills Training</h2>
        <div className="flex bg-[var(--surface)] border border-[var(--border)] rounded-xl p-1 gap-1">
          <button onClick={() => setCurYear(y => y - 1)} className="p-2 hover:bg-[var(--surface2)] rounded-lg text-[var(--muted)]"><ChevronLeft size={20} /></button>
          <span className="flex items-center px-4 font-mono text-sm">{curYear}</span>
          <button onClick={() => setCurYear(y => y + 1)} className="p-2 hover:bg-[var(--surface2)] rounded-lg text-[var(--muted)]"><ChevronRight size={20} /></button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {MONTH_NAMES.map((name, i) => {
          const mIdx = i + 1;
          const r1 = skills.find(s => s.month === mIdx && s.row_num === 1)?.content || '';
          const r2 = skills.find(s => s.month === mIdx && s.row_num === 2)?.content || '';
          
          return (
            <div key={name} className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-lg">
              <div className="bg-[var(--surface2)] px-5 py-3 border-b border-[var(--border)] font-bold text-sm tracking-wide">{name} {curYear}</div>
              <div className="p-4 space-y-4">
                 <div className="space-y-1">
                    <label className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">Training A</label>
                    <textarea 
                      defaultValue={r1}
                      onBlur={(e) => saveContent(mIdx, 1, e.target.value)}
                      readOnly={!user.isAdmin}
                      placeholder={user.isAdmin ? "Input training..." : "No notes yet."}
                      className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl p-3 text-xs min-h-[80px] outline-none focus:border-[var(--accent)] resize-none"
                    />
                 </div>
                 <div className="space-y-1">
                    <label className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">Training B</label>
                    <textarea 
                      defaultValue={r2}
                      onBlur={(e) => saveContent(mIdx, 2, e.target.value)}
                      readOnly={!user.isAdmin}
                      placeholder={user.isAdmin ? "Input training..." : "No notes yet."}
                      className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl p-3 text-xs min-h-[80px] outline-none focus:border-[var(--accent)] resize-none"
                    />
                 </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NotesView({ user }: any) {
  const SECTIONS = [
    { id: 'general', label: 'General Notes', icon: <FileText size={16} /> },
    { id: 'shift_log', label: 'Shift Logs', icon: <Calendar size={16} /> },
    { id: 'paypro', label: 'PayPro / Batch', icon: <Archive size={16} /> }
  ];
  
  const [activeSection, setActiveSection] = useState('general');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchNotes = async () => {
      setLoading(true);
      const { data } = await getSb().from('notes').select('*').eq('section_key', activeSection).order('row_idx');
      setRows(data || []);
      setLoading(false);
    };
    fetchNotes();
  }, [activeSection]);

  const updateRow = async (idx: number, name: string, cols: string[]) => {
    if (!user.isAdmin) return;
    const rowData = { name, cols };
    await getSb().from('notes').upsert({
      section_key: activeSection,
      row_idx: idx,
      row_data: rowData
    }, { onConflict: 'section_key,row_idx' });
  };

  const addRow = () => {
    if (!user.isAdmin) return;
    setRows([...rows, { row_idx: rows.length, row_data: { name: '', cols: Array(5).fill('') } }]);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-serif text-3xl">Collaboration Notes</h2>
        {user.isAdmin && <button onClick={addRow} className="flex items-center gap-2 bg-[var(--accent)] text-black px-4 py-2 rounded-xl text-sm font-bold"><Plus size={16} /> Add Row</button>}
      </div>

      <div className="flex gap-2 p-1 bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-fit overflow-x-auto max-w-full">
         {SECTIONS.map(s => (
           <button 
             key={s.id} onClick={() => setActiveSection(s.id)}
             className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${activeSection === s.id ? 'bg-[var(--accent)] text-black' : 'text-[var(--muted)] hover:text-[var(--text)]'}`}
           >
             {s.icon} {s.label}
           </button>
         ))}
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-x-auto shadow-2xl">
        <table className="w-full border-collapse table-fixed min-w-[800px]">
          <thead>
            <tr className="bg-[var(--surface2)] text-[10px] uppercase font-bold text-[var(--muted)] border-b border-[var(--border)]">
              <th className="w-12 px-2 py-4">#</th>
              <th className="w-40 px-4 py-4 text-left border-r border-[var(--border)]">Name / Topic</th>
              {Array.from({ length: 10 }).map((_, i) => (
                <th key={i} className="px-2 py-4 border-r border-[var(--border)]">{i + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {rows.length === 0 ? (
               <tr><td colSpan={12} className="py-20 text-center text-[var(--muted)] text-sm">No notes entry. Click Add Row to start.</td></tr>
            ) : rows.map((r, i) => (
              <NoteRowComponent key={i} index={i} row={r} readonly={!user.isAdmin} onUpdate={(name, cols) => updateRow(i, name, cols)} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NoteRowComponent({ index, row, readonly, onUpdate }: any) {
  const [name, setName] = useState(row.row_data?.name || '');
  const [cols, setCols] = useState(row.row_data?.cols || Array(10).fill(''));

  const handleBlur = () => {
    onUpdate(name, cols);
  };

  const updateCol = (idx: number, val: string) => {
    const next = [...cols];
    next[idx] = val;
    setCols(next);
  };

  return (
    <tr className="hover:bg-white/[0.01]">
      <td className="text-center font-mono text-[10px] text-[var(--muted)]">{index + 1}</td>
      <td className="border-r border-[var(--border)] p-1">
        <input 
          value={name} onChange={e => setName(e.target.value)} onBlur={handleBlur} readOnly={readonly}
          className="w-full bg-transparent text-xs font-bold px-3 py-1.5 outline-none focus:bg-[var(--accent)]/5" 
        />
      </td>
      {Array.from({ length: 10 }).map((_, ci) => (
        <td key={ci} className="border-r border-[var(--border)] p-0.5">
          <input 
            value={cols[ci] || ''} onChange={e => updateCol(ci, e.target.value)} onBlur={handleBlur} readOnly={readonly}
            className="w-full bg-transparent text-[10px] px-2 py-2 outline-none text-center focus:bg-[var(--accent)]/5" 
          />
        </td>
      ))}
    </tr>
  );
}
