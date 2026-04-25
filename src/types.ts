export interface Admin {
  id: string;
  name: string;
  added_by?: string;
}

export interface Employee {
  id: string;
  name: string;
  added_by?: string;
}

export interface TaskType {
  id: string;
  name: string;
}

export interface Assignment {
  id: string;
  task: string;
  dutyFrom: string;
  dutyTo: string;
  dateAssigned: string;
  employees: string[];
  addedBy: string;
}

export interface ShiftType {
  id: number;
  name: string;
  sort_order: number;
}

export interface ScheduleEntry {
  id: string;
  schedule_date: string;
  shift_type_id: number;
  employee_name: string;
}

export interface LeaveEntry {
  id: string;
  schedule_date: string;
  employee_name: string;
  leave_type: string;
}

export interface SoftSkill {
  year: number;
  month: number;
  row_num: number;
  content: string;
}

export interface NoteRow {
  section_key: string;
  row_idx: number;
  row_data: {
    name?: string;
    cols?: string[];
    cellColors?: { [key: number]: string };
  };
}

export type AppTab = 'admin' | 'employee' | 'schedule' | 'leave' | 'skills' | 'notes';
