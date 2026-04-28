export const getPHTDate = () => {
  // Philippine Time is UTC+8
  const d = new Date();
  const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
  return new Date(utc + (3600000 * 8));
};

export const getPHTTodayStr = () => {
  const d = getPHTDate();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const getPHTYesterdayStr = () => {
  const d = getPHTDate();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const formatDate = (date: Date) => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export async function analyzeAndProjectAssignments(
  currentAssignments: any[],
  employees: string[],
  todayStr: string
) {
  const relevantTasks = ['SDP', 'DELTA'];
  const sdpDeltaAssignments = currentAssignments.filter(a => relevantTasks.includes(a.task));
  
  if (sdpDeltaAssignments.length === 0) return [];

  // Group by employee set to identify teams
  const teamsMap: Record<string, any[]> = {};
  sdpDeltaAssignments.forEach(a => {
    const teamKey = [...a.employees].sort().join(',');
    if (!teamsMap[teamKey]) teamsMap[teamKey] = [];
    teamsMap[teamKey].push(a);
  });

  const newAssignments: any[] = [];

  for (const teamKey in teamsMap) {
    const teamAssignments = teamsMap[teamKey].sort((a, b) => b.dutyTo.localeCompare(a.dutyTo));
    const lastAssignment = teamAssignments[0];
    
    if (lastAssignment.dutyTo < todayStr) {
      let currDate = new Date(lastAssignment.dutyTo + 'T00:00:00');
      currDate.setDate(currDate.getDate() + 1);
      
      let lastTask = lastAssignment.task;
      
      while (formatDate(currDate) <= todayStr) {
        const nextTask = lastTask === 'SDP' ? 'DELTA' : 'SDP';
        newAssignments.push({
          task_name: nextTask,
          duty_from: formatDate(currDate),
          duty_to: formatDate(currDate),
          employees: lastAssignment.employees,
          added_by: 'Persona (Auto-Swap)'
        });
        lastTask = nextTask;
        currDate.setDate(currDate.getDate() + 1);
        
        if (newAssignments.length >= 7) break;
      }
    }
  }

  return newAssignments;
}
