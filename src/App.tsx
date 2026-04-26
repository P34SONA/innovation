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
  Archive,
  Clock,
  Zap,
  Moon,
  X
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

const getTodayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const getMonthStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

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

      <main className={`mx-auto p-4 sm:p-8 ${activeTab === 'schedule' ? 'max-w-full' : 'max-w-7xl'}`}>
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
  const [dutyFrom, setDutyFrom] = useState(getTodayStr());
  const [dutyTo, setDutyTo] = useState(getTodayStr());
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState('');
  
  const [editingAssignment, setEditingAssignment] = useState<any>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);

  const [historyFilter, setHistoryFilter] = useState({ from: '', to: '', task: '', emp: '' });
  const [showBulkTaskModal, setShowBulkTaskModal] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(getMonthStr());

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
          const nextFrom = new Date(dutyTo + 'T00:00:00');
          nextFrom.setDate(nextFrom.getDate() + 1);
          const nextTo = new Date(nextFrom);
          
          const formatDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
          const nextFromStr = formatDate(nextFrom);
          const nextToStr = formatDate(nextTo);

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
    setDutyFrom(getTodayStr());
    setDutyTo(getTodayStr());
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
          <div className="flex gap-2">
            {!editingAssignment && (
              <button 
                onClick={() => setShowBulkTaskModal(true)}
                className="text-xs font-bold text-[var(--accent)] border border-[var(--accent)]/30 bg-[var(--accent)]/5 px-4 py-2 rounded-xl hover:bg-[var(--accent)]/10 flex items-center gap-2"
              >
                <Zap size={14} />
                Bulk Assign Tool
              </button>
            )}
            {editingAssignment && (
              <button 
                onClick={resetForm}
                className="text-xs font-bold text-[var(--red)] border border-[var(--red)]/30 bg-[var(--red)]/5 px-4 py-2 rounded-xl hover:bg-[var(--red)]/10"
              >
                Cancel Edit
              </button>
            )}
          </div>
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

      {showBulkTaskModal && (
        <BulkTaskAssignModal 
          employees={data.employees}
          tasks={data.tasks}
          assignments={data.assignments}
          currentMonth={currentMonth}
          onClose={() => setShowBulkTaskModal(false)}
          onSave={async (params: any) => {
            const { selectedEmps, taskName, startDate, endDate } = params;
            
            const { data: res, error } = await getSb().from('assignments').insert({
              task_name: taskName,
              duty_from: startDate,
              duty_to: endDate,
              added_by: user.name
            }).select('id').single();

            if (error) { alert(error.message); return; }

            const rows = selectedEmps.map((e: string) => ({ assignment_id: res.id, employee_name: e }));
            const { error: e2 } = await getSb().from('assignment_employees').insert(rows);
            
            if (e2) alert(e2.message);
            else {
              setShowBulkTaskModal(false);
              refresh();
            }
          }}
        />
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
  const today = getTodayStr();
  
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
  const [currentMonth, setCurrentMonth] = useState(getMonthStr());
  const [selectedCell, setSelectedCell] = useState<{ date: string; shiftId?: number; leaveType?: string } | null>(null);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);

  const [year, month] = currentMonth.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const dates = Array.from({ length: daysInMonth }, (_, i) => `${currentMonth}-${String(i + 1).padStart(2, '0')}`);

  // Split dates into weeks (Mon-Sun)
  const weeks: string[][] = [];
  let currentWeek: string[] = [];
  dates.forEach(d => {
    currentWeek.push(d);
    if (new Date(d + 'T00:00:00').getDay() === 0) {
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
    const { selectedEmps, shiftId, leaveType, isPayPro, activeDates } = params;
    const datesInRange = activeDates || [];
    
    if (datesInRange.length === 0) return;

    try {
      if (isPayPro) {
        const payProType = data.shiftTypes.find((s:any) => s.name === 'PayPro & Batch Upload');
        if (payProType) {
          const rows = selectedEmps.flatMap((emp: string) => 
            datesInRange
              .filter(d => !data.leaveEntries.some((l: any) => l.employee_name === emp && l.schedule_date === d && l.leave_type === 'Dayoff'))
              .map(d => ({
                schedule_date: d, shift_type_id: payProType.id, employee_name: emp, added_by: user.name
              }))
          );
          if (rows.length > 0) {
            const { error } = await getSb().from('schedule_entries').upsert(rows, { onConflict: 'schedule_date,shift_type_id,employee_name' });
            if (error) throw error;
          }
        }
      } else if (shiftId) {
        // Filter out dates where the employee has a 'Dayoff'
        const rows = selectedEmps.flatMap((emp: string) => 
          datesInRange
            .filter(d => !data.leaveEntries.some((l: any) => l.employee_name === emp && l.schedule_date === d && l.leave_type === 'Dayoff'))
            .map(d => ({
              schedule_date: d, shift_type_id: shiftId, employee_name: emp, added_by: user.name
            }))
        );
        
        if (rows.length > 0) {
          const { error } = await getSb().from('schedule_entries').upsert(rows, { onConflict: 'schedule_date,shift_type_id,employee_name' });
          if (error) throw error;
        }
      } else if (leaveType === 'Dayoff') {
      // Source of truth: For the selected dates, the selection state is final.
      // First, clear existing entries for these dates for ALL employees
      await getSb().from('schedule_entries').delete().in('employee_name', data.employees).in('schedule_date', datesInRange);
      await getSb().from('leave_entries').delete().in('employee_name', data.employees).in('schedule_date', datesInRange).eq('leave_type', 'Dayoff');

      const rows = datesInRange.flatMap(d => selectedEmps.map((emp: string) => ({
        schedule_date: d, employee_name: emp, leave_type: 'Dayoff', added_by: user.name
      })));
      
      if (rows.length > 0) {
        const { error } = await getSb().from('leave_entries').insert(rows);
        if (error) throw error;
      }
    } else if (leaveType) {
        // Other leaves
        const rows = datesInRange.flatMap(d => selectedEmps.map((emp: string) => ({
          schedule_date: d, employee_name: emp, leave_type: leaveType, added_by: user.name
        })));
        const { error } = await getSb().from('leave_entries').insert(rows);
        if (error) throw error;
      }
    } catch (err: any) {
      console.error(err);
      alert('Error saving: ' + (err.message || 'Unknown error'));
      return;
    }

    setShowBulkModal(false);
    refresh();
  };

  const handleBulkDelete = async (params: any) => {
    const { selectedEmps, mode, startDate, endDate } = params;
    
    // Generate dates in YYYY-MM-DD format safely
    const datesInRange: string[] = [];
    let curr = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');
    while (curr <= end) {
      const year = curr.getFullYear();
      const month = String(curr.getMonth() + 1).padStart(2, '0');
      const day = String(curr.getDate()).padStart(2, '0');
      datesInRange.push(`${year}-${month}-${day}`);
      curr.setDate(curr.getDate() + 1);
    }

    if (mode === 'all') {
      await getSb().from('schedule_entries').delete().in('employee_name', selectedEmps).in('schedule_date', datesInRange);
      await getSb().from('leave_entries').delete().in('employee_name', selectedEmps).in('schedule_date', datesInRange);
    } else if (mode === 'shift') {
      const payProType = data.shiftTypes.find((s:any) => s.name === 'PayPro & Batch Upload');
      const query = getSb().from('schedule_entries').delete().in('employee_name', selectedEmps).in('schedule_date', datesInRange);
      if (payProType) query.neq('shift_type_id', payProType.id);
      await query;
    } else if (mode === 'paypro') {
      const payProType = data.shiftTypes.find((s:any) => s.name === 'PayPro & Batch Upload');
      if (payProType) {
        await getSb().from('schedule_entries').delete().in('employee_name', selectedEmps).in('schedule_date', datesInRange).eq('shift_type_id', payProType.id);
      }
    } else if (mode === 'dayoff') {
      await getSb().from('leave_entries').delete().in('employee_name', selectedEmps).in('schedule_date', datesInRange).eq('leave_type', 'Dayoff');
    }

    setShowBulkDeleteModal(false);
    refresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h2 className="font-serif text-3xl">Monthly Schedule</h2>
          {user.isAdmin && (
            <div className="flex gap-2">
              <button 
                onClick={() => setShowBulkModal(true)}
                className="bg-[var(--accent)] text-black px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-[#f0d060]"
              >
                <Plus size={16} /> Bulk Assign
              </button>
              <button 
                onClick={() => setShowBulkDeleteModal(true)}
                className="bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-red-500/20"
              >
                <Trash2 size={16} /> Bulk Delete
              </button>
            </div>
          )}
        </div>
        <div className="flex bg-[var(--surface)] border border-[var(--border)] rounded-xl p-1 gap-1">
          <button onClick={() => {
            const d = new Date(year, month - 2, 1);
            setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
          }} className="p-2 hover:bg-[var(--surface2)] rounded-lg text-[var(--muted)]"><ChevronLeft size={20} /></button>
          <input type="month" value={currentMonth} onChange={e => setCurrentMonth(e.target.value)} className="bg-transparent text-sm font-mono px-2 outline-none" />
          <button onClick={() => {
            const d = new Date(year, month, 1);
            setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
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
                      const isSun = new Date(d + 'T00:00:00').getDay() === 0;
                      const todayStr = getTodayStr();
                      const isToday = d === todayStr;
                      return (
                        <th key={d} className={`px-4 py-3 border-r border-[var(--border)] min-w-[140px] text-center ${isSun ? 'text-[var(--red)]' : ''} ${isToday ? 'bg-[var(--accent)]/10 text-[var(--accent)] font-bold' : ''}`}>
                          <div className="text-xl font-serif">{new Date(d + 'T00:00:00').getDate()}</div>
                          <div className="text-[10px] font-bold uppercase">{DAY_NAMES[new Date(d + 'T00:00:00').getDay()]}</div>
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
                              {emps.map(e => {
                                const isSelf = e === user.name;
                                return (
                                  <span 
                                    key={e} 
                                    className={`text-[9px] px-2 py-0.5 rounded-full font-mono border ${
                                      isSelf 
                                        ? 'bg-[var(--green)]/20 border-[var(--green)]/50 text-[var(--green)]' 
                                        : 'bg-white/5 border-white/10 text-white'
                                    }`}
                                  >
                                    {e}
                                  </span>
                                );
                              })}
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
                            {getLeaveEmployees(d, 'Dayoff').map(e => {
                              const isSelf = e === user.name;
                              return (
                                <span 
                                  key={e} 
                                  className={`text-[9px] px-2 py-0.5 rounded-full font-mono border ${
                                    isSelf 
                                      ? 'bg-[var(--green)]/20 border-[var(--green)]/50 text-[var(--green)]' 
                                      : 'bg-white/5 border-white/10 text-white'
                                  }`}
                                >
                                  {e}
                                </span>
                              );
                            })}
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
                            {getLeaveEmployees(d, 'Pre Approved Leave').map(e => {
                              const isSelf = e === user.name;
                              return (
                                <span 
                                  key={e} 
                                  className={`text-[9px] px-2 py-0.5 rounded-full font-mono border ${
                                    isSelf 
                                      ? 'bg-[var(--green)]/20 border-[var(--green)]/50 text-[var(--green)]' 
                                      : 'bg-white/5 border-white/10 text-white'
                                  }`}
                                >
                                  {e}
                                </span>
                              );
                            })}
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
          scheduleEntries={data.scheduleEntries}
          leaveEntries={data.leaveEntries}
          shiftId={selectedCell.shiftId}
          leaveType={selectedCell.leaveType}
        />
      )}

      {showBulkModal && (
        <BulkAssignModal 
          employees={data.employees}
          shiftTypes={data.shiftTypes}
          onClose={() => setShowBulkModal(false)}
          onSave={handleBulkSave}
          assignments={data.assignments}
          scheduleEntries={data.scheduleEntries}
          leaveEntries={data.leaveEntries}
          currentMonth={currentMonth}
        />
      )}

      {showBulkDeleteModal && (
        <BulkDeleteModal 
          employees={data.employees}
          onClose={() => setShowBulkDeleteModal(false)}
          onSave={handleBulkDelete}
          currentMonth={currentMonth}
        />
      )}
    </div>
  );
}

function BulkAssignModal({ employees, shiftTypes, onClose, onSave, assignments, scheduleEntries, leaveEntries, currentMonth }: any) {
  const [selectedEmps, setSelectedEmps] = useState<string[]>([]);
  const [shiftId, setShiftId] = useState<number | string>('');
  const [leaveType, setLeaveType] = useState('Dayoff');
  const [mode, setMode] = useState<'shift' | 'paypro' | 'dayoff'>('dayoff');
  const [periodType, setPeriodType] = useState<'p1' | 'p2' | 'week'>('p1');
  const [selectedWeekIdx, setSelectedWeekIdx] = useState(0);
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([]);
  const [search, setSearch] = useState('');
  const [excludedDates, setExcludedDates] = useState<string[]>([]);

  const [year, month] = currentMonth.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();

  const dates = Array.from({ length: daysInMonth }, (_, i) => `${currentMonth}-${String(i + 1).padStart(2, '0')}`);
  const weeks: string[][] = [];
  let currentWeek: string[] = [];
  dates.forEach(d => {
    currentWeek.push(d);
    if (new Date(d + 'T00:00:00').getDay() === 0) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  });
  if (currentWeek.length > 0) weeks.push(currentWeek);

  const getActiveDates = () => {
    if (mode === 'dayoff') {
      // For Day Off, we target the whole month but only specific weekdays
      return dates.filter(d => selectedWeekdays.includes(new Date(d + 'T00:00:00').getDay()));
    }
    let baseDates: string[] = [];
    if (periodType === 'p1') baseDates = dates.filter(d => Number(d.split('-')[2]) <= 15);
    else if (periodType === 'p2') baseDates = dates.filter(d => Number(d.split('-')[2]) > 15);
    else baseDates = weeks[selectedWeekIdx] || [];
    
    return baseDates.filter(d => !excludedDates.includes(d));
  };

  const activeDates = getActiveDates();
  const startDate = mode === 'dayoff' ? `${currentMonth}-01` : (activeDates[0] || '');
  const endDate = mode === 'dayoff' ? `${currentMonth}-${String(daysInMonth).padStart(2, '0')}` : (activeDates[activeDates.length - 1] || '');

  // Effect to handle pre-selection and conflict filtering
  useEffect(() => {
    if (mode === 'dayoff') {
      if (selectedWeekdays.length > 0) {
        // User requested: "when admin select day... names assigned for selected day will highlighted"
        // Pre-select employees who already have Dayoff on ANY of the selected dates
        const alreadyAssigned = employees.filter((emp: string) => {
          return activeDates.some(d => 
            leaveEntries.some((l: any) => l.employee_name === emp && l.schedule_date === d && l.leave_type === 'Dayoff')
          );
        });
        setSelectedEmps(alreadyAssigned);
      } else {
        setSelectedEmps([]);
      }
    }
  }, [mode, selectedWeekdays, periodType, selectedWeekIdx, employees, activeDates.length, leaveEntries.length, excludedDates, shiftId]);

  // Reset excluded dates when period or mode changes
  useEffect(() => {
    setExcludedDates([]);
  }, [mode, periodType, selectedWeekIdx]);

  const handleSave = () => {
    if (selectedEmps.length === 0) {
      alert('Please select employees.');
      return;
    }
    if (mode === 'shift' && !shiftId) {
      alert('Please select a shift type.');
      return;
    }
    if (mode === 'dayoff' && selectedWeekdays.length === 0) {
      alert('Please select at least one day of the week.');
      return;
    }
    
    onSave({ 
      selectedEmps, 
      shiftId: mode === 'shift' ? shiftId : '', 
      leaveType: mode === 'dayoff' ? 'Dayoff' : (mode === 'paypro' ? '' : ''),
      isPayPro: mode === 'paypro',
      activeDates
    });
  };

  const checkConflict = (emp: string) => {
    if (mode === 'dayoff') {
      // 1. Conflict if they have a DIFFERENT leave type on the target dates (activeDates).
      const hasOtherLeave = activeDates.some(d => 
        leaveEntries.some((l: any) => l.employee_name === emp && l.schedule_date === d && l.leave_type !== 'Dayoff')
      );
      if (hasOtherLeave) return true;

      // 2. Disable if they have "Dayoff" on OTHER weekdays in the same month that are NOT in the current selection.
      if (activeDates.length > 0) {
        const hasDayOffOnOtherDays = leaveEntries.some((l: any) => 
          l.employee_name === emp && 
          l.leave_type === 'Dayoff' && 
          l.schedule_date.startsWith(currentMonth) && 
          !activeDates.includes(l.schedule_date)
        );
        return hasDayOffOnOtherDays;
      }
      
      return false;
    }

    if (mode === 'shift' || mode === 'paypro') {
      return activeDates.some(d => {
        const hasShift = scheduleEntries.some((s: any) => 
          s.employee_name === emp && s.schedule_date === d
        );
        const hasOtherLeave = leaveEntries.some((l: any) => 
          l.employee_name === emp && l.schedule_date === d && l.leave_type !== 'Dayoff'
        );
        return hasShift || hasOtherLeave;
      });
    }

    // For other modes (paypro), check if any day in the activeDates is busy
    const busyOnAnyActiveDate = (datesToCheck: string[]) => {
      return datesToCheck.some(d => {
        const hasShift = scheduleEntries.some((s: any) => s.employee_name === emp && s.schedule_date === d);
        const hasLeave = leaveEntries.some((l: any) => l.employee_name === emp && l.schedule_date === d);
        return hasShift || hasLeave;
      });
    };

    return busyOnAnyActiveDate(activeDates);
  };

  const WEEKDAYS = [
    { label: 'Mon', value: 1 },
    { label: 'Tue', value: 2 },
    { label: 'Wed', value: 3 },
    { label: 'Thu', value: 4 },
    { label: 'Fri', value: 5 },
    { label: 'Sat', value: 6 },
    { label: 'Sun', value: 0 },
  ];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 text-[var(--text)]">
      <div className="bg-[#1a1d24] border border-[#2d3139] rounded-[32px] p-6 w-full max-w-2xl shadow-2xl overflow-y-auto max-h-[90vh] relative">
        <button onClick={onClose} className="absolute right-6 top-6 text-gray-500 hover:text-white"><X size={20} /></button>
        
        <div className="flex items-center gap-2 mb-1">
          <Users size={20} className="text-[var(--accent)]" />
          <h3 className="font-serif text-2xl">Bulk Assign</h3>
        </div>
        <p className="text-[10px] text-gray-500 mb-6 uppercase tracking-wider font-bold">Assign team shifts — choose period & days.</p>

        <div className="grid grid-cols-3 gap-2 mb-4">
          <button 
            onClick={() => setMode('shift')}
            className={`flex flex-col items-center justify-center p-2 rounded-2xl border transition-all ${mode === 'shift' ? 'bg-[var(--accent)]/10 border-[var(--accent)] text-[var(--accent)]' : 'bg-gray-800/20 border-gray-700 text-gray-500 hover:border-gray-600'}`}
          >
            <Clock size={16} className="mb-0.5" />
            <span className="text-[9px] font-bold uppercase tracking-widest leading-none">Shift</span>
          </button>
          <button 
            onClick={() => setMode('paypro')}
            className={`flex flex-col items-center justify-center p-2 rounded-2xl border transition-all ${mode === 'paypro' ? 'bg-orange-500/10 border-orange-500 text-orange-400' : 'bg-gray-800/20 border-gray-700 text-gray-500 hover:border-gray-600'}`}
          >
            <Zap size={16} className="mb-0.5" />
            <span className="text-center text-[8px] font-bold uppercase tracking-tight leading-tight">PayPro</span>
          </button>
          <button 
            onClick={() => setMode('dayoff')}
            className={`flex flex-col items-center justify-center p-2 rounded-2xl border transition-all ${mode === 'dayoff' ? 'bg-pink-500/10 border-pink-500 text-pink-400' : 'bg-gray-800/20 border-gray-700 text-gray-500 hover:border-gray-600'}`}
          >
            <Moon size={16} className="mb-0.5" />
            <span className="text-[9px] font-bold uppercase tracking-widest leading-none">Day Off</span>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-[9px] font-bold uppercase tracking-widest text-gray-500 mb-2">
              1. {mode === 'dayoff' ? 'Select Days (Mon-Sun)' : 'Select Period'}
            </label>
            
            {mode === 'dayoff' ? (
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map(day => (
                  <button 
                    key={day.value}
                    onClick={() => {
                      setSelectedWeekdays(prev => 
                        prev.includes(day.value) ? prev.filter(v => v !== day.value) : [...prev, day.value]
                      );
                    }}
                    className={`px-3 py-2 rounded-xl text-[10px] font-bold border transition-all flex-1 min-w-[70px] ${
                      selectedWeekdays.includes(day.value) 
                        ? 'bg-pink-500 text-white border-pink-500 shadow-md' 
                        : 'bg-gray-800/40 border-gray-700 text-gray-400 hover:bg-gray-800'
                    }`}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  <button 
                    onClick={() => setPeriodType('p1')}
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-bold border transition-all ${periodType === 'p1' ? 'bg-[var(--accent)] text-black border-[var(--accent)] shadow-md' : 'bg-gray-800/40 border-gray-700 text-gray-400 hover:bg-gray-800'}`}
                  >1–15</button>
                  <button 
                    onClick={() => setPeriodType('p2')}
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-bold border transition-all ${periodType === 'p2' ? 'bg-[var(--accent)] text-black border-[var(--accent)] shadow-md' : 'bg-gray-800/40 border-gray-700 text-gray-400 hover:bg-gray-800'}`}
                  >16–{daysInMonth}</button>
                </div>
                
                <div className="flex flex-wrap gap-1.5 p-3 bg-gray-900/50 rounded-2xl border border-gray-800/50">
                  {(() => {
                    let baseDates: string[] = [];
                    if (periodType === 'p1') baseDates = dates.filter(d => Number(d.split('-')[2]) <= 15);
                    else if (periodType === 'p2') baseDates = dates.filter(d => Number(d.split('-')[2]) > 15);
                    else baseDates = weeks[selectedWeekIdx] || [];

                    if (baseDates.length === 0) return <div className="text-[9px] text-gray-600 italic">No days selected.</div>;
                    
                    return baseDates.map(d => {
                      const dateNum = Number(d.split('-')[2]);
                      const dayName = DAY_NAMES[new Date(d + 'T00:00:00').getDay()];
                      const isSun = new Date(d + 'T00:00:00').getDay() === 0;
                      const isSat = new Date(d + 'T00:00:00').getDay() === 6;
                      const isExcluded = excludedDates.includes(d);
                      
                      return (
                        <button 
                          key={d} 
                          onClick={() => {
                            setExcludedDates(prev => 
                              prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]
                            );
                          }}
                          className={`flex flex-col items-center px-2 py-1 rounded-xl border text-[9px] font-bold transition-all ${
                            isExcluded 
                              ? 'border-gray-800 bg-gray-900/50 text-gray-700 opacity-40' 
                              : isSun 
                                ? 'border-red-500/30 bg-red-500/5 text-red-400' 
                                : isSat 
                                  ? 'border-cyan-500/30 bg-cyan-500/5 text-cyan-400' 
                                  : 'border-gray-700 bg-gray-800/40 text-gray-400 hover:border-gray-600'
                          }`}
                        >
                          <span className="opacity-60">{dayName}</span>
                          <span className="text-[11px]">{dateNum}</span>
                        </button>
                      );
                    });
                  })()}
                </div>
              </>
            )}
          </div>

          {mode === 'shift' && (
            <div>
              <label className="block text-[9px] font-bold uppercase tracking-widest text-gray-500 mb-2">2. Shift Type</label>
              <select 
                value={shiftId} 
                onChange={e => setShiftId(e.target.value)}
                className="w-full bg-[#0d0f14] border border-gray-700 rounded-xl px-4 py-2.5 text-xs outline-none focus:border-[var(--accent)] transition-colors"
              >
                <option value="">— Choose shift —</option>
                {shiftTypes.filter((st:any) => st.name !== 'PayPro & Batch Upload').map((st: any) => (
                  <option key={st.id} value={st.id}>{st.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-[9px] font-bold uppercase tracking-widest text-gray-500">{mode === 'shift' ? '3' : '2'}. Select Employees</label>
              <div className="relative">
                <input 
                  type="text" 
                  placeholder="Search..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="bg-transparent border-b border-gray-700 px-2 py-0.5 text-[10px] outline-none focus:border-[var(--accent)] w-24"
                />
              </div>
            </div>
            <div className={`grid grid-cols-2 sm:grid-cols-3 gap-2 p-1.5 max-h-48 overflow-y-auto custom-scrollbar rounded-xl transition-colors ${mode === 'dayoff' ? 'bg-pink-500/5 border border-pink-500/10' : ''}`}>
              {employees
                .filter((e: string) => e.toLowerCase().includes(search.toLowerCase()))
                .sort()
                .map((e: string) => {
                  const isAssigned = checkConflict(e);
                  const isSelected = selectedEmps.includes(e);

                  return (
                    <button 
                      key={e} 
                      onClick={() => isSelected ? setSelectedEmps(selectedEmps.filter(x => x !== e)) : setSelectedEmps([...selectedEmps, e])}
                      disabled={!!isAssigned}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[10px] font-bold transition-all group ${
                        isSelected 
                          ? mode === 'dayoff' ? 'bg-pink-500 text-white border-pink-500 shadow-md' : 'bg-[var(--accent)] text-black border-[var(--accent)] shadow-md' 
                          : isAssigned 
                            ? 'bg-red-500/10 border-red-500/20 text-red-500/60 opacity-60 cursor-not-allowed grayscale-[0.8]'
                            : (mode === 'shift' || mode === 'paypro')
                              ? 'bg-cyan-500/5 border-cyan-500/20 text-cyan-400 hover:border-cyan-500/50 hover:bg-cyan-500/10'
                              : 'bg-gray-800/30 border-gray-700/50 text-gray-400 hover:border-gray-600'
                      }`}
                    >
                      <div className={`w-3.5 h-3.5 rounded-md border flex items-center justify-center transition-colors ${
                        isSelected 
                          ? 'bg-black/20 border-black/20' 
                          : isAssigned 
                            ? 'bg-red-500/10 border-red-500/30' 
                            : 'bg-black/40 border-gray-600 group-hover:border-cyan-500/50'
                      }`}>
                        {isSelected && <Check size={10} strokeWidth={3} />}
                        {isAssigned && <X size={8} className="text-red-500/60" />}
                      </div>
                      <span className="flex-1 text-left truncate">{e}</span>
                    </button>
                  );
                })}
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <button 
            onClick={onClose} 
            className="flex-1 bg-gray-800/40 border border-gray-700 py-2.5 rounded-xl text-[10px] font-bold text-gray-400 hover:bg-gray-800 transition-all uppercase tracking-wider"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave} 
            className="flex-1 bg-[var(--accent)] text-black py-2.5 rounded-xl text-[10px] font-bold shadow-lg shadow-[var(--accent)]/10 hover:bg-[#f0d060] transition-all transform active:scale-95 uppercase tracking-wider"
          >
            Apply Assignment
          </button>
        </div>
      </div>
    </div>
  );
}

function BulkTaskAssignModal({ employees, tasks, assignments, onClose, onSave, currentMonth }: any) {
  const [selectedEmps, setSelectedEmps] = useState<string[]>([]);
  const [taskName, setTaskName] = useState('');
  const [periodType, setPeriodType] = useState<'p1' | 'p2'>('p1');
  const [search, setSearch] = useState('');

  const [year, month] = currentMonth.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const dates = Array.from({ length: daysInMonth }, (_, i) => `${currentMonth}-${String(i + 1).padStart(2, '0')}`);

  const activeDates = periodType === 'p1' 
    ? dates.filter(d => Number(d.split('-')[2]) <= 15)
    : dates.filter(d => Number(d.split('-')[2]) > 15);

  const startDate = activeDates[0] || '';
  const endDate = activeDates[activeDates.length - 1] || '';

  const checkConflict = (emp: string) => {
    if (!taskName) return null;
    if (taskName !== 'SDP' && taskName !== 'DELTA') return null;

    const conflict = assignments.find((a: any) => {
      if (a.task !== 'SDP' && a.task !== 'DELTA') return false;
      if (!a.employees.includes(emp)) return false;
      return (startDate <= a.dutyTo && endDate >= a.dutyFrom);
    });
    return conflict ? conflict.task : null;
  };

  const handleSave = () => {
    if (selectedEmps.length === 0 || !taskName) {
      alert('Please select task and employees');
      return;
    }
    onSave({ selectedEmps, taskName, startDate, endDate });
  };

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 text-[var(--text)]">
      <div className="bg-[#1a1d24] border border-[#2d3139] rounded-[32px] p-6 w-full max-w-xl shadow-2xl overflow-y-auto max-h-[90vh] relative">
        <button onClick={onClose} className="absolute right-6 top-6 text-gray-500 hover:text-white"><X size={20} /></button>
        
        <div className="flex items-center gap-2 mb-1">
          <Zap size={20} className="text-[var(--accent)]" />
          <h3 className="font-serif text-2xl">Bulk Task Assignment</h3>
        </div>
        <p className="text-[10px] text-gray-500 mb-6 uppercase tracking-wider font-bold">Assign tasks for the entire period.</p>

        <div className="space-y-6">
          <div>
            <label className="block text-[9px] font-bold uppercase tracking-widest text-gray-500 mb-2">1. Select Period</label>
            <div className="flex gap-2">
              <button 
                onClick={() => setPeriodType('p1')}
                className={`flex-1 py-3 rounded-xl text-xs font-bold border transition-all ${periodType === 'p1' ? 'bg-[var(--accent)] text-black border-[var(--accent)] shadow-md' : 'bg-gray-800/40 border-gray-700 text-gray-400 hover:bg-gray-800'}`}
              >
                1st Half (1–15)
              </button>
              <button 
                onClick={() => setPeriodType('p2')}
                className={`flex-1 py-3 rounded-xl text-xs font-bold border transition-all ${periodType === 'p2' ? 'bg-[var(--accent)] text-black border-[var(--accent)] shadow-md' : 'bg-gray-800/40 border-gray-700 text-gray-400 hover:bg-gray-800'}`}
              >
                2nd Half (16–{daysInMonth})
              </button>
            </div>
            <div className="mt-2 p-3 bg-gray-900/50 rounded-xl border border-gray-800/50 text-[11px] text-[var(--muted)] font-mono text-center">
              Selected: <span className="text-[var(--accent)]">{startDate}</span> to <span className="text-[var(--accent)]">{endDate}</span>
            </div>
          </div>

          <div>
            <label className="block text-[9px] font-bold uppercase tracking-widest text-gray-500 mb-2">2. Select Task</label>
            <select 
              value={taskName} 
              onChange={e => setTaskName(e.target.value)}
              className="w-full bg-[#0d0f14] border border-gray-700 rounded-xl px-4 py-3 text-xs outline-none focus:border-[var(--accent)] transition-colors"
            >
              <option value="">— Choose task type —</option>
              {tasks.map((t: string) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-[9px] font-bold uppercase tracking-widest text-gray-500">3. Select Employees</label>
              <input 
                type="text" 
                placeholder="Search..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="bg-transparent border-b border-gray-700 px-2 py-0.5 text-[10px] outline-none focus:border-[var(--accent)] w-32"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 p-1.5 max-h-48 overflow-y-auto custom-scrollbar bg-gray-900/30 rounded-xl border border-gray-800">
              {employees
                .filter((e: string) => e.toLowerCase().includes(search.toLowerCase()))
                .sort()
                .map((e: string) => {
                  const conflict = checkConflict(e);
                  const isSelected = selectedEmps.includes(e);

                  return (
                    <button 
                      key={e} 
                      onClick={() => isSelected ? setSelectedEmps(selectedEmps.filter(x => x !== e)) : setSelectedEmps([...selectedEmps, e])}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[10px] font-semibold transition-all ${
                        isSelected 
                          ? 'bg-[var(--accent)] text-black border-[var(--accent)] shadow-md' 
                          : conflict 
                            ? 'bg-red-500/10 border-red-500/30 text-red-500/50 cursor-not-allowed'
                            : 'bg-gray-800/30 border-gray-700/50 text-gray-400 hover:border-gray-600'
                      }`}
                    >
                      <div className={`w-3.5 h-3.5 rounded-md border flex items-center justify-center transition-colors ${isSelected ? 'bg-black/20 border-black/20' : 'bg-black/40 border-gray-600'}`}>
                        {isSelected && <Check size={10} strokeWidth={3} />}
                      </div>
                      <span className="flex-1 text-left truncate">{e} {conflict && `(${conflict})`}</span>
                    </button>
                  );
                })}
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-8">
          <button 
            onClick={onClose} 
            className="flex-1 bg-gray-800/40 border border-gray-700 py-3 rounded-xl text-[10px] font-bold text-gray-400 hover:bg-gray-800 transition-all uppercase tracking-wider"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave} 
            className="flex-1 bg-[var(--accent)] text-black py-3 rounded-xl text-[10px] font-bold shadow-lg shadow-[var(--accent)]/10 hover:bg-[#f0d060] transition-all transform active:scale-95 uppercase tracking-wider"
          >
            Process Bulk Task
          </button>
        </div>
      </div>
    </div>
  );
}

function BulkDeleteModal({ employees, onClose, onSave, currentMonth }: any) {
  const [selectedEmps, setSelectedEmps] = useState<string[]>([]);
  const [mode, setMode] = useState<'all' | 'shift' | 'paypro' | 'dayoff'>('all');
  const [periodType, setPeriodType] = useState<'p1' | 'p2' | 'week'>('p1');
  const [selectedWeekIdx, setSelectedWeekIdx] = useState(0);
  const [search, setSearch] = useState('');

  const [year, month] = currentMonth.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();

  const dates = Array.from({ length: daysInMonth }, (_, i) => `${currentMonth}-${String(i + 1).padStart(2, '0')}`);
  const weeks: string[][] = [];
  let currentWeek: string[] = [];
  dates.forEach(d => {
    currentWeek.push(d);
    if (new Date(d + 'T00:00:00').getDay() === 0) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  });
  if (currentWeek.length > 0) weeks.push(currentWeek);

  const getActiveDates = () => {
    if (periodType === 'p1') return dates.filter(d => Number(d.split('-')[2]) <= 15);
    return dates.filter(d => Number(d.split('-')[2]) > 15);
  };

  const activeDates = getActiveDates();
  const startDate = activeDates[0] || '';
  const endDate = activeDates[activeDates.length - 1] || '';

  const handleSave = () => {
    if (selectedEmps.length === 0) {
      alert('Please select employees.');
      return;
    }
    if (confirm(`Are you sure you want to delete ${mode} entries for the selected employees and period?`)) {
      onSave({ selectedEmps, mode, startDate, endDate });
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#1a1d24] border border-red-500/20 rounded-[32px] p-8 w-full max-w-2xl shadow-2xl overflow-y-auto max-h-[95vh] relative">
        <button onClick={onClose} className="absolute right-6 top-6 text-gray-500 hover:text-white"><X size={24} /></button>
        
        <div className="flex items-center gap-3 mb-2">
          <Trash2 size={24} className="text-red-500" />
          <h3 className="font-serif text-3xl">Bulk Delete</h3>
        </div>
        <p className="text-sm text-gray-400 mb-8">Delete multiple entries for a specific period and employees.</p>

        <div className="grid grid-cols-4 gap-3 mb-8">
          {[
            { id: 'all', label: 'All', icon: ClipboardList, color: 'text-white' },
            { id: 'shift', label: 'Shifts', icon: Clock, color: 'text-[var(--accent)]' },
            { id: 'paypro', label: 'PayPro', icon: Zap, color: 'text-orange-400' },
            { id: 'dayoff', label: 'Day Off', icon: Moon, color: 'text-pink-400' },
          ].map(it => (
            <button 
              key={it.id}
              onClick={() => setMode(it.id as any)}
              className={`flex flex-col items-center justify-center p-4 rounded-2xl border transition-all ${mode === it.id ? 'bg-red-500/10 border-red-500 text-red-500' : 'bg-gray-800/20 border-gray-700 text-gray-500 hover:border-gray-600'}`}
            >
              <it.icon size={20} className={`mb-2 ${mode === it.id ? 'text-red-500' : it.color}`} />
              <span className="text-[10px] font-bold uppercase tracking-widest">{it.label}</span>
            </button>
          ))}
        </div>

        <div className="space-y-8">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">1. Select Period</label>
            <div className="flex flex-wrap gap-2 mb-4">
              <button 
                onClick={() => setPeriodType('p1')}
                className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${periodType === 'p1' ? 'bg-red-500 text-white border-red-500 shadow-lg shadow-red-500/20' : 'bg-gray-800/40 border-gray-700 text-gray-400 hover:bg-gray-800'}`}
              >1–15</button>
              <button 
                onClick={() => setPeriodType('p2')}
                className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${periodType === 'p2' ? 'bg-red-500 text-white border-red-500 shadow-lg shadow-red-500/20' : 'bg-gray-800/40 border-gray-700 text-gray-400 hover:bg-gray-800'}`}
              >16–{daysInMonth}</button>
            </div>
            <div className="flex flex-wrap gap-2 p-4 bg-gray-900/50 rounded-2xl border border-gray-800/50">
              {activeDates.map(d => {
                const dayName = DAY_NAMES[new Date(d).getDay()];
                return (
                  <div key={d} className="flex flex-col items-center px-3 py-1.5 rounded-xl border border-gray-700 bg-gray-800/40 text-gray-400 text-[10px] font-bold">
                    <span className="opacity-60">{dayName}</span>
                    <span className="text-xs">{Number(d.split('-')[2])}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500">2. Select Employees</label>
              <div className="relative">
                <input 
                  type="text" 
                  placeholder="Search..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="bg-transparent border-b border-gray-700 px-2 py-1 text-xs outline-none focus:border-red-500 w-32 font-mono"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-2 max-h-60 overflow-y-auto custom-scrollbar">
              {employees
                .filter((e: string) => e.toLowerCase().includes(search.toLowerCase()))
                .sort()
                .map((e: string) => {
                  const isSelected = selectedEmps.includes(e);
                  return (
                    <button 
                      key={e} 
                      onClick={() => isSelected ? setSelectedEmps(selectedEmps.filter(x => x !== e)) : setSelectedEmps([...selectedEmps, e])}
                      className={`flex items-center gap-3 px-4 py-3 rounded-2xl border text-xs font-semibold transition-all ${
                        isSelected 
                          ? 'bg-red-500 border-red-500 text-white shadow-lg shadow-red-500/10' 
                          : 'bg-gray-800/30 border-gray-700/50 text-gray-400 hover:border-gray-600 hover:bg-gray-800/50'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-md border flex items-center justify-center transition-colors ${isSelected ? 'bg-black/20 border-white/20' : 'bg-black/40 border-gray-600'}`}>
                        {isSelected && <Check size={12} strokeWidth={3} />}
                      </div>
                      <span className="flex-1 text-left truncate">{e}</span>
                    </button>
                  );
                })}
            </div>
          </div>
        </div>

        <div className="flex gap-4 mt-10">
          <button 
            onClick={onClose} 
            className="flex-1 bg-gray-800/40 border border-gray-700 py-4 rounded-2xl text-sm font-bold text-gray-400 hover:bg-gray-800 hover:border-gray-600 transition-all font-serif"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave} 
            className="flex-1 bg-red-600 text-white py-4 rounded-2xl text-sm font-bold shadow-xl shadow-red-600/10 hover:bg-red-500 transition-all transform active:scale-95 font-serif uppercase tracking-widest"
          >
            Delete Entries
          </button>
        </div>
      </div>
    </div>
  );
}

function SelectionModal({ title, date, items, selected: initialSelected, onClose, onSave, assignments, scheduleEntries, leaveEntries, shiftId, leaveType }: any) {
  const [selected, setSelected] = useState<string[]>(initialSelected);
  const [search, setSearch] = useState('');

  const getConflict = (e: string) => {
    // 1. Check Task assignments (SDP/DELTA)
    const foundTask = assignments?.find((a: any) => {
      if (a.task !== 'SDP' && a.task !== 'DELTA') return false;
      if (!a.employees.includes(e)) return false;
      return (date <= a.dutyTo && date >= a.dutyFrom);
    });
    if (foundTask) return foundTask.task;

    // 2. Check other Shifts on the same day
    const otherShift = scheduleEntries?.find((s: any) => 
      s.employee_name === e && 
      s.schedule_date === date && 
      s.shift_type_id !== shiftId
    );
    if (otherShift) return "Shift Assigned";

    // 3. Check other Leave/Dayoff on the same day
    const otherLeave = leaveEntries?.find((l: any) => 
      l.employee_name === e && 
      l.schedule_date === date && 
      l.leave_type !== leaveType
    );
    if (otherLeave) return otherLeave.leave_type;

    return null;
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-6 sm:p-8 w-full max-w-md shadow-2xl">
        <h3 className="font-serif text-2xl mb-1">{title}</h3>
        <p className="text-sm text-[var(--muted)] mb-6">{date}</p>
        
        <div className="mb-4">
          <input 
            type="text"
            placeholder="Search employees..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs outline-none focus:border-[var(--accent)]"
          />
        </div>

        <div className="flex flex-wrap gap-2 max-h-[40vh] overflow-y-auto mb-8">
          {items
            .filter((item: string) => item.toLowerCase().includes(search.toLowerCase()))
            .map((item: string) => {
              const conflictTask = getConflict(item);

              return (
                <button 
                  key={item}
                  disabled={!!conflictTask}
                  onClick={() => selected.includes(item) ? setSelected(selected.filter(x => x !== item)) : setSelected([...selected, item])}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all border ${
                    selected.includes(item) 
                      ? 'bg-[var(--accent)] text-black border-[var(--accent)] font-bold' 
                      : conflictTask 
                        ? 'bg-[var(--red)]/5 border-[var(--red)]/20 text-[var(--red)]/40 cursor-not-allowed'
                        : 'bg-[var(--surface2)] border-[var(--border)] text-[var(--muted)] hover:border-[var(--muted)]'
                  }`}
                >
                  {item} {conflictTask && `(${conflictTask})`}
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
  const [currentMonth, setCurrentMonth] = useState(getMonthStr());
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
    let curr = new Date(fromDate + 'T00:00:00');
    const end = new Date(toDate + 'T00:00:00');
    while (curr <= end) {
      const dStr = `${curr.getFullYear()}-${String(curr.getMonth() + 1).padStart(2, '0')}-${String(curr.getDate()).padStart(2, '0')}`;
      dates.push(dStr);
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
            setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
          }} className="p-2 hover:bg-[var(--surface2)] rounded-lg text-[var(--muted)]"><ChevronLeft size={20} /></button>
          <input type="month" value={currentMonth} onChange={e => setCurrentMonth(e.target.value)} className="bg-transparent text-sm font-mono px-2 outline-none" />
          <button onClick={() => {
            const d = new Date(year, month, 1);
            setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
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
    { id: 'shift63', label: 'Schedule Notes', sub: '6:00AM - 3:00PM / 8:00AM - 5:00PM Logs', icon: <Calendar size={18} /> },
    { id: 'graveyard', label: 'Schedule Notes', sub: '10:00PM - 6:00AM Logs', icon: <Calendar size={18} /> },
    { id: 'paypro', label: 'PayPro & Batch', sub: 'Assignment logs', icon: <Archive size={18} /> }
  ];

  return (
    <div className="space-y-12">
      <div>
        <h2 className="font-serif text-3xl mb-1">Collaboration Notes</h2>
        <p className="text-sm text-[var(--muted)]">Spreadsheet-style logs for shift management and team updates.</p>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {SECTIONS.map(s => (
          <SpreadsheetPanel key={s.id} section={s} user={user} />
        ))}
      </div>
    </div>
  );
}

function SpreadsheetPanel({ section, user }: any) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const { data } = await getSb()
      .from('notes')
      .select('*')
      .eq('section_key', section.id)
      .order('row_idx');
    
    const initialRows = data || [];
    const minRows = 15;
    const count = Math.max(minRows, initialRows.length > 0 ? Math.max(...initialRows.map((r:any)=>r.row_idx)) + 1 : 0);
    
    const displayRows = Array.from({ length: Math.max(minRows, count) }, (_, i) => {
      const existing = initialRows.find((r: any) => r.row_idx === i);
      return existing || { row_idx: i, row_data: { name: '', cols: Array(7).fill('') } };
    });
    
    setRows(displayRows);
    setLoading(false);
  }, [section.id]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const updateRow = async (idx: number, name: string, cols: string[]) => {
    if (!user.isAdmin) return;
    
    // Update local state first
    setRows(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], row_data: { name, cols } };
      return next;
    });

    const { error } = await getSb().from('notes').upsert({
      section_key: section.id,
      row_idx: idx,
      row_data: { name, cols }
    }, { onConflict: 'section_key,row_idx' });
    
    if (error) console.error(error);
  };

  const addRows = () => {
    const startIdx = rows.length;
    const newRows = Array.from({ length: 5 }, (_, i) => ({
      row_idx: startIdx + i,
      row_data: { name: '', cols: Array(7).fill('') }
    }));
    setRows([...rows, ...newRows]);
  };

  if (loading) return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl h-[500px] flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent)]"></div>
    </div>
  );

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-2xl flex flex-col h-[600px]">
      <div className="bg-[var(--surface2)]/50 px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-2 bg-[var(--accent)]/10 rounded-lg text-[var(--accent)]">
            {section.icon}
          </div>
          <div>
            <div className="text-sm font-bold text-[var(--text)]">{section.label}</div>
            <div className="text-[10px] text-[var(--muted)] font-medium uppercase tracking-wider">{section.sub}</div>
          </div>
        </div>
        {user.isAdmin && (
          <button 
            onClick={addRows}
            className="text-[10px] uppercase font-bold tracking-widest text-[var(--accent)] hover:opacity-80 transition-opacity"
          >
            + Add Rows
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto bg-[#0d0f14] scrollbar-thin scrollbar-thumb-[var(--border)]">
        <table className="w-full border-collapse table-fixed min-w-[700px]">
          <thead className="sticky top-0 z-10 bg-[#1a1d24]">
            <tr className="text-[9px] uppercase font-bold text-[var(--muted)]">
              <th className="w-10 py-3 border-r border-b border-[var(--border)] bg-[#1a1d24]">#</th>
              <th className="w-40 px-3 py-3 text-left border-r border-b border-[var(--border)] bg-[#1a1d24]">NAME</th>
              {Array.from({ length: 7 }).map((_, i) => (
                <th key={i} className="py-3 border-r border-b border-[var(--border)]">{i + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody className="">
            {rows.map((r, i) => (
              <SpreadsheetRow 
                key={i} 
                index={i} 
                data={r.row_data} 
                readonly={!user.isAdmin} 
                onUpdate={(name: string, cols: string[]) => updateRow(i, name, cols)} 
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SpreadsheetRow({ index, data, readonly, onUpdate }: any) {
  const [name, setName] = useState(data?.name || '');
  const [cols, setCols] = useState(data?.cols || Array(7).fill(''));

  useEffect(() => {
    setName(data?.name || '');
    setCols(data?.cols || Array(7).fill(''));
  }, [data]);

  const handleBlur = () => {
    if (name !== data.name || JSON.stringify(cols) !== JSON.stringify(data.cols)) {
      onUpdate(name, cols);
    }
  };

  const updateCol = (idx: number, val: string) => {
    const next = [...cols];
    next[idx] = val;
    setCols(next);
  };

  const getCellColor = (val: string) => {
    if (!val) return '';
    const lower = val.toLowerCase();
    if (lower.includes('jan')) return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
    if (lower.includes('feb')) return 'bg-red-500/20 text-red-300 border-red-500/30';
    if (lower.includes('march')) return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
    if (lower.includes('april')) return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
    if (lower.includes('may')) return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';
    if (lower.includes('june')) return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
    return '';
  };

  return (
    <tr className="group transition-colors h-9">
      <td className="text-center font-mono text-[10px] text-[var(--muted)] border-r border-b border-[var(--border)] bg-[#161820]/50 group-hover:bg-[#20232d] transition-colors">
        {index + 1}
      </td>
      <td className="border-r border-b border-[var(--border)] p-0">
        <input 
          value={name} 
          onChange={e => setName(e.target.value)} 
          onBlur={handleBlur} 
          readOnly={readonly}
          placeholder={readonly ? "" : "..."}
          className="w-full h-full bg-transparent text-[11px] font-bold text-[var(--text)] px-3 outline-none focus:bg-[var(--accent)]/5 hover:bg-white/[0.02]" 
        />
      </td>
      {Array.from({ length: 7 }).map((_, ci) => {
        const val = cols[ci] || '';
        const colorClass = getCellColor(val);
        return (
          <td key={ci} className={`border-r border-b border-[var(--border)] p-0.5 relative`}>
            <input 
              value={val} 
              onChange={e => updateCol(ci, e.target.value)} 
              onBlur={handleBlur} 
              readOnly={readonly}
              className={`w-full h-full bg-transparent text-[9px] px-2 outline-none text-center rounded transition-all ${
                colorClass ? `${colorClass} font-bold border` : 'focus:bg-[var(--accent)]/5 hover:bg-white/[0.02]'
              }`} 
            />
          </td>
        );
      })}
    </tr>
  );
}


