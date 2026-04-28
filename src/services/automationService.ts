import { GoogleGenAI } from "@google/genai";

// Standard AI Studio way to access the key, but with a safety fallback for the browser build
const getApiKey = () => {
  if (typeof process !== 'undefined' && process.env && process.env.GEMINI_API_KEY) {
    return process.env.GEMINI_API_KEY;
  }
  // @ts-ignore
  return import.meta.env?.VITE_GEMINI_API_KEY || '';
};

const ai = new GoogleGenAI({ apiKey: getApiKey() });

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
  // This function uses AI to identify the "Auto-Swap" pattern and ensure it's up to date
  // We look for patterns like SDP -> DELTA or vice versa
  
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
      // We have a gap. Determine the rotation.
      // Use AI to confirm the cycle if it's more than just a swap, 
      // but for now, we follow the requested swap logic.
      
      let currDate = new Date(lastAssignment.dutyTo + 'T00:00:00');
      currDate.setDate(currDate.getDate() + 1);
      const today = new Date(todayStr + 'T00:00:00');
      
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
        
        // Safety: don't project more than 7 days at a time via this automated path
        if (newAssignments.length >= 7) break;
      }
    }
  }

  return newAssignments;
}

export async function askAIAboutTaskRotation(history: any[]) {
  try {
    const prompt = `
      Analyze the following task assignment history and identify if there is a rotation pattern (e.g. SDP swaps with DELTA daily).
      History: ${JSON.stringify(history.slice(0, 10))}
      
      Current Date (PHT): ${getPHTTodayStr()}
      
      If you see a pattern, explain it and suggest what the next tasks should be for the current date if they are missing.
      Return your answer in a concise way.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });

    return response.text;
  } catch (err) {
    console.error("AI Analysis failed:", err);
    return null;
  }
}
