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
  Palette,
  PaintBucket,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  getSupabaseConfig, 
  saveSupabaseConfig, 
  removeSupabaseConfig, 
  createSupabaseClient,
  setSb,
  getSb
} from './lib/supabase';
import { 
  getPHTTodayStr, 
  getPHTYesterdayStr, 
  analyzeAndProjectAssignments
} from './services/automationService';
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

const getTodayStr = () => getPHTTodayStr();
const getYesterdayStr = () => getPHTYesterdayStr();

const formatDate = (date: Date) => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const getMonthStr = () => {
  const d = new Date();
  // Adjust for PHT for consistency in month strings if needed
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

    const newData = {
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
    };

    setData(newData);
    return newData;
  };

  const runAutomation = useCallback(async (currentData: any) => {
    if (!user || user.isGuest) return;
    
    const today = getTodayStr();
    
    // 1. SDP/DELTA Auto-Swap & Gap Filling
    const projections = await analyzeAndProjectAssignments(currentData.assignments, currentData.employees, today);
    
    if (projections.length > 0) {
      console.log(`AI Automation: Projecting ${projections.length} missing assignments...`);
      for (const p of projections) {
        const { data: res, error } = await getSb().from('assignments').insert({
          task_name: p.task_name,
          duty_from: p.duty_from,
          duty_to: p.duty_to,
          added_by: p.added_by
        }).select('id').single();
        
        if (!error && res) {
          const rows = p.employees.map((e: string) => ({ assignment_id: res.id, employee_name: e }));
          await getSb().from('assignment_employees').insert(rows);
        }
      }
      fetchAllData(getSb());
    }

    // 2. ELOAD Auto-Pick (Moved from AdminView to be fully automatic)
    const eloadAlreadyAssigned = currentData.assignments.some((a: any) => 
      a.task === 'ELOAD' && a.dutyFrom <= today && a.dutyTo >= today
    );
    
    if (!eloadAlreadyAssigned && currentData.employees.length > 0) {
      const excluded = ['Amy', 'Rojen', 'Jen', 'Charmaine'];
      const eligible = currentData.employees.filter((e: string) => !excluded.includes(e));
      
      if (eligible.length > 0) {
        const eloadHistory = currentData.assignments
          .filter((a: any) => a.task === 'ELOAD')
          .sort((a: any, b: any) => b.dutyFrom.localeCompare(a.dutyFrom));

        const recentlyPicked = new Set();
        for (const a of eloadHistory) {
          for (const e of a.employees) {
            if (recentlyPicked.size < eligible.length - 1) {
              if (eligible.includes(e)) recentlyPicked.add(e);
            } else break;
          }
          if (recentlyPicked.size >= eligible.length - 1) break;
        }

        const busyToday = [
          ...currentData.leaveEntries.filter((l: any) => l.schedule_date === today).map((l: any) => l.employee_name),
          ...currentData.scheduleEntries.filter((s: any) => {
            const shift = currentData.shiftTypes.find((st: any) => st.id === s.shift_type_id);
            return s.schedule_date === today && shift?.name === '10:00PM - 6:00AM';
          }).map((s: any) => s.employee_name)
        ];

        const availablePool = eligible.filter((e: string) => !recentlyPicked.has(e));
        let candidates = availablePool.filter(e => !busyToday.includes(e));
        if (candidates.length === 0) candidates = eligible.filter(e => !busyToday.includes(e));

        if (candidates.length > 0) {
          const winner = candidates[Math.floor(Math.random() * candidates.length)];
          const { data: res, error } = await getSb().from('assignments').insert({
            task_name: 'ELOAD',
            duty_from: today,
            duty_to: today,
            added_by: 'Persona (Auto-Pool)'
          }).select('id').single();

          if (!error && res) {
            await getSb().from('assignment_employees').insert({
              assignment_id: res.id,
              employee_name: winner
            });
            fetchAllData(getSb());
          }
        }
      }
    }
  }, [user]);

  useEffect(() => {
    if (data.assignments.length > 0 && user && !user.isGuest) {
      const timer = setTimeout(() => {
        runAutomation(data);
      }, 5000); // Wait a bit after load to check automation
      return () => clearTimeout(timer);
    }
  }, [data.assignments.length, user, runAutomation]);

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
            icon={<Calendar size={18} className="text-white" />} 
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

      <main className={`mx-auto p-4 sm:p-8 ${(activeTab === 'schedule' || activeTab === 'notes') ? 'max-w-full' : 'max-w-7xl'}`}>
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
  const today = getTodayStr();
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

  const [historyFilter, setHistoryFilter] = useState({ from: '', to: '', task: '', emp: '' });
  const [showBulkTaskModal, setShowBulkTaskModal] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(getMonthStr());
  const [autoRotate, setAutoRotate] = useState(false);

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
    
    // Automation: If SDP or DELTA, split into individual days with rotation
    if (assignTask === 'SDP' || assignTask === 'DELTA') {
      if (editingAssignment) {
        await getSb().from('assignment_employees').delete().eq('assignment_id', editingAssignment.id);
        await getSb().from('assignments').delete().eq('id', editingAssignment.id);
      }

      let curr = new Date(dutyFrom + 'T00:00:00');
      let targetTo = dutyTo;
      if (autoRotate) {
        const d = new Date(dutyFrom + 'T00:00:00');
        d.setDate(d.getDate() + 29); // 30 days total
        targetTo = formatDate(d);
      }
      const end = new Date(targetTo + 'T00:00:00');
      let index = 0;

      while (curr <= end) {
        const ds = formatDate(curr);
        const currentTask = index % 2 === 0 ? assignTask : (assignTask === 'SDP' ? 'DELTA' : 'SDP');
        const isAuto = index > 0 || autoRotate;

        const { data: res, error } = await getSb().from('assignments').insert({
          task_name: currentTask,
          duty_from: ds,
          duty_to: ds,
          added_by: isAuto ? `${user.name} (Auto-Swap)` : user.name
        }).select('id').single();

        if (!error && res) {
          const rows = selectedEmployees.map(e => ({ assignment_id: res.id, employee_name: e }));
          await getSb().from('assignment_employees').insert(rows);
        }

        curr.setDate(curr.getDate() + 1);
        index++;
      }
      
      resetForm();
      refresh();
    } else if (editingAssignment) {
      // Update existing assignment (Normal)
      const { error } = await getSb().from('assignments').update({
        task_name: assignTask,
        duty_from: dutyFrom,
        duty_to: dutyTo
      }).eq('id', editingAssignment.id);

      if (error) { alert(error.message); return; }

      await getSb().from('assignment_employees').delete().eq('assignment_id', editingAssignment.id);
      const rows = selectedEmployees.map(e => ({ assignment_id: editingAssignment.id, employee_name: e }));
      const { error: e2 } = await getSb().from('assignment_employees').insert(rows);
      
      if (e2) alert(e2.message);
      else { 
        resetForm();
        refresh(); 
      }
    } else {
      // Create new assignment (Normal)
      const { data: res, error } = await getSb().from('assignments').insert({
        task_name: assignTask,
        duty_from: dutyFrom,
        duty_to: dutyTo,
        added_by: user.name
      }).select('id').single();

      if (error) { alert(error.message); return; }

      const rows = selectedEmployees.map(e => ({ assignment_id: res.id, employee_name: e }));
      const { error: e2 } = await getSb().from('assignment_employees').insert(rows);
      
      if (e2) alert(e2.message);
      else {
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
    setAutoRotate(false);
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
    if (assignTask !== 'SDP' && assignTask !== 'DELTA') return null;
    const found = data.assignments.find((a: any) => {
      if (editingAssignment && a.id === editingAssignment.id) return false;
      if (a.task !== 'SDP' && a.task !== 'DELTA') return false;
      if (!a.employees.includes(e)) return false;
      return (dutyFrom <= a.dutyTo && dutyTo >= a.dutyFrom);
    });
    return found ? found.task : null;
  };

  const filteredHistory = data.assignments.filter((a: any) => {
    const today = getTodayStr();
    
    // If no manual date filter is set, default to only showing tasks active today
    if (!historyFilter.from && !historyFilter.to) {
      if (a.dutyFrom > today || a.dutyTo < today) return false;
    } else {
      // If manual filter is set, allow seeing that range
      const overlaps = (f: string, t: string, af: string, at: string) => {
        if (f && at < f) return false;
        if (t && af > t) return false;
        return true;
      };
      if (!overlaps(historyFilter.from, historyFilter.to, a.dutyFrom, a.dutyTo)) return false;
    }

    if (historyFilter.task && a.task !== historyFilter.task) return false;
    if (historyFilter.emp && !a.employees.includes(historyFilter.emp)) return false;
    return true;
  }).sort((a: any, b: any) => {
    const today = getTodayStr();
    const isAToday = a.dutyFrom <= today && a.dutyTo >= today;
    const isBToday = b.dutyFrom <= today && b.dutyTo >= today;
    if (isAToday && !isBToday) return -1;
    if (!isAToday && isBToday) return 1;
    return b.dutyFrom.localeCompare(a.dutyFrom); // Descending date
  });

  const deleteAssignment = async (id: string) => {
    if (!confirm('Are you sure you want to delete this assignment?')) return;
    const { error: e1 } = await getSb().from('assignment_employees').delete().eq('assignment_id', id);
    if (e1) { alert(e1.message); return; }
    const { error: e2 } = await getSb().from('assignments').delete().eq('id', id);
    if (e2) alert(e2.message);
    else refresh();
  };

  const swapAndClone = async (a: any, targetDate?: string) => {
    const nextTask = a.task === 'SDP' ? 'DELTA' : 'SDP';
    const ds = targetDate || (() => {
      const d = new Date(a.dutyTo + 'T00:00:00');
      d.setDate(d.getDate() + 1);
      return formatDate(d);
    })();

    const { data: res, error } = await getSb().from('assignments').insert({
      task_name: nextTask,
      duty_from: ds,
      duty_to: ds,
      added_by: a.addedBy.includes('(Auto-Swap)') ? a.addedBy : `${user.name} (Auto-Swap)`
    }).select('id').single();

    if (error) return;

    const rows = a.employees.map((e: string) => ({ assignment_id: res.id, employee_name: e }));
    await getSb().from('assignment_employees').insert(rows);
    refresh();
  };

  const bulkDeleteAssignments = async () => {
    if (!confirm('Are you absolutely sure you want to CLEAR ALL assignment history? This cannot be undone.')) return;
    
    // Cascading delete relies on foreign key, but we'll be explicit
    const { error: e1 } = await getSb().from('assignment_employees').delete().neq('employee_name', '');
    const { error: e2 } = await getSb().from('assignments').delete().neq('task_name', '');

    if (e1 || e2) alert('Failed to clear assignments');
    else refresh();
  };

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
              <div key={e} className="flex flex-col items-center bg-[var(--accent2)]/5 border border-[var(--accent2)]/20 px-3 py-1.5 rounded-xl min-w-[100px]">
                <span className="text-xs font-mono text-[var(--accent2)] font-bold">{e}</span>
              </div>
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)] mb-2">Duty From</label>
                <div className="relative">
                  <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white pointer-events-none" />
                  <input type="date" value={dutyFrom} onChange={e => setDutyFrom(e.target.value)} className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-[var(--radius)] pl-10 pr-4 py-3 text-sm outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)] mb-2">Duty To</label>
                <div className="relative">
                  <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white pointer-events-none" />
                  <input type="date" value={dutyTo} onChange={e => setDutyTo(e.target.value)} className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-[var(--radius)] pl-10 pr-4 py-3 text-sm outline-none" />
                </div>
              </div>
            </div>
            {(assignTask === 'SDP' || assignTask === 'DELTA') && (
              <div className="flex items-center gap-3 p-3 bg-[var(--accent)]/5 border border-[var(--accent)]/10 rounded-xl">
                <input 
                  type="checkbox" 
                  id="autoRotate"
                  checked={autoRotate}
                  onChange={e => setAutoRotate(e.target.checked)}
                  className="w-4 h-4 rounded border-[var(--border)] bg-[var(--bg)] text-[var(--accent)]"
                />
                <label htmlFor="autoRotate" className="text-[10px] font-bold text-[var(--text)] uppercase tracking-wider cursor-pointer">
                  Enable Daily SDP/DELTA Auto-Swap
                </label>
              </div>
            )}
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
          user={user}
          onClose={() => setShowBulkTaskModal(false)}
          onSave={async (params: any) => {
            const { selectedEmps, taskName, startDate, endDate, autoSwap } = params;
            
            if (autoSwap && (taskName === 'SDP' || taskName === 'DELTA')) {
              let curr = new Date(startDate + 'T00:00:00');
              const end = new Date(endDate + 'T00:00:00');
              let index = 0;
              
              while (curr <= end) {
                const ds = formatDate(curr);
                const currentTask = index % 2 === 0 ? taskName : (taskName === 'SDP' ? 'DELTA' : 'SDP');
                
                const { data: res, error } = await getSb().from('assignments').insert({
                  task_name: currentTask,
                  duty_from: ds,
                  duty_to: ds,
                  added_by: index === 0 ? user.name : `${user.name} (Auto-Swap)`
                }).select('id').single();
                
                if (!error && res) {
                  const rows = selectedEmps.map((e: string) => ({ assignment_id: res.id, employee_name: e }));
                  await getSb().from('assignment_employees').insert(rows);
                }
                
                curr.setDate(curr.getDate() + 1);
                index++;
              }
              setShowBulkTaskModal(false);
              refresh();
            } else {
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
            }
          }}
        />
      )}

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-2xl">Assignment History</h2>
          <div className="flex items-center gap-3">
            <button 
              onClick={bulkDeleteAssignments}
              className="px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl text-[10px] font-bold uppercase tracking-wider hover:bg-red-500 hover:text-white transition-all shadow-lg shadow-red-500/5"
            >
              Clear All History
            </button>
            <span className="text-[10px] font-mono bg-[var(--surface2)] px-3 py-1 rounded-full border border-[var(--border)] text-[var(--muted)]">{filteredHistory.length} records</span>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-4 items-end bg-[var(--surface)] p-4 rounded-xl border border-[var(--border)] mb-4">
          <div className="space-y-1">
            <label className="text-[9px] uppercase font-bold text-[var(--muted)]">From</label>
            <div className="relative">
              <Calendar size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white pointer-events-none" />
              <input type="date" value={historyFilter.from} onChange={e => setHistoryFilter({...historyFilter, from: e.target.value})} className="bg-[var(--bg)] border border-[var(--border)] rounded-lg pl-8 pr-3 py-2 text-xs outline-none w-36" />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[9px] uppercase font-bold text-[var(--muted)]">To</label>
            <div className="relative">
              <Calendar size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white pointer-events-none" />
              <input type="date" value={historyFilter.to} onChange={e => setHistoryFilter({...historyFilter, to: e.target.value})} className="bg-[var(--bg)] border border-[var(--border)] rounded-lg pl-8 pr-3 py-2 text-xs outline-none w-36" />
            </div>
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
              {filteredHistory.map((a: any) => {
                const isToday = a.dutyFrom <= today && a.dutyTo >= today;
                return (
                  <tr key={a.id} className={`hover:bg-white/[0.02] group transition-colors ${isToday ? 'bg-[var(--accent)]/[0.03]' : ''}`}>
                    <td className="px-6 py-4 font-bold">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded-md ${
                          a.task === 'SDP' ? 'text-emerald-400 bg-emerald-500/5' :
                          a.task === 'DELTA' ? 'text-cyan-400 bg-cyan-500/5' :
                          ''
                        }`}>{a.task}</span>
                        {isToday && (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--accent)] text-black text-[8px] font-black uppercase shadow-[0_0_10px_rgba(234,179,8,0.3)]">
                            Live
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={`px-6 py-4 font-mono text-[11px] ${isToday ? 'text-[var(--accent)] font-bold' : 'text-[var(--muted)]'}`}>
                      {a.dutyFrom} → {a.dutyTo}
                    </td>
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
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {(a.task === 'SDP' || a.task === 'DELTA') && (
                        <button 
                          onClick={() => swapAndClone(a)}
                          className="p-2 hover:bg-[var(--accent)]/10 rounded-lg text-[var(--accent2)] hover:text-[var(--accent)] transition-colors"
                          title="Generate Next Day Swapped Assignment"
                        >
                          <Zap size={16} />
                        </button>
                      )}
                      <button 
                        onClick={() => handleEdit(a)}
                        className="p-2 hover:bg-[var(--accent)]/10 rounded-lg text-[var(--muted)] hover:text-[var(--accent)] transition-colors"
                        title="Edit Assignment"
                      >
                        <Settings size={16} />
                      </button>
                      <button 
                        onClick={() => deleteAssignment(a.id)}
                        className="p-2 hover:bg-red-500/10 rounded-lg text-[var(--muted)] hover:text-red-500 transition-colors"
                        title="Delete Assignment"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
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
  const currentYear = new Date().getUTCFullYear().toString();

  const getActiveEmployees = (employees: string[], date: string) => {
    if (user.isAdmin) return employees;
    return employees.filter((e: string) => {
      // Hide if on ANY leave (Dayoff, PAL, etc.)
      const isOnLeave = data.leaveEntries.some((l: any) => 
        l.employee_name === e && 
        l.schedule_date === date
      );
      if (isOnLeave) return false;

      // Hide if on 10PM Shift
      const is10PmShift = data.scheduleEntries.some((s: any) => {
        const shift = data.shiftTypes.find(st => st.id === s.shift_type_id);
        return s.employee_name === e && 
               s.schedule_date === date && 
               shift?.name === '10:00PM - 6:00AM';
      });
      if (is10PmShift) return false;

      return true;
    });
  };
  
  const palUsed = data.leaveEntries.filter((l: any) => l.employee_name === user.name && l.leave_type === 'Pre Approved Leave' && l.schedule_date.startsWith(currentYear)).length;

  const tasks = data.assignments.filter((a: any) => {
    if (filter === 'current') return a.dutyFrom <= today && a.dutyTo >= today;
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
          ✨ Today's Task
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
            const checkDate = filter === 'current' ? today : a.dutyFrom;
            const activeEmps = getActiveEmployees(a.employees, checkDate);
            const isMe = activeEmps.includes(user.name);
            const isToday = a.dutyFrom <= today && a.dutyTo >= today;
            return (
              <div 
                key={a.id} 
                className={`group relative bg-[var(--surface)] border rounded-[20px] overflow-hidden transition-all hover:-translate-y-1 hover:shadow-2xl ${
                  isToday && isMe 
                    ? 'border-[var(--accent)] shadow-[0_0_20px_rgba(234,179,8,0.15)] bg-[var(--accent)]/[0.03]' 
                    : isToday
                      ? 'border-[var(--border)] bg-gray-800/10'
                      : isMe 
                        ? 'border-[var(--accent)]/50 bg-[var(--accent)]/5' 
                        : 'border-[var(--border)] hover:border-[var(--accent)]'
                }`}
              >
                <div className={`p-5 border-b border-[var(--border)] flex justify-between items-start gap-4 ${isToday && isMe ? 'bg-[var(--accent)]/5' : 'bg-[var(--surface2)]'}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="text-lg font-bold truncate">{a.task}</div>
                      {isToday && (
                        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--accent)] text-black text-[8px] font-black uppercase animate-pulse">
                          Live
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[10px] font-mono text-[var(--muted)]">
                      <Calendar size={12} className={isToday && isMe ? "text-[var(--accent)]" : "text-[var(--muted)]"} />
                      {a.dutyFrom} → {a.dutyTo}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className={`text-[9px] font-bold uppercase tracking-widest border px-2 py-0.5 rounded-full ${
                      a.task === 'SDP' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                      a.task === 'DELTA' ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' :
                      'bg-[var(--purple)]/10 text-[var(--purple)] border border-[var(--purple)]/30'
                    }`}>{a.task}</span>
                    {isMe && <span className="text-[9px] font-bold uppercase tracking-widest bg-[var(--accent)] text-black font-black px-2 py-0.5 rounded-full shadow-lg shadow-[var(--accent)]/20">Your Task ✓</span>}
                  </div>
                </div>
                <div className="p-5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] mb-3">Assigned Team</div>
                  <div className="flex flex-wrap gap-2">
                    {activeEmps.map((e: string) => (
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
              .filter(d => !data.leaveEntries.some((l: any) => l.employee_name === emp && l.schedule_date === d))
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
        const rows = selectedEmps.flatMap((emp: string) => 
          datesInRange
            .filter(d => !data.leaveEntries.some((l: any) => l.employee_name === emp && l.schedule_date === d))
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

    if (leaveType !== 'Dayoff') {
      setShowBulkModal(false);
    }
    refresh();
  };

  const handleBulkDelete = async (params: any) => {
    const { selectedEmps, mode, startDate, endDate, dates } = params;
    
    let datesInRange: string[] = dates;

    if (!datesInRange) {
      datesInRange = [];
      let curr = new Date(startDate + 'T00:00:00');
      const end = new Date(endDate + 'T00:00:00');
      while (curr <= end) {
        const year = curr.getFullYear();
        const month = String(curr.getMonth() + 1).padStart(2, '0');
        const day = String(curr.getDate()).padStart(2, '0');
        datesInRange.push(`${year}-${month}-${day}`);
        curr.setDate(curr.getDate() + 1);
      }
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
        <div className="flex bg-[var(--surface)] border border-[var(--border)] rounded-xl p-1 gap-1 items-center px-1">
          <Calendar size={16} className="text-white ml-2" />
          <button onClick={() => {
            const d = new Date(year, month - 2, 1);
            setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
          }} className="p-2 hover:bg-[var(--surface2)] rounded-lg text-[var(--muted)] ml-1"><ChevronLeft size={20} /></button>
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
                  {data.shiftTypes.map((st: any) => {
                    const getCategoryStyles = (name: string) => {
                      const n = name.toLowerCase();
                      if (n.includes('6:00am')) return { text: 'text-[#4fd1c5]', bg: 'bg-[#4fd1c5]/15', border: 'border-[#4fd1c5]/40' }; 
                      if (n.includes('8:00am')) return { text: 'text-[#e8c547]', bg: 'bg-[#e8c547]/15', border: 'border-[#e8c547]/40' };
                      if (n.includes('10:00pm')) return { text: 'text-[#a78bfa]', bg: 'bg-[#a78bfa]/15', border: 'border-[#a78bfa]/40' };
                      if (n.includes('paypro')) return { text: 'text-[#4ade80]', bg: 'bg-[#4ade80]/15', border: 'border-[#4ade80]/40' };
                      return { text: 'text-[var(--text)]', bg: 'bg-white/5', border: 'border-white/10' };
                    };
                    const cat = getCategoryStyles(st.name);
                    
                    return (
                      <tr key={st.id}>
                        <td className="px-4 py-3 bg-[var(--surface2)] border-r border-[var(--border)] text-xs font-bold text-[var(--text)]">{st.name}</td>
                        {week.map(d => {
                          const emps = getShiftEmployees(d, st.id);
                          return (
                            <td key={d} className="p-1 border-r border-[var(--border)] group relative">
                              <div className="flex flex-wrap gap-1 min-h-[40px] justify-center items-center">
                                {emps.map(e => {
                                  const isSelf = e === user.name;
                                  const showColor = user.isAdmin || isSelf;
                                  return (
                                    <span 
                                      key={e} 
                                      className={`text-[9px] px-2 py-0.5 rounded-full font-mono border transition-colors ${
                                        showColor 
                                          ? `${cat.bg} ${cat.border} ${cat.text} font-bold` 
                                          : 'bg-white/5 border-white/10 text-white/90'
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
                    );
                  })}
                  <tr className="bg-[var(--surface)]">
                    <td className="px-4 py-3 bg-[var(--surface2)] border-r border-[var(--border)] text-xs font-bold text-[var(--text)]">Day Off</td>
                    {week.map(d => {
                      const doCat = { text: 'text-[#f9a8d4]', bg: 'bg-[#f9a8d4]/15', border: 'border-[#f9a8d4]/40' };
                      return (
                        <td key={d} className="p-1 border-r border-[var(--border)] group relative">
                           <div className="flex flex-wrap gap-1 min-h-[40px] justify-center items-center">
                              {getLeaveEmployees(d, 'Dayoff').map(e => {
                                const isSelf = e === user.name;
                                const showColor = user.isAdmin || isSelf;
                                return (
                                  <span 
                                    key={e} 
                                    className={`text-[9px] px-2 py-0.5 rounded-full font-mono border transition-colors ${
                                      showColor 
                                        ? `${doCat.bg} ${doCat.border} ${doCat.text} font-bold` 
                                        : 'bg-white/5 border-white/10 text-white/90'
                                    }`}
                                  >
                                    {e}
                                  </span>
                                );
                              })}
                              {user.isAdmin && <button onClick={() => handleCellClick(d, undefined, 'Dayoff')} className="opacity-0 group-hover:opacity-100 absolute inset-0 flex items-center justify-center bg-pink-500/10 backdrop-blur-[2px] transition-opacity"><Plus size={16} className="text-pink-400" /></button>}
                           </div>
                        </td>
                      );
                    })}
                  </tr>
                  <tr className="bg-[var(--surface)]">
                    <td className="px-4 py-3 bg-[var(--surface2)] border-r border-[var(--border)] text-xs font-bold text-[var(--text)]">Pre-Approved Leave</td>
                    {week.map(d => {
                      const palCat = { text: 'text-[#c084fc]', bg: 'bg-[#c084fc]/15', border: 'border-[#c084fc]/40' };
                      return (
                        <td key={d} className="p-1 border-r border-[var(--border)] group relative">
                           <div className="flex flex-wrap gap-1 min-h-[40px] justify-center items-center">
                              {getLeaveEmployees(d, 'Pre Approved Leave').map(e => {
                                const isSelf = e === user.name;
                                const showColor = user.isAdmin || isSelf;
                                return (
                                  <span 
                                    key={e} 
                                    className={`text-[9px] px-2 py-0.5 rounded-full font-mono border transition-colors ${
                                      showColor 
                                        ? `${palCat.bg} ${palCat.border} ${palCat.text} font-bold` 
                                        : 'bg-white/5 border-white/10 text-white/90'
                                    }`}
                                  >
                                    {e}
                                  </span>
                                );
                              })}
                              {user.isAdmin && <button onClick={() => handleCellClick(d, undefined, 'Pre Approved Leave')} className="opacity-0 group-hover:opacity-100 absolute inset-0 flex items-center justify-center bg-purple-500/10 backdrop-blur-[2px] transition-opacity"><Plus size={16} className="text-purple-400" /></button>}
                           </div>
                        </td>
                      );
                    })}
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
  const [loading, setLoading] = useState(false);
  const [selectedPeriods, setSelectedPeriods] = useState<string[]>(['p1']);
  const [selectedWeekIdx, setSelectedWeekIdx] = useState(0);
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([]);
  const [search, setSearch] = useState('');
  const [includedDates, setIncludedDates] = useState<string[]>([]);

  const [year, month] = currentMonth.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();

  const dates = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => `${currentMonth}-${String(i + 1).padStart(2, '0')}`), [daysInMonth, currentMonth]);
  const weeks = useMemo(() => {
    const w: string[][] = [];
    let currentWeek: string[] = [];
    dates.forEach(d => {
      currentWeek.push(d);
      if (new Date(d + 'T00:00:00').getDay() === 0) {
        w.push(currentWeek);
        currentWeek = [];
      }
    });
    if (currentWeek.length > 0) w.push(currentWeek);
    return w;
  }, [dates]);

  const getActiveDates = () => {
    if (mode === 'dayoff') {
      return dates.filter(d => selectedWeekdays.includes(new Date(d + 'T00:00:00').getDay()));
    }
    
    // Ensure includedDates are filtered by the current selected periods
    let baseRange: string[] = [];
    if (selectedPeriods.includes('p1')) baseRange = [...baseRange, ...dates.filter(d => Number(d.split('-')[2]) <= 15)];
    if (selectedPeriods.includes('p2')) baseRange = [...baseRange, ...dates.filter(d => Number(d.split('-')[2]) > 15)];
    const baseSet = new Set(baseRange);
    
    return includedDates.filter(d => baseSet.has(d));
  };

  const activeDates = getActiveDates();

  // Auto-set included dates for shift mode
  useEffect(() => {
    if (mode === 'shift') {
      let baseRange: string[] = [];
      if (selectedPeriods.includes('p1')) {
        baseRange = [...baseRange, ...dates.filter(d => Number(d.split('-')[2]) <= 15)];
      }
      if (selectedPeriods.includes('p2')) {
        baseRange = [...baseRange, ...dates.filter(d => Number(d.split('-')[2]) > 15)];
      }
      baseRange = Array.from(new Set(baseRange)).sort();
      
      // If no employees, select all in range
      if (selectedEmps.length === 0) {
        setIncludedDates(baseRange);
        return;
      }

      // If employees selected, include dates where at least ONE selected employee can work
      const autoSelected = baseRange.filter(d => {
        if (selectedEmps.length === 0) return true;
        // Check if there is at least one employee who does NOT have a leave conflict on this date
        const someoneCanWork = selectedEmps.some(emp => 
          !(leaveEntries || []).some((l: any) => l.employee_name === emp && l.schedule_date === d)
        );
        return someoneCanWork;
      });
      setIncludedDates(autoSelected);
    }
  }, [mode, selectedPeriods, selectedWeekIdx, JSON.stringify(selectedEmps), dates, weeks, leaveEntries]);

  const handleSave = async () => {
    if (activeDates.length === 0) {
      alert('Please select at least one day.');
      return;
    }
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
    
    setLoading(true);
    try {
      await onSave({ 
        selectedEmps, 
        shiftId: mode === 'shift' ? shiftId : '', 
        leaveType: mode === 'dayoff' ? 'Dayoff' : (mode === 'paypro' ? '' : ''),
        isPayPro: mode === 'paypro',
        activeDates
      });

      if (mode === 'dayoff') {
        setSelectedEmps([]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const checkConflict = (emp: string) => {
    if (activeDates.length === 0) return null;

    if (mode === 'paypro') {
      const payProType = shiftTypes.find((s: any) => s.name === 'PayPro & Batch Upload');
      for (const d of activeDates) {
        const count = (scheduleEntries || []).filter((s: any) => s.schedule_date === d && s.shift_type_id === payProType?.id).length;
        if (count >= 2) {
          const isAlreadyThere = (scheduleEntries || []).some((s: any) => s.schedule_date === d && s.shift_type_id === payProType?.id && s.employee_name === emp);
          if (!isAlreadyThere) return "PayPro Limit Reached (2/day)";
        }
      }
      return null;
    }

    if (mode === 'dayoff') {
      const hasOtherLeave = activeDates.some(d => 
        (leaveEntries || []).some((l: any) => l.employee_name === emp && l.schedule_date === d && l.leave_type !== 'Dayoff' && l.leave_type !== 'Pre Approved Leave')
      );
      if (hasOtherLeave) return "Other Leave Conflict";

      const hasDayOffOnOtherDays = (leaveEntries || []).some((l: any) => 
        l.employee_name === emp && 
        l.leave_type === 'Dayoff' && 
        l.schedule_date.startsWith(currentMonth) && 
        !activeDates.includes(l.schedule_date)
      );
      if (hasDayOffOnOtherDays) return "Already has Dayoff on other date";
      
      return null;
    }

    // mode === 'shift'
    let shiftConflicts = [];
    let leaveCount = 0;
    
    for (const d of activeDates) {
      const hasOtherLeave = (leaveEntries || []).some((l: any) => l.employee_name === emp && l.schedule_date === d);
      if (hasOtherLeave) leaveCount++;

      const entry = (scheduleEntries || []).find((s: any) => s.employee_name === emp && s.schedule_date === d);
      if (entry) {
        const st = shiftTypes.find((t: any) => t.id === entry.shift_type_id);
        if (st) shiftConflicts.push(st.name);
      }
    }

    if (leaveCount === activeDates.length && activeDates.length > 0) {
      return "Full Period Leave";
    }

    if (shiftConflicts.length > 0) {
      return `Already: ${shiftConflicts[0]}`;
    }

    return null;
  };

  const getEmpAssignedCount = (emp: string) => {
    if (mode !== 'paypro') return 0;
    const payProType = shiftTypes.find((s: any) => s.name === 'PayPro & Batch Upload');
    return (scheduleEntries || []).filter((s: any) => 
      s.employee_name === emp && 
      s.schedule_date.startsWith(currentMonth) && 
      s.shift_type_id === payProType?.id
    ).length;
  };

  const getPeriodCount = (p: 'p1' | 'p2') => {
    if (mode !== 'paypro') return 0;
    let range: string[] = [];
    if (p === 'p1') range = dates.filter(d => Number(d.split('-')[2]) <= 15);
    else range = dates.filter(d => Number(d.split('-')[2]) > 15);
    
    const payProType = shiftTypes.find((s: any) => s.name === 'PayPro & Batch Upload');
    return (scheduleEntries || []).filter((s: any) => range.includes(s.schedule_date) && s.shift_type_id === payProType?.id).length;
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
            onClick={() => {
              setMode('paypro');
              setIncludedDates([]);
            }}
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
                {WEEKDAYS.map(day => {
                  const isAlreadyDayOffForSelected = selectedEmps.length === 1 && (leaveEntries || []).some((l: any) => 
                    l.employee_name === selectedEmps[0] && 
                    l.leave_type === 'Dayoff' && 
                    new Date(l.schedule_date + 'T00:00:00').getDay() === day.value
                  );

                  return (
                    <button 
                      key={day.value}
                      disabled={isAlreadyDayOffForSelected}
                      onClick={() => {
                        setSelectedWeekdays(prev => 
                          prev.includes(day.value) ? prev.filter(v => v !== day.value) : [...prev, day.value]
                        );
                      }}
                      className={`px-3 py-2 rounded-xl text-[10px] font-bold border transition-all flex-1 min-w-[70px] ${
                        selectedWeekdays.includes(day.value) 
                          ? 'bg-pink-500 text-white border-pink-500 shadow-md' 
                          : isAlreadyDayOffForSelected
                            ? 'bg-red-500/10 border-red-500/20 text-red-500/40 cursor-not-allowed opacity-50'
                            : 'bg-gray-800/40 border-gray-700 text-gray-400 hover:bg-gray-800'
                      }`}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  <button 
                    onClick={() => {
                      setSelectedPeriods(prev => 
                        prev.includes('p1') 
                          ? prev.length > 1 ? prev.filter(x => x !== 'p1') : prev
                          : [...prev, 'p1']
                      );
                    }}
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-bold border transition-all flex items-center gap-2 ${selectedPeriods.includes('p1') ? 'bg-[var(--accent)] text-black border-[var(--accent)] shadow-md' : 'bg-gray-800/40 border-gray-700 text-gray-400 hover:bg-gray-800'}`}
                  >
                    1-15
                    {mode === 'paypro' && <span className="bg-black/10 px-1 rounded text-[8px]">{getPeriodCount('p1')}</span>}
                  </button>
                  <button 
                    onClick={() => {
                      setSelectedPeriods(prev => 
                        prev.includes('p2') 
                          ? prev.length > 1 ? prev.filter(x => x !== 'p2') : prev
                          : [...prev, 'p2']
                      );
                    }}
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-bold border transition-all flex items-center gap-2 ${selectedPeriods.includes('p2') ? 'bg-[var(--accent)] text-black border-[var(--accent)] shadow-md' : 'bg-gray-800/40 border-gray-700 text-gray-400 hover:bg-gray-800'}`}
                  >
                    16-30
                    {mode === 'paypro' && <span className="bg-black/10 px-1 rounded text-[8px]">{getPeriodCount('p2')}</span>}
                  </button>
                </div>
                
                <div className="flex flex-wrap gap-1.5 p-3 bg-gray-900/50 rounded-2xl border border-gray-800/50">
                  {(() => {
                    let baseDates: string[] = [];
                    if (selectedPeriods.includes('p1')) baseDates = [...baseDates, ...dates.filter(d => Number(d.split('-')[2]) <= 15)];
                    if (selectedPeriods.includes('p2')) baseDates = [...baseDates, ...dates.filter(d => Number(d.split('-')[2]) > 15)];
                    // If somehow none, use weekly logic or show nothing
                    if (baseDates.length === 0) baseDates = weeks[selectedWeekIdx] || [];
                    
                    baseDates = Array.from(new Set(baseDates)).sort();

                    if (baseDates.length === 0) return <div className="text-[9px] text-gray-600 italic">No days selected.</div>;
                    
                    return baseDates.map(d => {
                      const dateNum = Number(d.split('-')[2]);
                      const dayName = DAY_NAMES[new Date(d + 'T00:00:00').getDay()];
                      const isSun = new Date(d + 'T00:00:00').getDay() === 0;
                      const isSat = new Date(d + 'T00:00:00').getDay() === 6;
                      const isSelected = includedDates.includes(d);
                      
                      const allSelectedHaveLeave = selectedEmps.length > 0 && selectedEmps.every(emp => 
                        (leaveEntries || []).some((l: any) => 
                          l.employee_name === emp && 
                          l.schedule_date === d
                        )
                      );

                      const someSelectedHaveLeave = selectedEmps.length > 0 && !allSelectedHaveLeave && selectedEmps.some(emp => 
                        (leaveEntries || []).some((l: any) => 
                          l.employee_name === emp && 
                          l.schedule_date === d
                        )
                      );
                      
                      const payProType = shiftTypes.find((s: any) => s.name === 'PayPro & Batch Upload');
                      const alreadyAssignedToPayPro = selectedEmps.some(emp => 
                        (scheduleEntries || []).some((s: any) => 
                          s.employee_name === emp && 
                          s.schedule_date === d && 
                          s.shift_type_id === payProType?.id
                        )
                      );
                      
                      return (
                        <button 
                          key={d} 
                          disabled={allSelectedHaveLeave}
                          onClick={() => {
                            setIncludedDates(prev => 
                              prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]
                            );
                          }}
                          className={`flex flex-col items-center px-2 py-1 rounded-xl border text-[9px] font-bold transition-all relative ${
                            isSelected 
                              ? 'bg-[var(--accent)] border-[var(--accent)] text-black shadow-lg shadow-[var(--accent)]/20 shadow-inner' 
                              : alreadyAssignedToPayPro
                                ? 'bg-[var(--accent)]/20 border-[var(--accent)]/40 text-[var(--accent)]'
                                : allSelectedHaveLeave
                                  ? 'bg-red-500/10 border-red-500/20 text-red-500/30 cursor-not-allowed opacity-50'
                                  : someSelectedHaveLeave
                                    ? 'border-orange-500/30 bg-orange-500/5 text-orange-400'
                                    : isSun 
                                      ? 'border-red-500/30 bg-red-500/5 text-red-400' 
                                      : isSat 
                                        ? 'border-cyan-500/30 bg-cyan-500/5 text-cyan-400' 
                                        : 'border-gray-700 bg-gray-800/40 text-gray-400 hover:border-gray-600'
                          }`}
                        >
                          <span className="opacity-60">{dayName}</span>
                          <span className="text-[11px]">{dateNum}</span>
                          {alreadyAssignedToPayPro && (
                            <div className="absolute -top-1 -right-1 w-2 h-2 bg-[var(--accent)] rounded-full shadow-[0_0_8px_var(--accent)]" />
                          )}
                          {someSelectedHaveLeave && !isSelected && (
                            <div className="absolute -top-1 -right-1 w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
                          )}
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
                    const conflictReason = checkConflict(e);
                    const isSelected = selectedEmps.includes(e);
                    const isHardConflict = conflictReason && (conflictReason.includes('Leave') || conflictReason.includes('Limit'));
                    const assignedCount = getEmpAssignedCount(e);

                    return (
                      <button 
                        key={e} 
                        onClick={() => isSelected ? setSelectedEmps(selectedEmps.filter(x => x !== e)) : setSelectedEmps([...selectedEmps, e])}
                        disabled={isHardConflict || (mode === 'paypro' && !isSelected && selectedEmps.length >= 2)}
                        title={conflictReason || (mode === 'paypro' && selectedEmps.length >= 2 ? 'Limit of 2 employees for PayPro' : '')}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[10px] font-bold transition-all group relative ${
                          isSelected 
                            ? mode === 'dayoff' ? 'bg-pink-500 text-white border-pink-500 shadow-md' : 'bg-[var(--accent)] text-black border-[var(--accent)] shadow-md' 
                            : isHardConflict || (mode === 'paypro' && selectedEmps.length >= 2)
                              ? 'bg-red-500/10 border-red-500/20 text-red-500/60 opacity-60 cursor-not-allowed grayscale-[0.8]'
                              : conflictReason && conflictReason.includes('Already')
                                ? 'bg-orange-500/5 border-orange-500/20 text-orange-400 hover:border-orange-500/50 hover:bg-orange-500/10'
                                : mode === 'shift' || mode === 'paypro'
                                  ? 'bg-cyan-500/5 border-cyan-500/20 text-cyan-400 hover:border-cyan-500/50 hover:bg-cyan-500/10'
                                  : 'bg-gray-800/30 border-gray-700/50 text-gray-400 hover:border-gray-600'
                        }`}
                      >
                      <div className={`w-3.5 h-3.5 rounded-md border flex items-center justify-center transition-colors ${
                        isSelected 
                          ? 'bg-black/20 border-black/20' 
                          : conflictReason
                            ? 'bg-red-500/10 border-red-500/30' 
                            : 'bg-black/40 border-gray-600 group-hover:border-cyan-500/50'
                      }`}>
                        {isSelected && <Check size={10} strokeWidth={3} />}
                        {conflictReason && <X size={8} className="text-red-500/60" />}
                      </div>
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="text-left truncate font-sans">
                          {e} {mode === 'paypro' && assignedCount > 0 && <span className="opacity-60 font-mono text-[9px]"> - {assignedCount}</span>}
                        </span>
                        {conflictReason && (
                          <span className={`text-[7px] truncate leading-none mt-0.5 ${isHardConflict ? 'text-red-400' : 'text-orange-400'}`}>{conflictReason}</span>
                        )}
                      </div>
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
            disabled={loading}
            className={`flex-1 bg-[var(--accent)] text-black py-2.5 rounded-xl text-[10px] font-bold shadow-lg shadow-[var(--accent)]/10 hover:bg-[#f0d060] transition-all transform active:scale-95 uppercase tracking-wider ${loading ? 'opacity-50 cursor-wait' : ''}`}
          >
            {loading ? 'Processing...' : 'Apply Assignment'}
          </button>
        </div>
      </div>
    </div>
  );
}

function BulkTaskAssignModal({ employees, tasks, assignments, onClose, onSave, currentMonth, user }: any) {
  const [selectedEmps, setSelectedEmps] = useState<string[]>([]);
  const [taskName, setTaskName] = useState('');
  const [selectedPeriods, setSelectedPeriods] = useState<string[]>(['p1']);
  const [search, setSearch] = useState('');
  const [autoSwap, setAutoSwap] = useState(false);

  const [year, month] = currentMonth.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const dates = Array.from({ length: daysInMonth }, (_, i) => `${currentMonth}-${String(i + 1).padStart(2, '0')}`);

  const activeDates = useMemo(() => {
    let ad: string[] = [];
    if (selectedPeriods.includes('p1')) ad = [...ad, ...dates.filter(d => Number(d.split('-')[2]) <= 15)];
    if (selectedPeriods.includes('p2')) ad = [...ad, ...dates.filter(d => Number(d.split('-')[2]) > 15)];
    return Array.from(new Set(ad)).sort();
  }, [selectedPeriods, dates]);

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
    onSave({ selectedEmps, taskName, startDate, endDate, autoSwap });
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
                onClick={() => {
                  setSelectedPeriods(prev => 
                    prev.includes('p1') 
                      ? prev.length > 1 ? prev.filter(x => x !== 'p1') : prev
                      : [...prev, 'p1']
                  );
                }}
                className={`flex-1 py-3 rounded-xl text-xs font-bold border transition-all ${selectedPeriods.includes('p1') ? 'bg-[var(--accent)] text-black border-[var(--accent)] shadow-md' : 'bg-gray-800/40 border-gray-700 text-gray-400 hover:bg-gray-800'}`}
              >
                1-15
              </button>
              <button 
                onClick={() => {
                  setSelectedPeriods(prev => 
                    prev.includes('p2') 
                      ? prev.length > 1 ? prev.filter(x => x !== 'p2') : prev
                      : [...prev, 'p2']
                  );
                }}
                className={`flex-1 py-3 rounded-xl text-xs font-bold border transition-all ${selectedPeriods.includes('p2') ? 'bg-[var(--accent)] text-black border-[var(--accent)] shadow-md' : 'bg-gray-800/40 border-gray-700 text-gray-400 hover:bg-gray-800'}`}
              >
                16-30
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
              onChange={e => {
                setTaskName(e.target.value);
                if (e.target.value !== 'SDP' && e.target.value !== 'DELTA') setAutoSwap(false);
              }}
              className="w-full bg-[#0d0f14] border border-gray-700 rounded-xl px-4 py-3 text-xs outline-none focus:border-[var(--accent)] transition-colors"
            >
              <option value="">— Choose task type —</option>
              {tasks.map((t: string) => <option key={t} value={t}>{t}</option>)}
            </select>

            {(taskName === 'SDP' || taskName === 'DELTA') && (
              <div className="mt-3 flex items-center justify-between p-3 bg-[var(--accent)]/5 border border-[var(--accent)]/10 rounded-xl">
                <div className="space-y-0.5">
                  <div className="text-[10px] font-black uppercase tracking-wider text-[var(--accent)]">Auto Swap Task</div>
                  <div className="text-[8px] text-[var(--muted)] font-bold">Daily rotation between SDP & DELTA</div>
                </div>
                <div className="flex bg-gray-900 p-1 rounded-lg border border-gray-800">
                  <button 
                    onClick={() => setAutoSwap(false)}
                    className={`px-3 py-1 text-[9px] font-bold rounded-md transition-all ${!autoSwap ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-500 hover:text-gray-400'}`}
                  >
                    Off
                  </button>
                  <button 
                    onClick={() => setAutoSwap(true)}
                    className={`px-3 py-1 text-[9px] font-bold rounded-md transition-all ${autoSwap ? 'bg-[var(--accent)] text-black shadow-sm shadow-[var(--accent)]/20' : 'text-gray-500 hover:text-[var(--accent)]'}`}
                  >
                    On
                  </button>
                </div>
              </div>
            )}
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
                      disabled={!!conflict}
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
            Assign Employees
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
  const [includedDates, setIncludedDates] = useState<string[]>([]);

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
  
  // Set all dates in the current period as selected by default when the period changes
  useEffect(() => {
    setIncludedDates(activeDates);
  }, [periodType]);

  const handleSave = () => {
    if (selectedEmps.length === 0) {
      alert('Please select employees.');
      return;
    }
    if (includedDates.length === 0) {
      alert('Please select at least one day.');
      return;
    }
    if (confirm(`Are you sure you want to delete ${mode} entries for the selected employees and ${includedDates.length} selected days?`)) {
      onSave({ selectedEmps, mode, dates: includedDates });
    }
  };

  const filteredEmployees = employees
    .filter((e: string) => e.toLowerCase().includes(search.toLowerCase()))
    .sort();

  const toggleAllEmployees = () => {
    if (selectedEmps.length === filteredEmployees.length) {
      setSelectedEmps([]);
    } else {
      setSelectedEmps(filteredEmployees);
    }
  };

  const toggleAllDates = () => {
    if (includedDates.length === activeDates.length) {
      setIncludedDates([]);
    } else {
      setIncludedDates(activeDates);
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
            <div className="flex items-center justify-between mb-3">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500">1. Select Period</label>
              <button 
                onClick={toggleAllDates}
                className="text-[9px] font-bold uppercase text-[var(--accent)] hover:underline"
              >
                {includedDates.length === activeDates.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              <button 
                onClick={() => setPeriodType('p1')}
                className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${periodType === 'p1' ? 'bg-red-500 text-white border-red-500 shadow-lg shadow-red-500/20' : 'bg-gray-800/40 border-gray-700 text-gray-400 hover:bg-gray-800'}`}
              >1–15</button>
              <button 
                onClick={() => setPeriodType('p2')}
                className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${periodType === 'p2' ? 'bg-red-500 text-white border-red-500 shadow-lg shadow-red-500/20' : 'bg-gray-800/40 border-gray-700 text-gray-400 hover:bg-gray-800'}`}
              >16–30</button>
            </div>
            <div className="flex flex-wrap gap-2 p-4 bg-gray-900/50 rounded-2xl border border-gray-800/50">
              {activeDates.map(d => {
                const dayName = DAY_NAMES[new Date(d).getDay()];
                const isSelected = includedDates.includes(d);
                return (
                  <button 
                    key={d} 
                    onClick={() => setIncludedDates(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])}
                    className={`flex flex-col items-center px-3 py-1.5 rounded-xl border transition-all text-[10px] font-bold ${
                      isSelected 
                        ? 'bg-red-500 border-red-500 text-white shadow-lg shadow-red-500/20' 
                        : 'bg-gray-800/40 border-gray-700 text-gray-400 hover:bg-gray-800 hover:border-gray-600'
                    }`}
                  >
                    <span className="opacity-60">{dayName}</span>
                    <span className="text-xs">{Number(d.split('-')[2])}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-4">
                <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500">2. Select Employees</label>
                <button 
                  onClick={toggleAllEmployees}
                  className="text-[9px] font-bold uppercase text-[var(--accent)] hover:underline"
                >
                  {selectedEmps.length === filteredEmployees.length && filteredEmployees.length > 0 ? 'Deselect All' : 'Select All'}
                </button>
              </div>
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
              {filteredEmployees.map((e: string) => {
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
      l.leave_type !== leaveType &&
      !(leaveType === 'Dayoff' && l.leave_type === 'Pre Approved Leave')
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

function YearlyLeavePlannerModal({ data, user, refresh, onClose }: any) {
  const [selectedEmp, setSelectedEmp] = useState('');
  const [selectedYear, setSelectedYear] = useState(new Date().getUTCFullYear());
  const [activeMonth, setActiveMonth] = useState(new Date().getUTCMonth());
  const [selectedDates, setSelectedDates] = useState<{ [key: string]: string }>({});
  const [dayOffDates, setDayOffDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedEmp) {
      fetchExistingLeaves();
    } else {
      setSelectedDates({});
      setDayOffDates([]);
    }
  }, [selectedEmp, selectedYear]);

  const fetchExistingLeaves = async () => {
    setLoading(true);
    const { data: entries, error } = await getSb()
      .from('leave_entries')
      .select('*')
      .eq('employee_name', selectedEmp)
      .filter('schedule_date', 'gte', `${selectedYear}-01-01`)
      .filter('schedule_date', 'lte', `${selectedYear}-12-31`);
    
    if (entries) {
      const palDates: { [key: string]: string } = {};
      const doDates: string[] = [];
      entries.forEach((e: any) => {
        if (e.leave_type === 'Pre Approved Leave') {
          palDates[e.schedule_date] = e.leave_type;
        } else if (e.leave_type === 'Dayoff') {
          doDates.push(e.schedule_date);
        }
      });
      setSelectedDates(palDates);
      setDayOffDates(doDates);
    }
    setLoading(false);
  };

  const toggleDate = (dateStr: string) => {
    const next = { ...selectedDates };
    if (next[dateStr]) {
      delete next[dateStr];
    } else {
      if (Object.keys(next).length >= MAX_VL) return;
      next[dateStr] = 'Pre Approved Leave';
    }
    setSelectedDates(next);
  };

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    const d = new Date(year, month, 1).getDay();
    return d === 0 ? 6 : d - 1; // 0=Mon, 6=Sun
  };
  
  const saveAll = async () => {
    if (!selectedEmp) return;
    
    setLoading(true);
    // Delete existing for this year
    const { error: delError } = await getSb()
      .from('leave_entries')
      .delete()
      .eq('employee_name', selectedEmp)
      .eq('leave_type', 'Pre Approved Leave')
      .filter('schedule_date', 'gte', `${selectedYear}-01-01`)
      .filter('schedule_date', 'lte', `${selectedYear}-12-31`);

    if (delError) { alert(delError.message); setLoading(false); return; }

    const inserts = Object.entries(selectedDates).map(([date, type]) => ({
      schedule_date: date,
      employee_name: selectedEmp,
      leave_type: 'Pre Approved Leave',
      added_by: user.name
    }));

    if (inserts.length > 0) {
      const { error: insError } = await getSb().from('leave_entries').insert(inserts);
      if (insError) alert(insError.message);
    }

    setLoading(false);
    refresh();
    onClose();
  };

  const palCount = Object.keys(selectedDates).length;

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-[#1a1d24] border border-[var(--border)] rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
      >
        <div className="p-6 border-b border-[var(--border)] flex justify-between items-center bg-[#20232d]">
          <div>
            <h2 className="text-2xl font-serif flex items-center gap-2">
              <Calendar className="text-[var(--accent)]" /> Yearly Leave Planner
            </h2>
            <p className="text-[var(--muted)] text-xs mt-1">Set pre-approved leaves for multiple months and specific dates in one go.</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">Employee</label>
              <select 
                value={selectedEmp} 
                onChange={e => setSelectedEmp(e.target.value)}
                className="w-full bg-[#20232d] border border-[var(--border)] rounded-xl px-4 py-3 outline-none focus:border-[var(--accent)] transition-all"
              >
                <option value="">Select Employee...</option>
                {data.employees.map((e: string) => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">Year</label>
              <select 
                value={selectedYear} 
                onChange={e => setSelectedYear(Number(e.target.value))}
                className="w-full bg-[#20232d] border border-[var(--border)] rounded-xl px-4 py-3 outline-none focus:border-[var(--accent)] transition-all"
              >
                {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1">
            <div className="bg-[#20232d] border border-[var(--border)] p-4 rounded-2xl relative overflow-hidden group">
              <div className="flex justify-between items-end mb-3">
                <div className="flex items-center gap-2 text-xs font-bold text-[var(--muted)] uppercase">
                  🌴 Pre-Approved Leave Allocation
                </div>
                <div className="text-sm font-mono"><span className="text-[var(--accent)] text-lg font-bold">{palCount}</span> / {MAX_VL}</div>
              </div>
              <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min((palCount / MAX_VL) * 100, 100)}%` }}
                  className={`h-full ${palCount > MAX_VL ? 'bg-red-500' : 'bg-[var(--accent)]'}`}
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">Select Months</div>
            <div className="flex flex-wrap gap-2">
              {months.map((m, i) => (
                <button
                  key={m}
                  onClick={() => setActiveMonth(i)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${
                    activeMonth === i 
                      ? 'bg-purple-500/20 border-purple-500/50 text-purple-300' 
                      : 'bg-[#20232d] border-[var(--border)] text-[var(--muted)] hover:border-[var(--muted)]'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-[#161820] border border-[var(--border)] rounded-2xl overflow-hidden p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-serif text-lg text-purple-300">{months[activeMonth]} {selectedYear}</h3>
              <div className="flex gap-2">
                <button 
                  onClick={() => {
                    const days = getDaysInMonth(selectedYear, activeMonth);
                    const next = { ...selectedDates };
                    for (let d = 1; d <= days; d++) {
                      if (Object.keys(next).length >= MAX_VL) break;
                      const dateStr = `${selectedYear}-${String(activeMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                      if (!dayOffDates.includes(dateStr)) {
                        next[dateStr] = 'Pre Approved Leave';
                      }
                    }
                    setSelectedDates(next);
                  }}
                  disabled={palCount >= MAX_VL}
                  className="text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg transition-colors border border-white/10"
                >
                  Select All
                </button>
                <button 
                  onClick={() => {
                    const days = getDaysInMonth(selectedYear, activeMonth);
                    const next = { ...selectedDates };
                    for (let d = 1; d <= days; d++) {
                      const dateStr = `${selectedYear}-${String(activeMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                      delete next[dateStr];
                    }
                    setSelectedDates(next);
                  }}
                  className="text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg transition-colors border border-white/10"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center">
              {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map(d => (
                <div key={d} className={`text-[9px] font-bold mb-4 ${d === 'SUN' ? 'text-red-400' : 'text-[var(--muted)]'}`}>{d}</div>
              ))}
              {Array.from({ length: getFirstDayOfMonth(selectedYear, activeMonth) }).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}
              {Array.from({ length: getDaysInMonth(selectedYear, activeMonth) }).map((_, i) => {
                const day = i + 1;
                const dStr = `${selectedYear}-${String(activeMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const isSelected = !!selectedDates[dStr];
                const hasDayOff = dayOffDates.includes(dStr);
                const isSun = new Date(selectedYear, activeMonth, day).getDay() === 0;

                return (
                  <button
                    key={day}
                    disabled={(!isSelected && palCount >= MAX_VL) || hasDayOff}
                    onClick={() => toggleDate(dStr)}
                    className={`aspect-square flex items-center justify-center text-xs font-mono rounded-lg transition-all border relative group ${
                      hasDayOff
                        ? 'bg-pink-500/10 text-pink-400 border-pink-500/30 cursor-not-allowed opacity-40'
                        : isSelected 
                          ? 'bg-[var(--accent)] text-black border-[#f0d060] font-bold'
                          : isSun
                            ? 'text-red-400 hover:bg-red-400/10 border-transparent disabled:opacity-20'
                            : 'text-[var(--text)] hover:bg-white/5 border-transparent disabled:opacity-20'
                    }`}
                  >
                    {day}
                    {hasDayOff && (
                      <div className="absolute bottom-1 w-1 h-1 rounded-full bg-pink-400" />
                    )}
                    {isSelected && (
                      <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-[#1a1d24] border border-white/20 rounded-full flex items-center justify-center overflow-hidden">
                        <div className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-[var(--border)] bg-[#20232d] flex gap-4">
          <button 
            onClick={onClose}
            className="flex-1 px-6 py-4 rounded-2xl bg-[var(--surface2)] border border-[var(--border)] text-sm font-bold hover:border-[var(--muted)] transition-all"
          >
            Cancel
          </button>
          <button 
            disabled={loading || !selectedEmp}
            onClick={saveAll}
            className="flex-1 px-6 py-4 rounded-2xl bg-[var(--accent)] text-black text-sm font-bold hover:bg-[#f0d060] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-[var(--accent)]/10"
          >
            {loading ? 'Saving...' : 'Save All Leaves'}
          </button>
        </div>
      </motion.div>
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
  const [showPlanner, setShowPlanner] = useState(false);

  const monthsLeaves = data.leaveEntries
    .filter((e: any) => e.schedule_date.startsWith(currentMonth) && e.leave_type !== 'Dayoff')
    .sort((a: any, b: any) => a.schedule_date.localeCompare(b.schedule_date));

  // Group leaves by employee and type
  const groupedLeaves = monthsLeaves.reduce((acc: any[], leaf: any) => {
    const existing = acc.find(g => g.employee_name === leaf.employee_name && g.leave_type === leaf.leave_type);
    if (existing) {
      existing.dates.push(leaf.schedule_date);
    } else {
      acc.push({ ...leaf, dates: [leaf.schedule_date] });
    }
    return acc;
  }, []);

  const formatGroupDates = (dates: string[]) => {
    if (dates.length === 0) return '';
    try {
      const sorted = [...dates].sort();
      const [y, m, d] = sorted[0].split('-').map(Number);
      const monthName = new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long' }).toLowerCase();
      const dayNumbers = sorted.map(dStr => Number(dStr.split('-')[2])).sort((a,b) => a-b).join(',');
      return `${monthName} ${dayNumbers}`;
    } catch {
      return dates.join(', ');
    }
  };

  const addLeave = async () => {
    if (!empId || !fromDate || !toDate) return;
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

  const removeGroupLeave = async (dates: string[], emp: string, type: string) => {
    if (!user.isAdmin) return;
    if (!confirm(`Remove ${type} for ${emp} on ${dates.length} days?`)) return;
    const { error } = await getSb().from('leave_entries').delete()
      .in('schedule_date', dates)
      .eq('employee_name', emp)
      .eq('leave_type', type);
    if (error) alert(error.message);
    else refresh();
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h2 className="font-serif text-3xl">Pre-Approved Leaves</h2>
          {user.isAdmin && (
            <button 
              onClick={() => setShowPlanner(true)}
              className="flex items-center gap-2 bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20 px-4 py-2 rounded-xl text-sm font-bold hover:bg-[var(--accent)] hover:text-black transition-all"
            >
              <Calendar size={16} />
              Yearly Planner
            </button>
          )}
        </div>
        <div className="flex bg-[var(--surface)] border border-[var(--border)] rounded-xl p-1 gap-1 items-center px-2">
          <Calendar size={16} className="text-white ml-1" />
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
                <option value="Sick Leave">Sick Leave</option>
                <option value="Half Day">Half Day</option>
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

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-3xl overflow-hidden shadow-xl shadow-black/20">
        {groupedLeaves.length === 0 ? (
          <div className="py-20 text-center text-[var(--muted)] border-2 border-dashed border-[var(--border)] m-4 rounded-2xl">No leave records for this month</div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {groupedLeaves.map((l: any, idx: number) => (
              <div key={`${l.employee_name}-${l.leave_type}-${idx}`} className="px-6 py-4 flex justify-between items-center group hover:bg-white/[0.01] transition-colors">
                <div className="flex items-center gap-3">
                  <div className="font-bold text-sm">{l.employee_name}</div>
                  <div className="text-[var(--muted)] opacity-30 font-light">-</div>
                  <div className="text-[11px] text-[var(--muted)]">
                    leave date<span className="font-mono bg-[var(--surface2)] px-2 py-0.5 rounded-md border border-[var(--border)] ml-1">({formatGroupDates(l.dates)})</span>
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${
                    l.leave_type === 'Sick Leave' ? 'text-orange-400' :
                    l.leave_type === 'Half Day' ? 'text-green-400' :
                    'text-purple-400'
                  }`}>
                    {l.leave_type}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {user.isAdmin && (
                    <button onClick={() => removeGroupLeave(l.dates, l.employee_name, l.leave_type)} className="text-[var(--red)] opacity-0 group-hover:opacity-100 p-2 hover:bg-red-500/10 rounded-xl transition-all">
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {showPlanner && (
        <YearlyLeavePlannerModal 
          data={data} 
          user={user} 
          refresh={refresh} 
          onClose={() => setShowPlanner(false)} 
        />
      )}
    </div>
  );
}

function SkillsView({ user }: any) {
  const [curYear, setCurYear] = useState(new Date().getUTCFullYear());
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
      <div className="flex flex-wrap items-center justify-between gap-4 text-white">
        <h2 className="font-serif text-3xl">Soft Skills Training</h2>
        <div className="flex bg-[var(--surface)] border border-[var(--border)] rounded-xl p-1 gap-1 items-center px-2">
          <Calendar size={16} className="text-white ml-1" />
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
    { id: 'shift63', label: 'Schedule Notes', sub: '6:00AM - 3:00PM / 8:00AM - 5:00PM Logs', icon: <Calendar size={18} className="text-white" /> },
    { id: 'graveyard', label: 'Schedule Notes', sub: '10:00PM - 6:00AM Logs', icon: <Calendar size={18} className="text-white" /> },
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
      return existing || { row_idx: i, row_data: { name: '', nameColor: '', cols: Array(7).fill(''), colors: Array(7).fill('') } };
    });
    
    setRows(displayRows);
    setLoading(false);
  }, [section.id]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const updateRow = async (idx: number, name: string, cols: string[], colors: string[], nameColor: string) => {
    if (!user.isAdmin) return;
    
    // Update local state first
    setRows(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], row_data: { name, cols, colors, nameColor } };
      return next;
    });

    const { error } = await getSb().from('notes').upsert({
      section_key: section.id,
      row_idx: idx,
      row_data: { name, cols, colors, nameColor }
    }, { onConflict: 'section_key,row_idx' });
    
    if (error) console.error(error);
  };

  const addRows = () => {
    const startIdx = rows.length;
    const newRows = Array.from({ length: 5 }, (_, i) => ({
      row_idx: startIdx + i,
      row_data: { name: '', nameColor: '', cols: Array(7).fill(''), colors: Array(7).fill('') }
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
                onUpdate={(name: string, cols: string[], colors: string[], nameColor: string) => updateRow(i, name, cols, colors, nameColor)} 
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
  const [nameColor, setNameColor] = useState(data?.nameColor || '');
  const [cols, setCols] = useState(data?.cols || Array(7).fill(''));
  const [colors, setColors] = useState(data?.colors || Array(7).fill(''));
  const [activePicker, setActivePicker] = useState<{ ci: number | 'name' } | null>(null);

  useEffect(() => {
    setName(data?.name || '');
    setNameColor(data?.nameColor || '');
    setCols(data?.cols || Array(7).fill(''));
    setColors(data?.colors || Array(7).fill(''));
  }, [data]);

  const handleBlur = () => {
    if (
      name !== data.name || 
      nameColor !== data.nameColor || 
      JSON.stringify(cols) !== JSON.stringify(data.cols) || 
      JSON.stringify(colors) !== JSON.stringify(data.colors)
    ) {
      onUpdate(name, cols, colors, nameColor);
    }
  };

  const updateCol = (idx: number, val: string) => {
    const next = [...cols];
    next[idx] = val;
    setCols(next);
  };

  const updateColor = (idx: number | 'name', color: string) => {
    if (idx === 'name') {
      setNameColor(color);
      onUpdate(name, cols, colors, color);
    } else {
      const next = [...colors];
      next[idx] = color;
      setColors(next);
      onUpdate(name, cols, next, nameColor);
    }
    setActivePicker(null);
  };

  const getCellColor = (val: string, customColor: string) => {
    if (customColor) return customColor;
    if (!val) return '';
    const lower = val.toLowerCase();
    if (lower.includes('jan')) return 'rgba(234, 179, 8, 0.2)';
    if (lower.includes('feb')) return 'rgba(239, 68, 68, 0.2)';
    if (lower.includes('march')) return 'rgba(16, 185, 129, 0.2)';
    if (lower.includes('april')) return 'rgba(168, 85, 247, 0.2)';
    if (lower.includes('may')) return 'rgba(6, 182, 212, 0.2)';
    if (lower.includes('june')) return 'rgba(249, 115, 22, 0.2)';
    return '';
  };

  const PRESET_COLORS = [
    { name: 'None', value: '' },
    { name: 'Yellow', value: 'rgba(234, 179, 8, 0.3)' },
    { name: 'Red', value: 'rgba(239, 68, 68, 0.3)' },
    { name: 'Green', value: 'rgba(16, 185, 129, 0.3)' },
    { name: 'Purple', value: 'rgba(168, 85, 247, 0.3)' },
    { name: 'Cyan', value: 'rgba(6, 182, 212, 0.3)' },
    { name: 'Orange', value: 'rgba(249, 115, 22, 0.3)' },
    { name: 'Blue', value: 'rgba(59, 130, 246, 0.3)' },
    { name: 'Pink', value: 'rgba(236, 72, 153, 0.3)' },
    { name: 'Indigo', value: 'rgba(99, 102, 241, 0.3)' },
    { name: 'Teal', value: 'rgba(20, 184, 166, 0.3)' },
    { name: 'Lime', value: 'rgba(132, 204, 22, 0.3)' },
    { name: 'Amber', value: 'rgba(245, 158, 11, 0.3)' },
    { name: 'Rose', value: 'rgba(244, 63, 94, 0.3)' },
    { name: 'Slate', value: 'rgba(71, 85, 105, 0.5)' },
    { name: 'Gray', value: 'rgba(156, 163, 175, 0.3)' },
  ];

  return (
    <tr className="group transition-colors h-9">
      <td className="text-center font-mono text-[10px] text-[var(--muted)] border-r border-b border-[var(--border)] bg-[#161820]/50 group-hover:bg-[#20232d] transition-colors">
        {index + 1}
      </td>
      <td 
        className="border-r border-b border-[var(--border)] p-0 relative group/name w-64 min-w-[200px]"
        style={{ backgroundColor: nameColor || 'transparent' }}
      >
        <input 
          value={name} 
          onChange={e => setName(e.target.value)} 
          onBlur={handleBlur} 
          readOnly={readonly}
          placeholder={readonly ? "" : "..."}
          className="w-full h-full bg-transparent text-[11px] font-bold text-[var(--text)] px-3 outline-none focus:bg-[var(--accent)]/5 hover:bg-white/[0.02]" 
        />
        {!readonly && (
          <button 
            onClick={() => setActivePicker({ ci: 'name' })}
            className="absolute right-1 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--accent)] opacity-0 group-hover/name:opacity-100 transition-opacity"
          >
            <Palette size={10} />
          </button>
        )}
        {!readonly && activePicker?.ci === 'name' && (
          <>
            <div className="fixed inset-0 z-[60]" onClick={() => setActivePicker(null)} />
            <div className="absolute top-full left-0 z-[70] mt-1 bg-[#1a1d24] border border-[var(--border)] rounded-lg p-2 shadow-2xl flex flex-wrap gap-1.5 w-44">
              {PRESET_COLORS.map(c => (
                <button
                  key={c.name}
                  onClick={() => updateColor('name', c.value)}
                  title={c.name}
                  className="w-4 h-4 rounded-full border border-white/10 hover:scale-110 transition-transform"
                  style={{ backgroundColor: c.value || '#333' }}
                />
              ))}
            </div>
          </>
        )}
      </td>
      {Array.from({ length: 7 }).map((_, ci) => {
        const val = cols[ci] || '';
        const customColor = colors[ci] || '';
        const backgroundColor = getCellColor(val, customColor);
        
        return (
          <td 
            key={ci} 
            className="border-r border-b border-[var(--border)] p-0 relative group/cell"
            style={{ backgroundColor: backgroundColor || 'transparent' }}
          >
            <input 
              value={val} 
              onChange={e => updateCol(ci, e.target.value)} 
              onBlur={handleBlur} 
              readOnly={readonly}
              className={`w-full h-full bg-transparent text-[9px] px-2 outline-none text-center rounded transition-all ${
                backgroundColor ? 'font-bold' : 'hover:bg-white/[0.02]'
              }`} 
            />
            {!readonly && (
              <button 
                onClick={() => setActivePicker({ ci })}
                className="absolute right-0.5 top-0.5 text-[var(--muted)] hover:text-[var(--accent)] opacity-0 group-hover/cell:opacity-100 transition-opacity"
              >
                <Palette size={8} />
              </button>
            )}
            {!readonly && activePicker?.ci === ci && (
              <>
                <div className="fixed inset-0 z-[60]" onClick={() => setActivePicker(null)} />
                <div className="absolute top-full left-0 z-[70] mt-1 bg-[#1a1d24] border border-[var(--border)] rounded-lg p-2 shadow-2xl flex flex-wrap gap-1.5 w-44">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c.name}
                      onClick={() => updateColor(ci, c.value)}
                      title={c.name}
                      className="w-4 h-4 rounded-full border border-white/10 hover:scale-110 transition-transform"
                      style={{ backgroundColor: c.value || '#333' }}
                    />
                  ))}
                </div>
              </>
            )}
          </td>
        );
      })}
    </tr>
  );
}


