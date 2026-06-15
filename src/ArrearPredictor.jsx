import React, { useState, useMemo, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip,
} from "recharts";
import {
  GraduationCap, AlertTriangle, TrendingUp, CheckCircle2, Settings2,
  Plus, Trash2, Calculator, Info, Activity, ShieldCheck,
  Calendar, Clock, CheckSquare, BookOpen, Sparkles, LogOut, User, Users, ArrowLeft
} from "lucide-react";

/* ------------------------------------------------------------------ *
 *  ARREAR PREDICTOR & EXAM PLANNER  —  a transparent risk tool
 *  Model: logistic risk score from interpretable academic drivers.
 *  Everything recomputes live, so the inputs double as a what-if sim.
 * ------------------------------------------------------------------ */

const C = {
  paper: "#F5F1E7",
  card: "#FCFAF3",
  ink: "#1B1813",
  faint: "#6E665A",
  line: "#E2DBCB",
  brand: "#13483B",
  brass: "#B07A1E",
  safe: "#2F7A4D",
  watch: "#C99A2A",
  risk: "#CE7A24",
  high: "#B23A2C",
};

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const sigmoid = (z) => 1 / (1 + Math.exp(-z));

const formatTime = (decimalHours) => {
  if (!decimalHours || decimalHours <= 0) return "0h";
  const h = Math.floor(decimalHours);
  const m = Math.round((decimalHours - h) * 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
};

// Logistic weights — chosen to be defensible & interpretable in a viva.
const W = { bias: -1.15, att: 0.72, internal: 0.62, assign: 0.34, cgpa: 0.52, arrears: 0.42 };

function bandOf(risk) {
  if (risk < 0.25) return { label: "Safe", color: C.safe };
  if (risk < 0.5) return { label: "Watch", color: C.watch };
  if (risk < 0.75) return { label: "At Risk", color: C.risk };
  return { label: "High Risk", color: C.high };
}

function analyse(sub, reg, student) {
  const internalPct = sub.internalMax > 0 ? (sub.internalScored / sub.internalMax) * 100 : 0;

  // Interpretable feature deficits (positive = riskier)
  const f = {
    att: (reg.minAttendance - sub.attendance) / 10,
    internal: (60 - internalPct) / 10,
    assign: (70 - sub.assignmentPct) / 10,
    cgpa: (6.5 - (student?.prevCGPA ?? 7.0)) * 0.8,
    arrears: (student?.existingArrears ?? 0) * 0.5,
  };
  const contrib = {
    att: W.att * f.att,
    internal: W.internal * f.internal,
    assign: W.assign * f.assign,
    cgpa: W.cgpa * f.cgpa,
    arrears: W.arrears * f.arrears,
  };
  const z = W.bias + contrib.att + contrib.internal + contrib.assign + contrib.cgpa + contrib.arrears;
  const baseRisk = clamp(sigmoid(z), 0.01, 1.0);

  // Mitigation calculation based on preparation in Exam Study Planner
  const totalTasks = sub.tasks ? sub.tasks.length : 0;
  const completedTasks = sub.tasks ? sub.tasks.filter((t) => t.completed).length : 0;
  const taskRatio = totalTasks > 0 ? completedTasks / totalTasks : 0;

  // Configure recommended study time
  const recHrs = sub.recommendedHours !== undefined ? sub.recommendedHours : Math.max(3, Math.round(baseRisk * 20));
  const recMins = sub.recommendedMinutes || 0;
  const totalRecommendedHours = recHrs + (recMins / 60);

  const loggedHrs = sub.loggedHours || 0;
  const loggedMins = sub.loggedMinutes || 0;
  const totalLoggedHours = loggedHrs + (loggedMins / 60);

  const hoursRatio = totalRecommendedHours > 0 ? clamp(totalLoggedHours / totalRecommendedHours, 0, 1.2) : 0;

  let mitigation = 0;
  if (totalTasks > 0) {
    mitigation = (taskRatio * 0.4) + (hoursRatio * 0.3); // max 0.76 (76% risk reduction)
  } else {
    mitigation = hoursRatio * 0.5; // max 0.60 (60% risk reduction)
  }
  
  const mitigatedRisk = clamp(baseRisk * (1 - mitigation), 0.01, 1.0);
  
  let risk = mitigatedRisk;
  let prepFloor = 0;
  let prepFloorActive = false;

  // Dynamic preparation floor: 75% floor at 0% tasks complete, scaling down to 0% floor at 100% tasks complete
  if (totalTasks > 0) {
    prepFloor = 0.75 * (1 - taskRatio);
    if (prepFloor > mitigatedRisk) {
      risk = prepFloor;
      prepFloorActive = true;
    }
  }

  const LABELS = {
    att: "Low attendance",
    internal: "Weak internal marks",
    assign: "Pending assignments",
    cgpa: "Low prior CGPA",
    arrears: "Existing arrear history",
  };
  const reasons = Object.keys(contrib)
    .map((k) => ({ key: k, label: LABELS[k], val: contrib[k] }))
    .filter((r) => r.val > 0.12)
    .sort((a, b) => b.val - a.val)
    .slice(0, 3);

  // Add custom reason for unstarted/incomplete preparation if the floor is actively raising risk
  if (prepFloorActive) {
    if (taskRatio === 0) {
      reasons.unshift({ key: "unstarted_prep", label: "Zero study topics completed", val: 0.8 });
    } else {
      reasons.unshift({ key: "incomplete_prep", label: `Study prep incomplete (${Math.round(taskRatio*100)}%)`, val: 0.6 });
    }
  }

  // Marks needed in the final external exam to pass.
  const ext = 100 - reg.internalWeight;
  const internalContribution = reg.internalWeight * (internalPct / 100);
  let neededExternalPct = ext > 0 ? ((reg.passMark - internalContribution) / ext) * 100 : 0;
  neededExternalPct = Math.max(neededExternalPct, reg.minExternal);
  const impossible = neededExternalPct > 100;
  const alreadySafe = neededExternalPct <= 0;

  // Recommendation from the dominant driver.
  let rec;
  const attDeficit = reg.minAttendance - sub.attendance;
  if (prepFloorActive) {
    if (taskRatio === 0) {
      rec = `No study tasks completed. Check off at least one topic in the Exam Planner to remove the High Risk warning.`;
    } else {
      rec = `Study prep is only ${Math.round(taskRatio*100)}% complete, keeping risk elevated. Complete more study topics to reduce risk.`;
    }
  } else if (reasons[0]?.key === "att" && attDeficit > 0) {
    rec = `Attendance is ${attDeficit.toFixed(0)}% below the ${reg.minAttendance}% bar — attend consistently to regain exam eligibility.`;
  } else if (reasons[0]?.key === "internal") {
    rec = `Internals are light. Target ≥ ${Math.min(100, neededExternalPct).toFixed(0)}% in the final to clear the ${reg.passMark}% pass mark.`;
  } else if (reasons[0]?.key === "assign") {
    rec = `Submit pending assignments — they lift internals with low effort and cut risk fast.`;
  } else if (reasons.length === 0 || reasons[0]?.key === "unstarted_prep" || reasons[0]?.key === "incomplete_prep") {
    rec = `On track. Keep attendance and internals steady through the final.`;
  } else {
    rec = `Stay consistent; small gains in internals and attendance compound.`;
  }

  return { 
    internalPct, 
    baseRisk, 
    mitigatedRisk,
    risk, 
    mitigation, 
    prepFloor,
    prepFloorActive,
    taskRatio,
    reasons, 
    neededExternalPct, 
    impossible, 
    alreadySafe, 
    rec, 
    recommendedHours: recHrs,
    recommendedMinutes: recMins,
    loggedHours: loggedHrs,
    loggedMinutes: loggedMins,
    totalRecommendedHours,
    totalLoggedHours
  };
}

const loadLocal = (key, fallback) => {
  try {
    const val = localStorage.getItem(key);
    return val ? JSON.parse(val) : fallback;
  } catch (e) {
    return fallback;
  }
};

const saveLocal = (key, val) => {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {}
};

// Users database
const USERS = {
  "sarah_cse": { id: "sarah_cse", name: "Dr. Sarah Jenkins", role: "staff", dept: "CSE", designation: "CSE Dept Head", password: "password123" },
  "alan_ece": { id: "alan_ece", name: "Prof. Alan Turing", role: "staff", dept: "ECE", designation: "ECE Professor", password: "password123" },
  "nikola_me": { id: "nikola_me", name: "Dr. Nikola Tesla", role: "staff", dept: "ME", designation: "Mechanical Dean", password: "password123" },
  
  "alice_cse": { id: "alice_cse", name: "Alice Smith", role: "student", dept: "CSE", roll: "CSE-2026-01", password: "password123" },
  "bob_cse": { id: "bob_cse", name: "Bob Johnson", role: "student", dept: "CSE", roll: "CSE-2026-02", password: "password123" },
  "charlie_ece": { id: "charlie_ece", name: "Charlie Brown", role: "student", dept: "ECE", roll: "ECE-2026-01", password: "password123" },
  "david_me": { id: "david_me", name: "David Miller", role: "student", dept: "ME", roll: "ME-2026-01", password: "password123" },
};

const defaultReg = { internalWeight: 40, passMark: 50, minAttendance: 75, minExternal: 40 };

const defaultSubjects = [
  // CSE
  {
    id: 1,
    name: "Data Structures",
    dept: "CSE",
    internalMax: 40,
    examDate: "2026-06-10",
    recommendedHours: 12,
    recommendedMinutes: 30,
    tasks: [
      { id: 11, text: "Review Linked Lists & Trees" },
      { id: 12, text: "Implement Graph Traversals (DFS/BFS)" },
      { id: 13, text: "Solve 2025 Final Exam Paper" }
    ]
  },
  {
    id: 2,
    name: "Discrete Maths",
    dept: "CSE",
    internalMax: 40,
    examDate: "2026-06-14",
    recommendedHours: 15,
    recommendedMinutes: 0,
    tasks: [
      { id: 21, text: "Practice Propositional Logic proofs" },
      { id: 22, text: "Review recurrence relations formulas" },
      { id: 23, text: "Solve 5 Induction problems" }
    ]
  },
  {
    id: 3,
    name: "DBMS",
    dept: "CSE",
    internalMax: 40,
    examDate: "2026-06-18",
    recommendedHours: 10,
    recommendedMinutes: 45,
    tasks: [
      { id: 31, text: "Review Normalization (1NF, 2NF, 3NF, BCNF)" },
      { id: 32, text: "Practice SQL queries on join & group by" }
    ]
  },
  // ECE
  {
    id: 4,
    name: "Signals & Systems",
    dept: "ECE",
    internalMax: 40,
    examDate: "2026-06-12",
    recommendedHours: 18,
    recommendedMinutes: 15,
    tasks: [
      { id: 41, text: "Practice Fourier Transform properties" },
      { id: 42, text: "Solve difference equations using Z-transform" }
    ]
  },
  {
    id: 5,
    name: "Analog Circuits",
    dept: "ECE",
    internalMax: 40,
    examDate: "2026-06-15",
    recommendedHours: 14,
    recommendedMinutes: 0,
    tasks: [
      { id: 51, text: "Review Diode clipping & clamping" },
      { id: 52, text: "BJT AC equivalent circuit analysis" },
      { id: 53, text: "Solve Op-Amp feedback problems" }
    ]
  },
  // ME
  {
    id: 6,
    name: "Thermodynamics",
    dept: "ME",
    internalMax: 40,
    examDate: "2026-06-11",
    recommendedHours: 16,
    recommendedMinutes: 30,
    tasks: [
      { id: 61, text: "Study First Law open/closed systems" },
      { id: 62, text: "Practice Carnot cycle efficiency calculation" }
    ]
  },
  {
    id: 7,
    name: "Fluid Mechanics",
    dept: "ME",
    internalMax: 40,
    examDate: "2026-06-16",
    recommendedHours: 13,
    recommendedMinutes: 0,
    tasks: [
      { id: 71, text: "Review dimensional analysis methods" },
      { id: 72, text: "Practice pipe flow head loss problems" }
    ]
  }
];

// Pre-populated student performance database
const defaultStudentDb = {
  "alice_cse": {
    profile: { prevCGPA: 8.2, existingArrears: 0 },
    progress: {
      "1": { attendance: 82, internalScored: 31, assignmentPct: 90, loggedHours: 4, loggedMinutes: 30, completedTasks: [11] },
      "2": { attendance: 64, internalScored: 18, assignmentPct: 55, loggedHours: 1, loggedMinutes: 0, completedTasks: [] },
      "3": { attendance: 71, internalScored: 22, assignmentPct: 70, loggedHours: 2, loggedMinutes: 15, completedTasks: [31] }
    }
  },
  "bob_cse": {
    profile: { prevCGPA: 6.1, existingArrears: 2 },
    progress: {
      "1": { attendance: 65, internalScored: 15, assignmentPct: 45, loggedHours: 0, loggedMinutes: 45, completedTasks: [] },
      "2": { attendance: 76, internalScored: 24, assignmentPct: 80, loggedHours: 5, loggedMinutes: 0, completedTasks: [21, 22] },
      "3": { attendance: 58, internalScored: 10, assignmentPct: 35, loggedHours: 1, loggedMinutes: 30, completedTasks: [] }
    }
  },
  "charlie_ece": {
    profile: { prevCGPA: 7.5, existingArrears: 0 },
    progress: {
      "4": { attendance: 80, internalScored: 28, assignmentPct: 85, loggedHours: 3, loggedMinutes: 0, completedTasks: [41] },
      "5": { attendance: 72, internalScored: 19, assignmentPct: 65, loggedHours: 1, loggedMinutes: 45, completedTasks: [] }
    }
  },
  "david_me": {
    profile: { prevCGPA: 6.9, existingArrears: 1 },
    progress: {
      "6": { attendance: 90, internalScored: 35, assignmentPct: 95, loggedHours: 6, loggedMinutes: 0, completedTasks: [61, 62] },
      "7": { attendance: 66, internalScored: 16, assignmentPct: 50, loggedHours: 1, loggedMinutes: 15, completedTasks: [] }
    }
  }
};

export default function ArrearPredictor() {
  const [currentUser, setCurrentUser] = useState(() => loadLocal("ap_currentUser", null));
  const [users, setUsers] = useState(() => loadLocal("ap_users", {}));
  const [subjects, setSubjects] = useState(() => loadLocal("ap_subjects", []));
  const [studentDb, setStudentDb] = useState(() => loadLocal("ap_studentDb", {}));
  const [reg, setReg] = useState(() => loadLocal("ap_reg", defaultReg));
  
  // UI States
  const [showReg, setShowReg] = useState(false);
  const [activeTab, setActiveTab] = useState("predictor");
  const [staffTab, setStaffTab] = useState("tracking"); // "tracking" or "curriculum"
  const [selectedStudentId, setSelectedStudentId] = useState(null); // Staff drill-down selection
  const [newTasks, setNewTasks] = useState({});
  const [usernameInput, setUsernameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [loginError, setLoginError] = useState("");

  // Registration Form States
  const [regTab, setRegTab] = useState("login"); // "login" or "register"
  const [regUsername, setRegUsername] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regName, setRegName] = useState("");
  const [regRole, setRegRole] = useState("student"); // "student" or "staff"
  const [regDept, setRegDept] = useState("CSE");
  const [regRoll, setRegRoll] = useState("");
  const [regDesignation, setRegDesignation] = useState("");
  const [regError, setRegError] = useState("");

  useEffect(() => {
    saveLocal("ap_currentUser", currentUser);
  }, [currentUser]);

  useEffect(() => {
    saveLocal("ap_users", users);
  }, [users]);

  useEffect(() => {
    saveLocal("ap_subjects", subjects);
  }, [subjects]);

  useEffect(() => {
    saveLocal("ap_studentDb", studentDb);
  }, [studentDb]);

  useEffect(() => {
    saveLocal("ap_reg", reg);
  }, [reg]);

  // Filter subjects based on logged-in or inspected student's department
  const currentDept = useMemo(() => {
    if (!currentUser) return null;
    return currentUser.role === "staff" ? currentUser.dept : currentUser.dept;
  }, [currentUser]);

  const filteredSubjects = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === "staff") {
      // In staff mode, filter by staff's assigned department
      return subjects.filter((s) => s.dept === currentUser.dept);
    } else {
      // In student mode, filter by student's department
      return subjects.filter((s) => s.dept === currentUser.dept);
    }
  }, [subjects, currentUser]);

  // Active student whose progress is being loaded/modified
  const activeStudentId = useMemo(() => {
    if (!currentUser) return null;
    return currentUser.role === "student" ? currentUser.id : selectedStudentId;
  }, [currentUser, selectedStudentId]);

  // Dynamic analysis results for the active student
  const results = useMemo(() => {
    if (!currentUser || !activeStudentId) return [];
    
    const record = studentDb[activeStudentId] || { profile: { prevCGPA: 0, existingArrears: 0 }, progress: {} };
    
    return filteredSubjects.map((sub) => {
      const prog = record.progress[sub.id] || { 
        attendance: 0, 
        internalScored: 0, 
        assignmentPct: 0, 
        loggedHours: 0, 
        loggedMinutes: 0,
        completedTasks: [] 
      };
      
      const masterTasks = sub.tasks || [];
      const mergedTasks = masterTasks.map(t => ({
        ...t,
        completed: (prog.completedTasks || []).includes(t.id)
      }));

      const mergedSub = {
        ...sub,
        attendance: prog.attendance,
        internalScored: prog.internalScored,
        assignmentPct: prog.assignmentPct,
        loggedHours: prog.loggedHours,
        loggedMinutes: prog.loggedMinutes || 0,
        tasks: mergedTasks
      };
      
      const analysis = analyse(mergedSub, reg, record.profile);
      return {
        ...mergedSub,
        ...analysis,
        completedTasksList: prog.completedTasks || []
      };
    });
  }, [filteredSubjects, reg, studentDb, currentUser, activeStudentId]);

  const overall = useMemo(() => {
    if (!results.length) return { avg: 0, atRisk: 0, totalHours: 0, completedHours: 0, totalTasks: 0, completedTasks: 0, nextExam: null };
    const avg = results.reduce((a, r) => a + r.risk, 0) / results.length;
    const atRisk = results.filter((r) => r.risk >= 0.5).length;
    
    const totalHours = results.reduce((a, r) => a + (r.totalRecommendedHours || 0), 0);
    const completedHours = results.reduce((a, r) => a + (r.totalLoggedHours || 0), 0);
    
    let totalTasks = 0;
    let completedTasks = 0;
    results.forEach((r) => {
      if (r.tasks && r.tasks.length) {
        totalTasks += r.tasks.length;
        completedTasks += r.tasks.filter((t) => t.completed).length;
      }
    });

    const upcomingExams = results
      .map((r) => ({ name: r.name, days: getDaysRemaining(r.examDate) }))
      .filter((e) => e.days !== null && e.days >= 0)
      .sort((a, b) => a.days - b.days);
    const nextExam = upcomingExams[0] || null;

    return { avg, atRisk, totalHours, completedHours, totalTasks, completedTasks, nextExam };
  }, [results]);

  const overallBand = bandOf(overall.avg);

  // Consolidated tracking database for staff mapping all department students
  const departmentStudentsData = useMemo(() => {
    if (!currentUser || currentUser.role !== "staff") return [];
    
    // Find all student accounts in the staff's department
    const deptStudents = Object.values(users).filter(
      (u) => u.role === "student" && u.dept === currentUser.dept
    );
    
    return deptStudents.map((stud) => {
      const record = studentDb[stud.id] || { profile: { prevCGPA: 0, existingArrears: 0 }, progress: {} };
      const deptSubjects = subjects.filter((s) => s.dept === currentUser.dept);
      
      let totalRisk = 0;
      let totalTasksCount = 0;
      let completedTasksCount = 0;
      let totalHoursLogged = 0;
      let lowAttendanceCount = 0;
      
      deptSubjects.forEach((sub) => {
        const prog = record.progress[sub.id] || { 
          attendance: 0, 
          internalScored: 0, 
          assignmentPct: 0, 
          loggedHours: 0, 
          loggedMinutes: 0,
          completedTasks: [] 
        };
        
        const masterTasks = sub.tasks || [];
        const mergedTasks = masterTasks.map(t => ({
          ...t,
          completed: (prog.completedTasks || []).includes(t.id)
        }));
        
        const mergedSub = {
          ...sub,
          attendance: prog.attendance,
          internalScored: prog.internalScored,
          assignmentPct: prog.assignmentPct,
          loggedHours: prog.loggedHours,
          loggedMinutes: prog.loggedMinutes || 0,
          tasks: mergedTasks
        };
        
        const analysis = analyse(mergedSub, reg, record.profile);
        totalRisk += analysis.risk;
        totalTasksCount += masterTasks.length;
        completedTasksCount += (prog.completedTasks || []).length;
        const loggedHrs = prog.loggedHours || 0;
        const loggedMins = prog.loggedMinutes || 0;
        totalHoursLogged += loggedHrs + (loggedMins / 60);
        if (prog.attendance < reg.minAttendance) {
          lowAttendanceCount++;
        }
      });
      
      const avgRisk = deptSubjects.length > 0 ? totalRisk / deptSubjects.length : 0;
      
      return {
        ...stud,
        avgRisk,
        totalTasksCount,
        completedTasksCount,
        totalHoursLogged,
        lowAttendanceCount,
        profile: record.profile
      };
    });
  }, [subjects, reg, studentDb, currentUser]);

  // Handlers for student profile and progress values
  const handleProgressChange = (subjectId, key, value) => {
    if (!activeStudentId) return;
    
    setStudentDb((prev) => {
      const record = prev[activeStudentId] || { profile: { prevCGPA: 0, existingArrears: 0 }, progress: {} };
      const prog = record.progress[subjectId] || { attendance: 0, internalScored: 0, assignmentPct: 0, loggedHours: 0, loggedMinutes: 0, completedTasks: [] };
      
      return {
        ...prev,
        [activeStudentId]: {
          ...record,
          progress: {
            ...record.progress,
            [subjectId]: {
              ...prog,
              [key]: value
            }
          }
        }
      };
    });
  };

  const handleProfileChange = (key, value) => {
    if (!activeStudentId) return;
    
    setStudentDb((prev) => {
      const record = prev[activeStudentId] || { profile: { prevCGPA: 0, existingArrears: 0 }, progress: {} };
      return {
        ...prev,
        [activeStudentId]: {
          ...record,
          profile: {
            ...record.profile,
            [key]: value
          }
        }
      };
    });
  };

  // Syllabus task / checklist updates
  const toggleTask = (subId, taskId) => {
    if (!activeStudentId) return;
    
    setStudentDb((prev) => {
      const record = prev[activeStudentId] || { profile: { prevCGPA: 0, existingArrears: 0 }, progress: {} };
      const prog = record.progress[subId] || { attendance: 0, internalScored: 0, assignmentPct: 0, loggedHours: 0, loggedMinutes: 0, completedTasks: [] };
      
      const completed = prog.completedTasks || [];
      const newCompleted = completed.includes(taskId)
        ? completed.filter(id => id !== taskId)
        : [...completed, taskId];
        
      return {
        ...prev,
        [activeStudentId]: {
          ...record,
          progress: {
            ...record.progress,
            [subId]: {
              ...prog,
              completedTasks: newCompleted
            }
          }
        }
      };
    });
  };

  // Master Curriculum Handlers (Staff Only)
  const handleUpdateMasterSubject = (id, key, value) => {
    setSubjects((prev) => prev.map((s) => (s.id === id ? { ...s, [key]: value } : s)));
  };

  const handleAddMasterSubject = () => {
    if (!currentUser || currentUser.role !== "staff") return;
    setSubjects((p) => [
      ...p, 
      { 
        id: Date.now(), 
        name: "New Syllabus Course", 
        dept: currentUser.dept,
        internalMax: 40,
        examDate: "",
        recommendedHours: 10,
        recommendedMinutes: 0,
        tasks: []
      }
    ]);
  };
  
  const handleRemoveMasterSubject = (id) => {
    setSubjects((p) => p.filter((s) => s.id !== id));
  };

  const handleAddMasterTask = (subId) => {
    const text = newTasks[subId]?.trim();
    if (!text) return;
    setSubjects((prev) =>
      prev.map((s) =>
        s.id === subId
          ? {
              ...s,
              tasks: [...(s.tasks || []), { id: Date.now(), text }],
            }
          : s
      )
    );
    setNewTasks((prev) => ({ ...prev, [subId]: "" }));
  };

  const handleRemoveMasterTask = (subId, taskId) => {
    setSubjects((prev) =>
      prev.map((s) =>
        s.id === subId
          ? {
              ...s,
              tasks: (s.tasks || []).filter((t) => t.id !== taskId),
            }
          : s
      )
    );
  };

  // Authentication Handlers
  const handleCustomLogin = (e) => {
    e.preventDefault();
    const cleanUser = usernameInput.trim().toLowerCase();
    
    // Predefined Admin Check
    if (cleanUser === "admin") {
      if (passwordInput === "admin123") {
        const adminUser = { id: "admin", name: "System Administrator", role: "admin", dept: "ALL" };
        setCurrentUser(adminUser);
        setSelectedStudentId(null);
        setLoginError("");
        setUsernameInput("");
        setPasswordInput("");
        return;
      } else {
        setLoginError("Incorrect admin password.");
        return;
      }
    }

    const user = users[cleanUser];
    if (!user) {
      setLoginError("Username not found. Register a new account to sign in.");
      return;
    }
    
    if (user.password !== passwordInput) {
      setLoginError("Incorrect password.");
      return;
    }

    setCurrentUser(user);
    setSelectedStudentId(null);
    setLoginError("");
    setUsernameInput("");
    setPasswordInput("");
  };

  const handleRegister = (e) => {
    e.preventDefault();
    const cleanUsername = regUsername.trim().toLowerCase();
    if (!cleanUsername) {
      setRegError("Username is required.");
      return;
    }
    if (users[cleanUsername]) {
      setRegError("Username is already taken.");
      return;
    }
    if (!regPassword) {
      setRegError("Password is required.");
      return;
    }
    if (regPassword.length < 4) {
      setRegError("Password must be at least 4 characters long.");
      return;
    }
    if (!regName.trim()) {
      setRegError("Full Name is required.");
      return;
    }
    if (regRole === "student" && !regRoll.trim()) {
      setRegError("Roll Number is required for students.");
      return;
    }
    if (regRole === "staff" && !regDesignation.trim()) {
      setRegError("Designation is required for staff.");
      return;
    }

    const newUser = {
      id: cleanUsername,
      name: regName.trim(),
      role: regRole,
      dept: regDept,
      password: regPassword,
      ...(regRole === "student" ? { roll: regRoll.trim() } : { designation: regDesignation.trim() })
    };

    setUsers((prev) => ({
      ...prev,
      [cleanUsername]: newUser
    }));

    if (regRole === "student") {
      setStudentDb((prev) => ({
        ...prev,
        [cleanUsername]: {
          profile: { prevCGPA: 0, existingArrears: 0 },
          progress: {}
        }
      }));
    }

    // Auto-login
    setCurrentUser(newUser);
    setSelectedStudentId(null);
    setRegError("");
    setRegUsername("");
    setRegPassword("");
    setRegName("");
    setRegRoll("");
    setRegDesignation("");
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setSelectedStudentId(null);
    setUsernameInput("");
    setPasswordInput("");
    setLoginError("");
  };

  const handleSeedDemoData = () => {
    setUsers(USERS);
    setSubjects(defaultSubjects);
    setStudentDb(defaultStudentDb);
  };

  const handleWipeDatabase = () => {
    setUsers({});
    setSubjects([]);
    setStudentDb({});
    setCurrentUser(null);
    setSelectedStudentId(null);
    setUsernameInput("");
    setPasswordInput("");
    localStorage.removeItem("ap_currentUser");
    localStorage.removeItem("ap_users");
    localStorage.removeItem("ap_subjects");
    localStorage.removeItem("ap_studentDb");
  };

  const handleRemoveUser = (userId) => {
    setUsers((prev) => {
      const copy = { ...prev };
      delete copy[userId];
      return copy;
    });
    setStudentDb((prev) => {
      const copy = { ...prev };
      delete copy[userId];
      return copy;
    });
  };

  const chartData = results.map((r) => ({ name: r.name.length > 12 ? r.name.slice(0, 11) + "…" : r.name, risk: Math.round(r.risk * 100), color: bandOf(r.risk).color }));

  const fieldStyle = { background: C.paper, border: `1px solid ${C.line}`, color: C.ink, fontFamily: "'JetBrains Mono', monospace" };

  /* ================================================================ */
  /* VIEW 1: AUTHENTICATION PORTAL                                    */
  /* ================================================================ */
  if (!currentUser) {
    return (
      <div style={{ background: C.paper, color: C.ink, minHeight: "100vh", fontFamily: "'Albert Sans', sans-serif" }} className="flex flex-col justify-center items-center py-12 px-4">
        
        <div className="max-w-md w-full space-y-8 animate-fade-in">
          <div className="text-center">
            <div className="inline-flex items-center justify-center rounded-2xl mb-4" style={{ width: 64, height: 64, background: C.brand }}>
              <GraduationCap size={36} color={C.paper} />
            </div>
            <h1 style={{ fontFamily: "'Fraunces', serif", fontWeight: 700 }} className="text-3xl mt-2 text-center">Arrear Predictor & Study Planner</h1>
            <p style={{ color: C.faint }} className="mt-2 text-xs md:text-sm text-center">Role-based Departmental Backlog Risk & Study Tracker</p>
          </div>

          {/* Account Login / Register Forms Card */}
          <div className="rounded-2xl p-6 shadow-sm flex flex-col justify-between" style={{ background: C.card, border: `1px solid ${C.line}` }}>
            <div>
              {/* Form Tabs */}
              <div className="flex border-b mb-6 pb-2" style={{ borderColor: C.line }}>
                <button
                  onClick={() => { setRegTab("login"); setLoginError(""); setRegError(""); }}
                  className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all mr-2 ${
                    regTab === "login"
                      ? "bg-[#13483B] text-[#F5F1E7]"
                      : "text-[#6E665A] hover:bg-[#FCFAF3]"
                  }`}
                >
                  Sign In
                </button>
                <button
                  onClick={() => { setRegTab("register"); setLoginError(""); setRegError(""); }}
                  className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                    regTab === "register"
                      ? "bg-[#13483B] text-[#F5F1E7]"
                      : "text-[#6E665A] hover:bg-[#FCFAF3]"
                  }`}
                >
                  Create Account
                </button>
              </div>

              {regTab === "login" ? (
                <div className="space-y-4 animate-fade-in">
                  <h2 style={{ fontFamily: "'Fraunces', serif" }} className="text-xl font-semibold mb-2 flex items-center gap-2">
                    <User size={18} color={C.brand} /> Account Sign In
                  </h2>
                  <form onSubmit={handleCustomLogin} className="space-y-4">
                    <div>
                      <label className="block text-xs uppercase tracking-wider font-semibold mb-2" style={{ color: C.faint }}>Username</label>
                      <input 
                        type="text" 
                        placeholder="Enter your registered username..."
                        value={usernameInput}
                        onChange={(e) => setUsernameInput(e.target.value)}
                        className="w-full rounded-md px-3 py-2 text-sm border focus:ring-1 outline-none"
                        style={fieldStyle}
                      />
                    </div>
                    <div>
                      <label className="block text-xs uppercase tracking-wider font-semibold mb-2" style={{ color: C.faint }}>Password</label>
                      <input 
                        type="password" 
                        placeholder="••••••••"
                        value={passwordInput}
                        onChange={(e) => setPasswordInput(e.target.value)}
                        className="w-full rounded-md px-3 py-2 text-sm border focus:ring-1 outline-none font-mono"
                        style={fieldStyle}
                      />
                    </div>
                    {loginError && (
                      <p className="text-xs font-semibold" style={{ color: C.high }}>{loginError}</p>
                    )}
                    <button type="submit" className="w-full rounded-lg py-2.5 text-sm font-semibold transition-colors flex items-center justify-center gap-2" style={{ background: C.brand, color: C.paper }}>
                      Login to Console
                    </button>
                  </form>
                </div>
              ) : (
                <div className="space-y-4 animate-fade-in">
                  <h2 style={{ fontFamily: "'Fraunces', serif" }} className="text-xl font-semibold mb-2 flex items-center gap-2">
                    <Users size={18} color={C.brand} /> Register New Account
                  </h2>
                  <form onSubmit={handleRegister} className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: C.faint }}>Username</label>
                        <input 
                          type="text" 
                          placeholder="e.g. jane_doe"
                          value={regUsername}
                          onChange={(e) => setRegUsername(e.target.value)}
                          className="w-full rounded-md px-3 py-1.5 text-sm border outline-none"
                          style={fieldStyle}
                        />
                      </div>
                      <div>
                        <label className="block text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: C.faint }}>Password</label>
                        <input 
                          type="password" 
                          placeholder="Min 4 chars"
                          value={regPassword}
                          onChange={(e) => setRegPassword(e.target.value)}
                          className="w-full rounded-md px-3 py-1.5 text-sm border outline-none font-mono"
                          style={fieldStyle}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: C.faint }}>Full Name</label>
                        <input 
                          type="text" 
                          placeholder="e.g. Jane Doe"
                          value={regName}
                          onChange={(e) => setRegName(e.target.value)}
                          className="w-full rounded-md px-3 py-1.5 text-sm border outline-none"
                          style={fieldStyle}
                        />
                      </div>
                      <div>
                        <label className="block text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: C.faint }}>User Role</label>
                        <select
                          value={regRole}
                          onChange={(e) => setRegRole(e.target.value)}
                          className="w-full rounded-md px-3 py-1.5 text-sm border outline-none bg-transparent font-mono"
                          style={fieldStyle}
                        >
                          <option value="student" style={{ background: C.card, color: C.ink }}>Student</option>
                          <option value="staff" style={{ background: C.card, color: C.ink }}>Staff / Faculty</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: C.faint }}>Department</label>
                        <select
                          value={regDept}
                          onChange={(e) => setRegDept(e.target.value)}
                          className="w-full rounded-md px-3 py-1.5 text-sm border outline-none bg-transparent font-mono"
                          style={fieldStyle}
                        >
                          <option value="CSE" style={{ background: C.card, color: C.ink }}>CSE</option>
                          <option value="ECE" style={{ background: C.card, color: C.ink }}>ECE</option>
                          <option value="ME" style={{ background: C.card, color: C.ink }}>Mechanical (ME)</option>
                          <option value="IT" style={{ background: C.card, color: C.ink }}>Information Tech (IT)</option>
                          <option value="EEE" style={{ background: C.card, color: C.ink }}>Electrical (EEE)</option>
                          <option value="Civil" style={{ background: C.card, color: C.ink }}>Civil Engineering</option>
                        </select>
                      </div>
                      <div>
                        {regRole === "student" ? (
                          <div>
                            <label className="block text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: C.faint }}>Roll Number</label>
                            <input 
                              type="text" 
                              placeholder="e.g. CSE-2026-44"
                              value={regRoll}
                              onChange={(e) => setRegRoll(e.target.value)}
                              className="w-full rounded-md px-3 py-1.5 text-sm border outline-none"
                              style={fieldStyle}
                            />
                          </div>
                        ) : (
                          <div>
                            <label className="block text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: C.faint }}>Designation</label>
                            <input 
                              type="text" 
                              placeholder="e.g. Senior Professor"
                              value={regDesignation}
                              onChange={(e) => setRegDesignation(e.target.value)}
                              className="w-full rounded-md px-3 py-1.5 text-sm border outline-none"
                              style={fieldStyle}
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    {regError && (
                      <p className="text-xs font-semibold" style={{ color: C.high }}>{regError}</p>
                    )}

                    <button type="submit" className="w-full rounded-lg py-2 text-sm font-semibold transition-colors mt-2" style={{ background: C.brand, color: C.paper }}>
                      Create Account & Login
                    </button>
                  </form>
                </div>
              )}
            </div>
            
            <div className="mt-6 pt-4 border-t text-xs text-center" style={{ borderColor: C.line, color: C.faint }}>
              {regTab === "login" 
                ? "Enter your registered credentials to sign in." 
                : "All profile metrics and progress checkboxes save to your local browser storage."
              }
            </div>
          </div>

          {/* Relocated Database Control Panel to Admin Console */}

        </div>
      </div>
    );
  }

  /* ================================================================ */
  /* VIEW 2: LOGGED IN APPLICATION                                    */
  /* ================================================================ */
  return (
    <div style={{ background: C.paper, color: C.ink, minHeight: "100vh", fontFamily: "'Albert Sans', sans-serif" }}>
      <style>{`
        input[type=range]{-webkit-appearance:none;height:4px;border-radius:99px;background:${C.line};outline:none;}
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;background:${C.brand};cursor:pointer;border:2px solid ${C.card};}
        input[type=range]::-moz-range-thumb{width:16px;height:16px;border-radius:50%;background:${C.brand};cursor:pointer;border:2px solid ${C.card};}
      `}</style>

      <div className="max-w-5xl mx-auto px-5 py-8">
        {/* Header Console */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 border-b pb-4" style={{ borderColor: C.ink, borderTop: `2px solid ${C.ink}`, paddingTop: 14 }}>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center rounded-xl" style={{ width: 44, height: 44, background: C.brand }}>
              <GraduationCap size={24} color={C.paper} />
            </div>
            <div>
              <h1 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 26, lineHeight: 1 }}>Arrear Predictor & Planner</h1>
              <p style={{ color: C.faint, fontSize: 13, marginTop: 4 }}>Departmental Academic Audit and Study Tracking System</p>
            </div>
          </div>
          
          {/* User Sign-In Display & Log out */}
          <div className="flex items-center gap-3 mt-3 md:mt-0">
            <div className="rounded-lg px-3 py-2 flex items-center gap-2 text-xs font-semibold shadow-sm" style={{ background: C.card, border: `1px solid ${C.line}` }}>
              <div className="w-2 h-2 rounded-full animate-ping" style={{ background: currentUser.role === "staff" ? C.brass : C.brand }} />
              <div>
                <span style={{ color: C.faint }}>Signed in: </span>
                <span style={{ color: C.ink }}>{currentUser.name} <b>({currentUser.dept})</b></span>
              </div>
            </div>
            <button 
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors"
              style={{ background: C.high, color: C.paper }}
            >
              <LogOut size={13} /> Exit
            </button>
          </div>
        </div>

        {/* ======================================================== */}
        {/* ADMIN PORTAL UI                                          */}
        {/* ======================================================== */}
        {currentUser.role === "admin" && (
          <div className="space-y-6 animate-fade-in">
            {/* Header banner */}
            <div className="rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between shadow-sm" style={{ background: C.card, border: `1px solid ${C.line}` }}>
              <div>
                <h2 style={{ fontFamily: "'Fraunces', serif" }} className="text-lg font-semibold text-[#1B1813] flex items-center gap-2">
                  <Settings2 size={20} color={C.brand} /> System Administrator Console
                </h2>
                <p className="text-xs text-[#6E665A] mt-1">Global audit access. Seed/wipe database configurations, manage course templates, and audit profiles.</p>
              </div>
            </div>

            {/* Admin Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* DB Controls Card */}
              <div className="rounded-xl p-5 shadow-sm space-y-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
                <h3 className="text-sm font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: C.faint }}>
                  <Calculator size={16} color={C.brand} /> System DB Controls
                </h3>
                <p className="text-xs" style={{ color: C.faint }}>Initialize or clean local database variables. Direct actions immediately persist in local storage.</p>
                <div className="flex flex-col gap-2 pt-2">
                  <button
                    onClick={handleSeedDemoData}
                    className="w-full rounded-lg py-2.5 text-xs font-semibold hover:bg-opacity-95 transition-all text-center flex items-center justify-center gap-1.5"
                    style={{ background: C.brand, color: C.paper }}
                  >
                    <Sparkles size={13} /> Seed CSE/ECE/ME Demo Data
                  </button>
                  <button
                    onClick={handleWipeDatabase}
                    className="w-full rounded-lg py-2.5 text-xs font-semibold hover:bg-opacity-95 transition-all text-center flex items-center justify-center gap-1.5"
                    style={{ background: C.high, color: C.paper }}
                  >
                    <Trash2 size={13} /> Wipe Entire Database Clean
                  </button>
                </div>
              </div>

              {/* Subject Templates Audit */}
              <div className="rounded-xl p-5 shadow-sm space-y-4 lg:col-span-2" style={{ background: C.card, border: `1px solid ${C.line}` }}>
                <h3 className="text-sm font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: C.faint }}>
                  <BookOpen size={16} color={C.brand} /> Global Subject Templates Directory
                </h3>
                <div className="max-h-48 overflow-y-auto pr-1">
                  {subjects.length === 0 ? (
                    <p className="text-xs italic text-center py-8" style={{ color: C.faint }}>No course templates logged. Seed data or log in as admin to seed demo courses.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {subjects.map((sub) => (
                        <div key={sub.id} className="p-2.5 rounded-lg text-xs flex justify-between items-start" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
                          <div>
                            <span className="font-semibold" style={{ color: C.ink }}>{sub.name}</span>
                            <div className="mt-1" style={{ color: C.faint }}>
                              Dept: <b>{sub.dept}</b> · Max Internal: {sub.internalMax}
                              {(sub.recommendedHours !== undefined || sub.recommendedMinutes !== undefined) && ` · Target: ${sub.recommendedHours || 0}h ${sub.recommendedMinutes || 0}m`}
                            </div>
                          </div>
                          <span className="rounded-full px-2 py-0.5 font-bold uppercase text-[9px]" style={{ background: C.line, color: C.ink }}>{(sub.tasks || []).length} topics</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Users Directory Table Card */}
            <div className="rounded-xl p-5 shadow-sm space-y-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
              <h3 className="text-sm font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: C.faint }}>
                <Users size={16} color={C.brand} /> Registered Accounts Directory ({Object.keys(users).length} profiles)
              </h3>
              
              {Object.keys(users).length === 0 ? (
                <p className="text-xs italic text-center py-8" style={{ color: C.faint }}>No registered user accounts found in local storage database.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="uppercase font-semibold" style={{ color: C.faint, borderBottom: `1px solid ${C.line}` }}>
                        <th className="pb-2">Username</th>
                        <th className="pb-2">Name</th>
                        <th className="pb-2">Role</th>
                        <th className="pb-2">Department</th>
                        <th className="pb-2">Roll / Designation</th>
                        <th className="pb-2">Password</th>
                        <th className="pb-2 text-center">Manage</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2DBCB]">
                      {Object.values(users).map((u) => (
                        <tr key={u.id} className="hover:bg-[#FCFAF3]">
                          <td className="py-2.5 font-semibold font-mono" style={{ color: C.ink }}>{u.id}</td>
                          <td className="py-2.5 font-semibold" style={{ color: C.ink }}>{u.name}</td>
                          <td className="py-2.5 capitalize">{u.role}</td>
                          <td className="py-2.5 font-bold">{u.dept}</td>
                          <td className="py-2.5">{u.roll || u.designation || "N/A"}</td>
                          <td className="py-2.5 font-mono">{u.password || "N/A"}</td>
                          <td className="py-2.5 text-center">
                            <button onClick={() => handleRemoveUser(u.id)} style={{ color: C.high }} title="Delete Account">
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* STAFF PORTAL UI                                          */}
        {/* ======================================================== */}
        {currentUser.role === "staff" && (
          <div className="space-y-6">
            {/* Staff Sub-Tabs */}
            <div className="flex gap-2 border-b border-[#E2DBCB] pb-2">
              <button
                onClick={() => { setStaffTab("tracking"); setSelectedStudentId(null); }}
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                  staffTab === "tracking" && !selectedStudentId
                    ? "bg-[#13483B] text-[#F5F1E7]"
                    : "text-[#6E665A] hover:bg-[#FCFAF3]"
                }`}
              >
                <Users size={14} /> Student Performance Tracker ({currentUser.dept})
              </button>
              <button
                onClick={() => { setStaffTab("curriculum"); setSelectedStudentId(null); }}
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                  staffTab === "curriculum"
                    ? "bg-[#13483B] text-[#F5F1E7]"
                    : "text-[#6E665A] hover:bg-[#FCFAF3]"
                }`}
              >
                <BookOpen size={14} /> Curriculum & Syllabus Manager
              </button>
              {selectedStudentId && (
                <div className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#FEF3C7] text-[#B07A1E] flex items-center gap-1.5">
                  <User size={14} /> Inspecting: {users[selectedStudentId]?.name}
                </div>
              )}
            </div>

            {/* Curriculum Editor tab */}
            {staffTab === "curriculum" && (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <h2 style={{ fontFamily: "'Fraunces', serif" }} className="text-xl font-semibold">Master Subjects & Syllabus Checklist ({currentUser.dept})</h2>
                  <button onClick={handleAddMasterSubject} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ background: C.brand, color: C.paper }}>
                    <Plus size={13} /> Add Subject Course
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredSubjects.map((sub) => (
                    <div key={sub.id} className="rounded-xl p-4 shadow-sm" style={{ background: C.card, border: `1px solid ${C.line}` }}>
                      <div className="flex items-center justify-between pb-3 border-b mb-3" style={{ borderColor: C.line }}>
                        <div className="w-4/5">
                          <label className="block text-[10px] uppercase font-bold" style={{ color: C.faint }}>Course Title</label>
                          <input 
                            value={sub.name} 
                            onChange={(e) => handleUpdateMasterSubject(sub.id, "name", e.target.value)}
                            className="bg-transparent outline-none border-b border-dashed border-[#6E665A] font-semibold text-base w-full"
                          />
                        </div>
                        <button onClick={() => handleRemoveMasterSubject(sub.id)} style={{ color: C.high }} title="Delete Course">
                          <Trash2 size={15} />
                        </button>
                      </div>

                      {/* Course Settings: Internals & Exam Date */}
                      <div className="grid grid-cols-2 gap-3 pb-3 border-b mb-3" style={{ borderColor: C.line }}>
                        <div>
                          <label className="block text-[9px] uppercase font-bold" style={{ color: C.faint }}>Max Internals</label>
                          <input 
                            type="number" 
                            value={sub.internalMax || 40} 
                            onChange={(e) => handleUpdateMasterSubject(sub.id, "internalMax", Math.max(1, +e.target.value))}
                            className="w-full text-center rounded text-xs font-semibold outline-none py-1"
                            style={fieldStyle}
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] uppercase font-bold" style={{ color: C.faint }}>Exam Date</label>
                          <input 
                            type="date" 
                            value={sub.examDate || ""} 
                            onChange={(e) => handleUpdateMasterSubject(sub.id, "examDate", e.target.value)}
                            className="w-full text-center rounded text-xs font-semibold outline-none py-1 px-2"
                            style={fieldStyle}
                          />
                        </div>
                      </div>

                      {/* Course Settings: Study Targets */}
                      <div className="grid grid-cols-2 gap-3 pb-3 border-b mb-3" style={{ borderColor: C.line }}>
                        <div>
                          <label className="block text-[9px] uppercase font-bold" style={{ color: C.faint }}>Rec. Hours</label>
                          <input 
                            type="number" 
                            min="0"
                            value={sub.recommendedHours !== undefined ? sub.recommendedHours : 10} 
                            onChange={(e) => handleUpdateMasterSubject(sub.id, "recommendedHours", Math.max(0, +e.target.value))}
                            className="w-full text-center rounded text-xs font-semibold outline-none py-1"
                            style={fieldStyle}
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] uppercase font-bold" style={{ color: C.faint }}>Rec. Minutes</label>
                          <input 
                            type="number" 
                            min="0"
                            max="59"
                            value={sub.recommendedMinutes !== undefined ? sub.recommendedMinutes : 0} 
                            onChange={(e) => handleUpdateMasterSubject(sub.id, "recommendedMinutes", Math.max(0, Math.min(59, +e.target.value)))}
                            className="w-full text-center rounded text-xs font-semibold outline-none py-1"
                            style={fieldStyle}
                          />
                        </div>
                      </div>

                      {/* Manage Checklist topics */}
                      <div className="space-y-2">
                        <span className="text-xs uppercase tracking-wider font-bold" style={{ color: C.faint }}>Syllabus Checklist Template</span>
                        
                        {(sub.tasks || []).length > 0 ? (
                          <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                            {(sub.tasks || []).map((t) => (
                              <div key={t.id} className="flex items-center justify-between text-xs p-1.5 rounded" style={{ background: C.paper }}>
                                <span style={{ color: C.ink }}>{t.text}</span>
                                <button onClick={() => handleRemoveMasterTask(sub.id, t.id)} style={{ color: C.high }}>
                                  <Trash2 size={11} />
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs italic py-1" style={{ color: C.faint }}>No syllabus preparation topics added yet.</p>
                        )}

                        <div className="flex gap-1.5 pt-1">
                          <input 
                            type="text" 
                            placeholder="Add core topic..."
                            value={newTasks[sub.id] || ""}
                            onChange={(e) => setNewTasks((prev) => ({ ...prev, [sub.id]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === "Enter") handleAddMasterTask(sub.id); }}
                            className="flex-grow rounded px-2 py-1 text-xs outline-none"
                            style={fieldStyle}
                          />
                          <button onClick={() => handleAddMasterTask(sub.id)} className="rounded px-2.5 py-1 text-xs font-semibold" style={{ background: C.brand, color: C.paper }}>
                            Add
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tracking Dashboard directory */}
            {staffTab === "tracking" && !selectedStudentId && (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <h2 style={{ fontFamily: "'Fraunces', serif" }} className="text-xl font-semibold">Student Tracking Roster ({currentUser.dept} Department)</h2>
                </div>

                <div className="rounded-xl overflow-x-auto shadow-sm" style={{ background: C.card, border: `1px solid ${C.line}` }}>
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="text-xs uppercase tracking-wider font-semibold" style={{ color: C.faint, background: C.paper, borderBottom: `1px solid ${C.line}` }}>
                        <th className="px-5 py-3">Student Name</th>
                        <th className="px-5 py-3">Roll Number</th>
                        <th className="px-5 py-3 text-center">Avg Backlog Risk</th>
                        <th className="px-5 py-3">Syllabus Progress</th>
                        <th className="px-5 py-3 text-center">Hours Logged</th>
                        <th className="px-5 py-3 text-center">Alerts</th>
                        <th className="px-5 py-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2DBCB] text-sm">
                      {departmentStudentsData.map((stud) => {
                        const band = bandOf(stud.avgRisk);
                        const progressPct = stud.totalTasksCount > 0 ? Math.round((stud.completedTasksCount / stud.totalTasksCount) * 100) : 0;
                        
                        return (
                          <tr key={stud.id} className="hover:bg-[#FCFAF3]">
                            <td className="px-5 py-4 font-semibold" style={{ color: C.ink }}>{stud.name}</td>
                            <td className="px-5 py-4 font-mono text-xs">{stud.roll}</td>
                            <td className="px-5 py-4 text-center">
                              <span className="rounded-full px-2 py-0.5 text-xs font-semibold font-mono" style={{ background: band.color, color: "#fff" }}>
                                {Math.round(stud.avgRisk * 100)}%
                              </span>
                            </td>
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-2">
                                <div className="w-20 bg-[#E2DBCB] h-1.5 rounded-full overflow-hidden">
                                  <div className="h-full" style={{ width: `${progressPct}%`, background: C.brand }} />
                                </div>
                                <span className="text-xs font-semibold" style={{ color: C.brand }}>{progressPct}% ({stud.completedTasksCount}/{stud.totalTasksCount})</span>
                              </div>
                            </td>
                            <td className="px-5 py-4 text-center font-semibold font-mono">{formatTime(stud.totalHoursLogged)}</td>
                            <td className="px-5 py-4 text-center">
                              {stud.lowAttendanceCount > 0 ? (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: C.high }}>
                                  <AlertTriangle size={12} /> {stud.lowAttendanceCount} low att.
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: C.safe }}>
                                  <CheckSquare size={12} /> OK
                                </span>
                              )}
                            </td>
                            <td className="px-5 py-4 text-center">
                              <button
                                onClick={() => setSelectedStudentId(stud.id)}
                                className="inline-flex items-center gap-1 rounded px-3 py-1.5 text-xs font-semibold transition-colors"
                                style={{ background: C.brand, color: C.paper }}
                              >
                                Inspect Performance
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* STUDENT VIEW / DRILL-DOWN INSPECTION VIEW                 */}
        {/* ======================================================== */}
        {(currentUser.role === "student" || selectedStudentId) && (
          <div className="space-y-6">
            {/* Header banner showing inspected profile */}
            {selectedStudentId && (
              <div className="rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between shadow-sm animate-fade-in" style={{ background: "#FEF3C7", border: `1px solid ${C.brass}33` }}>
                <div>
                  <h2 style={{ fontFamily: "'Fraunces', serif" }} className="text-lg font-semibold text-[#B07A1E] flex items-center gap-2">
                    <Users size={20} /> Monitoring Student: {users[selectedStudentId]?.name} ({users[selectedStudentId]?.roll || "N/A"})
                  </h2>
                  <p className="text-xs text-[#B07A1E] mt-1">Reviewing stats and study planner checklists in read-only audit mode.</p>
                </div>
                <button
                  onClick={() => setSelectedStudentId(null)}
                  className="mt-3 md:mt-0 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition-colors border"
                  style={{ background: C.card, borderColor: C.brass, color: C.brass }}
                >
                  <ArrowLeft size={13} /> Back to Directory
                </button>
              </div>
            )}

            {/* Student profile stats (prev CGPA, arrears) */}
            <div className="rounded-xl p-4 flex flex-wrap items-center gap-x-8 gap-y-3" style={{ background: C.card, border: `1px solid ${C.line}` }}>
              <span style={{ fontFamily: "'Fraunces',serif", fontWeight: 600, fontSize: 15 }}>
                {currentUser.role === "student" ? "Your Academic Profile" : `${users[selectedStudentId]?.name}'s Profile`}
              </span>
              <label className="flex items-center gap-2 text-sm">
                <span style={{ color: C.faint }}>Previous CGPA</span>
                <input 
                  type="number" 
                  step="0.1" 
                  value={(studentDb[activeStudentId]?.profile?.prevCGPA) ?? 7.0} 
                  onChange={(e) => handleProfileChange("prevCGPA", clamp(+e.target.value || 0, 0, 10))}
                  readOnly={currentUser.role !== "student"}
                  disabled={currentUser.role !== "student"}
                  className="w-20 rounded-md px-2 py-1 outline-none text-center" 
                  style={{ ...fieldStyle, cursor: currentUser.role === "student" ? "text" : "not-allowed" }} 
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <span style={{ color: C.faint }}>Existing arrears</span>
                <input 
                  type="number" 
                  value={(studentDb[activeStudentId]?.profile?.existingArrears) ?? 0} 
                  onChange={(e) => handleProfileChange("existingArrears", clamp(+e.target.value || 0, 0, 30))}
                  readOnly={currentUser.role !== "student"}
                  disabled={currentUser.role !== "student"}
                  className="w-20 rounded-md px-2 py-1 outline-none text-center" 
                  style={{ ...fieldStyle, cursor: currentUser.role === "student" ? "text" : "not-allowed" }} 
                />
              </label>
            </div>

            {/* Student View Tabs */}
            <div className="flex gap-2 border-b border-[#E2DBCB] pb-2">
              <button
                onClick={() => setActiveTab("predictor")}
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                  activeTab === "predictor"
                    ? "bg-[#13483B] text-[#F5F1E7]"
                    : "text-[#6E665A] hover:bg-[#FCFAF3]"
                }`}
              >
                <Activity size={14} /> Backlog Risk Predictor
              </button>
              <button
                onClick={() => setActiveTab("planner")}
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                  activeTab === "planner"
                    ? "bg-[#13483B] text-[#F5F1E7]"
                    : "text-[#6E665A] hover:bg-[#FCFAF3]"
                }`}
              >
                <CheckSquare size={14} /> Exam Study Planner
              </button>
            </div>

            {/* TAB CONSOLE VIEW (Predictor vs. Planner) */}
            {activeTab === "planner" ? (
              /* ======================================================== */
              /* STUDY PLANNER TAB DISPLAY                                 */
              /* ======================================================== */
              <div className="space-y-6">
                {/* Planner Dashboard Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Metric 1: Preparation Progress */}
                  <div className="rounded-xl p-5" style={{ background: C.card, border: `1px solid ${C.line}` }}>
                    <div className="flex items-center gap-2 mb-2 text-xs uppercase tracking-wider font-semibold" style={{ color: C.faint }}>
                      <CheckSquare size={14} color={C.brand} /> Task Progress
                    </div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 32, fontWeight: 700, color: C.ink }}>
                      {overall.totalTasks > 0 ? `${Math.round((overall.completedTasks / overall.totalTasks) * 100)}%` : "0%"}
                    </div>
                    <div className="w-full bg-[#E2DBCB] h-2 rounded-full mt-3 overflow-hidden">
                      <div 
                        className="h-full transition-all duration-500" 
                        style={{ 
                          width: `${overall.totalTasks > 0 ? (overall.completedTasks / overall.totalTasks) * 100 : 0}%`, 
                          background: C.brand 
                        }} 
                      />
                    </div>
                    <p className="text-xs mt-2" style={{ color: C.faint }}>
                      {overall.completedTasks} of {overall.totalTasks} syllabus topics completed
                    </p>
                  </div>

                  {/* Metric 2: Study Hours logged */}
                  <div className="rounded-xl p-5" style={{ background: C.card, border: `1px solid ${C.line}` }}>
                    <div className="flex items-center gap-2 mb-2 text-xs uppercase tracking-wider font-semibold" style={{ color: C.faint }}>
                      <Clock size={14} color={C.brass} /> Study Tracker
                    </div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 24, fontWeight: 700, color: C.ink }} className="flex items-baseline gap-1">
                      {formatTime(overall.completedHours)} <span className="text-sm font-normal" style={{ color: C.faint }}>/ {formatTime(overall.totalHours)} recommended</span>
                    </div>
                    <div className="w-full bg-[#E2DBCB] h-2 rounded-full mt-3 overflow-hidden">
                      <div 
                        className="h-full transition-all duration-500" 
                        style={{ 
                          width: `${Math.min(100, overall.totalHours > 0 ? (overall.completedHours / overall.totalHours) * 100 : 0)}%`, 
                          background: C.brass 
                        }} 
                      />
                    </div>
                    <p className="text-xs mt-2" style={{ color: C.faint }}>
                      Logged {formatTime(overall.completedHours)} of active preparation
                    </p>
                  </div>

                  {/* Metric 3: Next Exam Countdown */}
                  <div className="rounded-xl p-5 flex flex-col justify-between" style={{ background: C.brand, color: C.paper }}>
                    <div>
                      <div className="flex items-center gap-2 mb-2 text-xs uppercase tracking-wider font-semibold" style={{ opacity: 0.85 }}>
                        <Calendar size={14} /> Next Exam Countdown
                      </div>
                      {overall.nextExam ? (
                        <>
                          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 600, lineHeight: 1.1 }}>
                            {overall.nextExam.name}
                          </div>
                          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 700, marginTop: 4 }}>
                            {overall.nextExam.days === 0 ? "EXAM IS TODAY!" : `${overall.nextExam.days} days remaining`}
                          </div>
                        </>
                      ) : (
                        <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>
                          No upcoming exam dates set. Choose exam dates below.
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Subject Cards (Planner mode) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {results.map((r) => {
                    const band = bandOf(r.risk);
                    const days = getDaysRemaining(r.examDate);
                    const tasks = r.tasks || [];
                    const completedTasks = tasks.filter((t) => t.completed).length;
                    const taskPercent = tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0;
                    
                    let studyAlert = null;
                    if (days !== null) {
                      if (days < 0) {
                        studyAlert = { label: `Exam completed ${Math.abs(days)} days ago`, color: C.faint, bg: "#E2DBCB" };
                      } else if (days === 0) {
                        studyAlert = { label: "Exam is today!", color: C.high, bg: "#FCE8E6" };
                      } else if (days <= 7 && r.risk >= 0.75) {
                        studyAlert = { label: `🚨 CRITICAL RISK: Exam is in ${days} days and backlog risk is extremely high (${Math.round(r.risk * 100)}%)! Complete study tasks now!`, color: C.high, bg: "#FCE8E6" };
                      } else if (days <= 7 && r.risk >= 0.5) {
                        studyAlert = { label: `⚠️ WARNING: Exam is in ${days} days. Backlog risk is elevated (${Math.round(r.risk * 100)}%). Submit assignments & study.`, color: C.risk, bg: "#FFFBEB" };
                      } else if (days <= 3) {
                        studyAlert = { label: `⏰ Countdown: Only ${days} days left until exam. Maintain prep.`, color: C.watch, bg: "#FEF3C7" };
                      } else {
                        studyAlert = { label: `${days} days remaining until final exam`, color: C.safe, bg: "#EBF5ED" };
                      }
                    }

                    return (
                      <div key={r.id} className="rounded-xl overflow-hidden shadow-sm" style={{ background: C.card, border: `1px solid ${C.line}` }}>
                        {/* Header */}
                        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${C.line}`, background: C.paper }}>
                          <div>
                            <h3 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 18, color: C.ink }}>{r.name}</h3>
                            <span className="text-xs" style={{ color: C.faint }}>
                              Mitigated Risk: <b style={{ color: band.color }}>{band.label}</b> ({Math.round(r.risk * 100)}%)
                            </span>
                          </div>
                          <div className="flex items-center gap-1 font-mono text-xs">
                            <Calendar size={13} style={{ color: C.faint }} />
                            <span>{r.examDate ? r.examDate : "No date"}</span>
                          </div>
                        </div>

                        {studyAlert && (
                          <div className="px-4 py-2 text-xs font-semibold flex items-center gap-1.5" style={{ background: studyAlert.bg, color: studyAlert.color, borderBottom: `1px solid ${C.line}` }}>
                            <AlertTriangle size={13} /> {studyAlert.label}
                          </div>
                        )}

                        {/* Study Goal Logger */}
                        <div className="px-4 py-4 space-y-3" style={{ borderBottom: `1px solid ${C.line}` }}>
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                              <span className="text-xs uppercase tracking-wider" style={{ color: C.faint }}>Recommended Study Target</span>
                              <div className="text-sm font-semibold flex items-center gap-1" style={{ color: C.ink }}>
                                <Sparkles size={14} color={C.brass} /> {r.recommendedHours}h {r.recommendedMinutes || 0}m suggested
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs" style={{ color: C.faint }}>Logged Time:</span>
                              <div className="flex items-center gap-1">
                                <input 
                                  type="number" 
                                  min="0" 
                                  value={r.loggedHours || 0} 
                                  onChange={(e) => handleProgressChange(r.id, "loggedHours", Math.max(0, +e.target.value))}
                                  readOnly={currentUser.role !== "student"}
                                  disabled={currentUser.role !== "student"}
                                  className="w-12 rounded px-1.5 py-0.5 text-center text-sm font-semibold"
                                  style={fieldStyle}
                                />
                                <span className="text-xs" style={{ color: C.faint }}>h</span>
                                <input 
                                  type="number" 
                                  min="0" 
                                  max="59"
                                  value={r.loggedMinutes || 0} 
                                  onChange={(e) => handleProgressChange(r.id, "loggedMinutes", Math.max(0, Math.min(59, +e.target.value)))}
                                  readOnly={currentUser.role !== "student"}
                                  disabled={currentUser.role !== "student"}
                                  className="w-12 rounded px-1.5 py-0.5 text-center text-sm font-semibold"
                                  style={fieldStyle}
                                />
                                <span className="text-xs" style={{ color: C.faint }}>m</span>
                              </div>
                            </div>
                          </div>
                          
                          <div>
                            <div className="flex justify-between text-xs" style={{ color: C.faint }}>
                              <span>Time Accomplished</span>
                              <span>{Math.round(Math.min(100, (r.totalRecommendedHours > 0 ? (r.totalLoggedHours / r.totalRecommendedHours) * 100 : 0)))}%</span>
                            </div>
                            <div className="w-full bg-[#E2DBCB] h-2 rounded-full mt-1.5 overflow-hidden">
                              <div 
                                className="h-full transition-all duration-300"
                                style={{ 
                                  width: `${Math.min(100, r.totalRecommendedHours > 0 ? (r.totalLoggedHours / r.totalRecommendedHours) * 100 : 0)}%`, 
                                  background: r.totalLoggedHours >= r.totalRecommendedHours ? C.safe : C.brass 
                                }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Study checklist topics */}
                        <div className="p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs uppercase tracking-wider flex items-center gap-1.5" style={{ color: C.faint }}>
                              <CheckSquare size={13} color={C.brand} /> Topic Preparation Checklist
                            </span>
                            <span className="text-xs font-semibold" style={{ color: C.brand }}>
                              {taskPercent}% Done ({completedTasks}/{tasks.length})
                            </span>
                          </div>

                          {tasks.length > 0 ? (
                            <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                              {tasks.map((task) => (
                                <div key={task.id} className="flex items-center justify-between text-sm">
                                  <label className="flex items-center gap-2.5 cursor-pointer select-none flex-grow">
                                    <input 
                                      type="checkbox" 
                                      checked={task.completed} 
                                      onChange={() => toggleTask(r.id, task.id)}
                                      disabled={currentUser.role !== "student"}
                                      className="rounded border-[#E2DBCB] text-[#13483B] focus:ring-[#13483B] h-4 w-4"
                                    />
                                    <span style={{ 
                                      textDecoration: task.completed ? "line-through" : "none",
                                      color: task.completed ? C.faint : C.ink
                                    }}>
                                      {task.text}
                                    </span>
                                  </label>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs italic" style={{ color: C.faint }}>No study topics logged. Ask staff to define syllabus topics.</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* ======================================================== */
              /* RISK PREDICTOR TAB DISPLAY                                */
              /* ======================================================== */
              <div className="space-y-5 animate-fade-in">
                {/* Overall summary card & chart */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="rounded-xl p-5 md:col-span-1" style={{ background: C.brand, color: C.paper }}>
                    <div className="flex items-center gap-2" style={{ opacity: 0.8, fontSize: 12 }}><Activity size={14} /> OVERALL RISK</div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 48, fontWeight: 700, lineHeight: 1.1, marginTop: 6 }}>
                      {Math.round(overall.avg * 100)}%
                    </div>
                    <div className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 mt-2" style={{ background: "rgba(255,255,255,.15)", fontSize: 12 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 99, background: overallBand.color, display: "inline-block" }} />
                      {overallBand.label}
                    </div>
                    <p style={{ fontSize: 12, opacity: 0.85, marginTop: 12 }}>
                      {overall.atRisk > 0 ? `${overall.atRisk} of ${results.length} subjects need attention.` : "No subjects currently flagged. Keep it steady."}
                    </p>
                  </div>

                  <div className="rounded-xl p-4 md:col-span-2" style={{ background: C.card, border: `1px solid ${C.line}` }}>
                    <div className="flex items-center gap-2 mb-1" style={{ fontSize: 12, color: C.faint }}><TrendingUp size={14} /> RISK BY SUBJECT</div>
                    <ResponsiveContainer width="100%" height={150}>
                      <BarChart data={chartData} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.faint }} axisLine={{ stroke: C.line }} tickLine={false} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: C.faint }} axisLine={false} tickLine={false} />
                        <Tooltip cursor={{ fill: "rgba(0,0,0,.04)" }} contentStyle={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 12 }} formatter={(v) => [`${v}%`, "risk"]} />
                        <Bar dataKey="risk" radius={[5, 5, 0, 0]}>
                          {chartData.map((d, i) => <Cell key={i} fill={d.color} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Subject Cards (Risk Predictor mode) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {results.map((r) => {
                    const band = bandOf(r.risk);
                    const days = getDaysRemaining(r.examDate);
                    let studyAlert = null;
                    if (days !== null) {
                      if (days < 0) {
                        studyAlert = { label: `Exam completed ${Math.abs(days)} days ago`, color: C.faint, bg: "#E2DBCB" };
                      } else if (days === 0) {
                        studyAlert = { label: "Exam is today!", color: C.high, bg: "#FCE8E6" };
                      } else if (days <= 7 && r.risk >= 0.75) {
                        studyAlert = { label: `🚨 CRITICAL RISK: Exam is in ${days} days and backlog risk is extremely high (${Math.round(r.risk * 100)}%)! Complete study tasks now!`, color: C.high, bg: "#FCE8E6" };
                      } else if (days <= 7 && r.risk >= 0.5) {
                        studyAlert = { label: `⚠️ WARNING: Exam is in ${days} days. Backlog risk is elevated (${Math.round(r.risk * 100)}%). Submit assignments & study.`, color: C.risk, bg: "#FFFBEB" };
                      } else if (days <= 3) {
                        studyAlert = { label: `⏰ Countdown: Only ${days} days left until exam. Maintain prep.`, color: C.watch, bg: "#FEF3C7" };
                      } else {
                        studyAlert = { label: `${days} days remaining until final exam`, color: C.safe, bg: "#EBF5ED" };
                      }
                    }
                    return (
                      <div key={r.id} className="rounded-xl overflow-hidden" style={{ background: C.card, border: `1px solid ${C.line}` }}>
                        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${C.line}` }}>
                          <span style={{ fontFamily: "'Fraunces',serif", fontWeight: 600, fontSize: 17, color: C.ink }}>
                            {r.name}
                          </span>
                          
                          <div className="flex items-center gap-2">
                            {r.prepFloorActive ? (
                              r.taskRatio === 0 ? (
                                <span 
                                  className="text-xs px-2 py-0.5 rounded font-semibold flex items-center gap-0.5 animate-pulse" 
                                  style={{ background: "#FCE8E6", color: C.high }}
                                  title="Risk raised because no listed preparation topics are completed"
                                >
                                  <AlertTriangle size={10} /> unstarted prep
                                </span>
                              ) : (
                                <span 
                                  className="text-xs px-2 py-0.5 rounded font-semibold flex items-center gap-0.5" 
                                  style={{ background: "#FEF3C7", color: C.brass }}
                                  title={`Risk floored at ${Math.round(r.prepFloor * 100)}% because preparation is incomplete`}
                                >
                                  <AlertTriangle size={10} /> incomplete prep ({Math.round(r.taskRatio * 100)}%)
                                </span>
                              )
                            ) : r.mitigation > 0 ? (
                                <span 
                                  className="text-xs px-2 py-0.5 rounded font-semibold flex items-center gap-0.5 animate-pulse" 
                                  style={{ background: "#EBF5ED", color: C.safe }}
                                  title={`Base risk of ${Math.round(r.baseRisk * 100)}% reduced by study prep`}
                                >
                                  <Sparkles size={10} /> -{Math.round(r.mitigation * 100)}% prep
                                </span>
                            ) : null}
                            <span className="rounded-full px-2.5 py-1" style={{ background: band.color, color: "#fff", fontSize: 12, fontFamily: "'JetBrains Mono',monospace", fontWeight: 700 }}>
                              {Math.round(r.risk * 100)}%
                            </span>
                          </div>
                        </div>

                        {studyAlert && (
                          <div className="px-4 py-2 text-xs font-semibold flex items-center gap-1.5" style={{ background: studyAlert.bg, color: studyAlert.color, borderBottom: `1px solid ${C.line}` }}>
                            <AlertTriangle size={13} /> {studyAlert.label}
                          </div>
                        )}

                        <div className="px-4 py-3 space-y-3">
                          {/* Attendance slider */}
                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span style={{ color: C.faint }}>Attendance</span>
                              <span style={{ fontFamily: "'JetBrains Mono',monospace", color: r.attendance < reg.minAttendance ? C.high : C.ink }}>{r.attendance}%</span>
                            </div>
                            <input 
                              type="range" 
                              min="0" 
                              max="100" 
                              value={r.attendance} 
                              onChange={(e) => handleProgressChange(r.id, "attendance", +e.target.value)} 
                              disabled={currentUser.role !== "student"}
                              className={`w-full ${currentUser.role !== "student" ? "opacity-60 cursor-not-allowed" : ""}`} 
                            />
                          </div>
                          
                          {/* Assignment slider */}
                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span style={{ color: C.faint }}>Assignments done</span>
                              <span style={{ fontFamily: "'JetBrains Mono',monospace" }}>{r.assignmentPct}%</span>
                            </div>
                            <input 
                              type="range" 
                              min="0" 
                              max="100" 
                              value={r.assignmentPct} 
                              onChange={(e) => handleProgressChange(r.id, "assignmentPct", +e.target.value)} 
                              disabled={currentUser.role !== "student"}
                              className={`w-full ${currentUser.role !== "student" ? "opacity-60 cursor-not-allowed" : ""}`} 
                            />
                          </div>
                          
                          {/* Internal marks */}
                          <div className="flex items-center justify-between text-sm">
                            <span style={{ color: C.faint }}>Internal marks</span>
                            <div className="flex items-center gap-1">
                              <input 
                                type="number" 
                                value={r.internalScored} 
                                onChange={(e) => handleProgressChange(r.id, "internalScored", clamp(+e.target.value || 0, 0, r.internalMax))}
                                readOnly={currentUser.role !== "student"}
                                disabled={currentUser.role !== "student"}
                                className="w-14 rounded-md px-2 py-1 text-center font-mono font-semibold" 
                                style={fieldStyle} 
                              />
                              <span style={{ color: C.faint }}>/</span>
                              <input 
                                type="number" 
                                value={r.internalMax} 
                                readOnly 
                                disabled
                                className="w-14 rounded-md px-2 py-1 text-center opacity-70 font-mono font-semibold" 
                                style={fieldStyle} 
                              />
                            </div>
                          </div>

                          {/* Why — explainability */}
                          <div className="pt-1">
                            <div className="flex items-center gap-1.5 mb-1.5" style={{ fontSize: 11, color: C.faint, textTransform: "uppercase", letterSpacing: ".04em" }}>
                              <Info size={12} /> Why this score
                            </div>
                            <div className="space-y-2">
                              {r.reasons.length ? (
                                <div className="flex flex-wrap gap-1.5">
                                  {r.reasons.map((re) => (
                                    <span key={re.key} className="rounded-md px-2 py-1" style={{ fontSize: 11, background: C.paper, border: `1px solid ${C.line}`, color: C.ink }}>
                                      {re.label}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="inline-flex items-center gap-1.5" style={{ fontSize: 12, color: C.safe }}>
                                  <CheckCircle2 size={13} /> No major risk drivers
                                </span>
                              )}
                              
                              {r.prepFloorActive ? (
                                r.taskRatio === 0 ? (
                                  <div className="rounded-md px-2 py-1 flex items-start gap-1.5 text-xs" style={{ background: "#FCE8E6", color: C.high, border: `1px solid ${C.high}22` }}>
                                    <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" /> 
                                    <span><b>Zero preparation topics completed.</b> Risk has been raised to <b>High Risk (75%)</b>. Check off at least one study task in the Exam Planner to remove this warning.</span>
                                  </div>
                                ) : (
                                  <div className="rounded-md px-2 py-1 flex items-start gap-1.5 text-xs" style={{ background: "#FEF3C7", color: C.brass, border: `1px solid ${C.brass}22` }}>
                                    <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" style={{ color: C.brass }} /> 
                                    <span><b>Preparation incomplete ({Math.round(r.taskRatio * 100)}%).</b> Risk is constrained to a minimum of <b>{Math.round(r.prepFloor * 100)}%</b> until more study topics are completed.</span>
                                  </div>
                                )
                              ) : r.mitigation > 0 ? (
                                <div className="rounded-md px-2 py-1 flex items-center gap-1.5 text-xs" style={{ background: "#EBF5ED", color: C.safe, border: `1px solid ${C.safe}22` }}>
                                  <Sparkles size={12} /> 
                                  <span>Study preparation has reduced your risk from {Math.round(r.baseRisk * 100)}% to {Math.round(r.risk * 100)}%!</span>
                                </div>
                              ) : null}
                            </div>
                          </div>

                          {/* Marks needed + recommendation */}
                          <div className="rounded-lg p-3" style={{ background: C.paper, border: `1px dashed ${C.line}` }}>
                            <div className="flex items-center gap-1.5 mb-1" style={{ fontSize: 12, fontWeight: 600 }}>
                              <Calculator size={13} color={C.brass} /> To pass this subject
                            </div>
                            <p style={{ fontSize: 13, color: C.ink }}>
                              {r.impossible
                                ? "Internals are too low to pass on the final alone — focus on improving internals."
                                : r.alreadySafe
                                ? "Already past the pass mark on internals — just appear for the final."
                                : <>Need <b style={{ fontFamily: "'JetBrains Mono',monospace", color: C.brand }}>≥ {Math.min(100, r.neededExternalPct).toFixed(0)}%</b> in the final external exam.</>}
                            </p>
                            <p style={{ fontSize: 12.5, color: C.faint, marginTop: 6 }}>{r.rec}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Disclaimer */}
        <div className="rounded-xl p-4 mt-6 flex items-start gap-3 shadow-sm" style={{ background: C.card, border: `1px solid ${C.line}` }}>
          <ShieldCheck size={18} color={C.brand} style={{ flexShrink: 0, marginTop: 2 }} />
          <p style={{ fontSize: 12.5, color: C.faint }}>
            This is a <b style={{ color: C.ink }}>guidance tool, not a verdict</b>. The risk score and study target hours are transparent estimates — they indicate where early action can prevent a backlog. All data is saved locally on this device.
          </p>
        </div>
      </div>
    </div>
  );
}

// Simple clock-countdown date helper
function getDaysRemaining(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exam = new Date(dateStr);
  exam.setHours(0, 0, 0, 0);
  const diffTime = exam - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}
