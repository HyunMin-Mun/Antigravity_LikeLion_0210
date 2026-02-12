import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  setDoc,
  getDoc,
  writeBatch,
  getDocs
} from 'firebase/firestore';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import { db, auth } from './lib/firebase';
import { generateStrategyResponse, processLearningInput } from './lib/gemini';
import {
  trackLogin,
  trackTaskFormOpen,
  trackTaskFormSubmit,
  trackTaskFormAbandon,
  trackTaskFieldTouch,
  trackChatMessageSent,
  trackPageView
} from './lib/analytics';
import {
  Layout,
  CheckSquare,
  Inbox,
  BarChart2,
  Plus,
  MessageSquare,
  ChevronRight,
  Search,
  Filter,
  Clock,
  X,
  Zap,
  TrendingUp,
  List,
  LogOut,
  ChevronDown,
  Calendar,
  MoreVertical,
  AlertCircle,
  BookOpen,
  Trash2
} from 'lucide-react';

// --- Constants & Types ---
const ROLES = { MEMBER: 'member', MANAGER: 'manager' } as const;
const STATUS = { TODO: '준비', IN_PROGRESS: '진행', DONE: '완료' } as const;
const APPROVAL = { NONE: 'none', PENDING: 'pending', APPROVED: 'approved', REJECTED: 'rejected' } as const;
const TYPES = ['기획', '개발', '디자인', '운영', '회의', '리서치', '문서'] as const;
const LEVELS = { LOW: 'low', MED: 'med', HIGH: 'high' } as const;

type Role = typeof ROLES[keyof typeof ROLES];
type Status = typeof STATUS[keyof typeof STATUS];
type ApprovalStatus = typeof APPROVAL[keyof typeof APPROVAL];
type Level = typeof LEVELS[keyof typeof LEVELS];
type WorkType = typeof TYPES[number];

interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  today_status: string;
  scheduled_status?: string;
  password?: string;
}

interface WorkItem {
  id: string;
  project_name: string;
  title: string;
  description: string;
  type: WorkType;
  assignees: string[];
  requester: string;
  start_date: string;
  due_date: string;
  status: Status;
  impact: Level;
  urgency: Level;
  priority_score: number;
  approval_status: ApprovalStatus;
  updated_at: string;
  last_update_note: string;
}

interface Proposal {
  id: string;
  suggestion_text: string;
  explanation: string;
  created_at: string;
  created_by: string;
  approval_status: ApprovalStatus;
}

interface Weights {
  impact: number;
  urgency: number;
  deadline: number;
}

// --- Initial Mock Data ---
const INITIAL_USERS: User[] = [
  { id: 'u1', name: '김철수', email: 'manager1@demo.ai', role: 'manager', today_status: '근무', scheduled_status: '오후 전략 회의 주관', password: 'demo1234' },
  { id: 'u2', name: '이영희', email: 'member1@demo.ai', role: 'member', today_status: '재택', scheduled_status: '오후 2시 반차 예정', password: 'demo1234' },
  { id: 'u3', name: '박지민', email: 'jimin@demo.com', role: 'member', today_status: '회의', scheduled_status: '고객사 외근(신사동)', password: 'demo1234' },
  { id: 'u4', name: '최동현', email: 'dong@demo.com', role: 'member', today_status: '외근', scheduled_status: '현지 퇴근 예정', password: 'demo1234' },
];

const generateWorkItems = (): WorkItem[] => {
  const tasks = [
    { title: "인프라 보안 프로토콜 설계", project: "NextGen AI Platform", type: "개발", status: STATUS.IN_PROGRESS, impact: LEVELS.HIGH, urgency: LEVELS.HIGH },
    { title: "글로벌 디자인 가이드라인 수립", project: "Global UX Renewal", type: "디자인", status: STATUS.TODO, impact: LEVELS.MED, urgency: LEVELS.MED },
    { title: "핵심 API 엔드포인트 최적화", project: "NextGen AI Platform", type: "개발", status: STATUS.IN_PROGRESS, impact: LEVELS.HIGH, urgency: LEVELS.MED },
    { title: "ERP 데이터베이스 마이그레이션", project: "Internal ERP System", type: "운영", status: STATUS.TODO, impact: LEVELS.HIGH, urgency: LEVELS.HIGH },
    { title: "사용자 경험 피드백 분석 보고서", project: "Global UX Renewal", type: "리서치", status: STATUS.DONE, impact: LEVELS.LOW, urgency: LEVELS.LOW },
    { title: "신규 서비스 기획안 초안 작성", project: "NextGen AI Platform", type: "기획", status: STATUS.TODO, impact: LEVELS.MED, urgency: LEVELS.MED },
    { title: "프론트엔드 성능 프로파일링", project: "NextGen AI Platform", type: "개발", status: STATUS.IN_PROGRESS, impact: LEVELS.HIGH, urgency: LEVELS.HIGH },
    { title: "시스템 배포 자동화 스크립트 작성", project: "Internal ERP System", type: "운영", status: STATUS.TODO, impact: LEVELS.MED, urgency: LEVELS.LOW },
  ];

  return tasks.map((t, i): WorkItem => ({
    id: `w${i + 1}`,
    project_name: t.project,
    title: t.title,
    description: `${t.project} 프로젝트의 성공적인 목표 달성을 위해 담당자로서 수행하는 핵심 태스크입니다.`,
    assignees: [INITIAL_USERS[i % INITIAL_USERS.length].id],
    requester: INITIAL_USERS[0].id,
    start_date: new Date().toISOString().split('T')[0],
    due_date: new Date(Date.now() + ((i + 2) * 86400000)).toISOString().split('T')[0],
    status: t.status as Status,
    updated_at: new Date().toISOString(),
    last_update_note: "최초 할당됨",
    type: t.type as WorkType,
    impact: t.impact as Level,
    urgency: t.urgency as Level,
    priority_score: 0,
    approval_status: APPROVAL.NONE,
  }));
};

// --- Utils ---
const getPriorityScore = (impact: Level, urgency: Level, dueDate: string, weights: Weights = { impact: 3, urgency: 2, deadline: 5 }): number => {
  const levelMap = { low: 1, med: 2, high: 3 };
  const iScore = levelMap[impact] || 1;
  const uScore = levelMap[urgency] || 1;
  const now = new Date();
  const due = new Date(dueDate);
  const diffDays = Math.max(1, Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  const dScore = Math.max(1, 10 / diffDays);
  return (iScore * weights.impact) + (uScore * weights.urgency) + (dScore * weights.deadline);
};

const formatDate = (dateStr: string): string => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
};

// --- Components ---
interface ButtonProps {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline' | 'indigo';
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
}

const Button: React.FC<ButtonProps> = ({ children, onClick, variant = 'primary', className = '', disabled = false, type = 'button' }) => {
  const variants = {
    primary: "bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-100",
    secondary: "bg-gray-100 text-gray-700 hover:bg-gray-200",
    danger: "bg-red-50 text-red-600 hover:bg-red-100",
    ghost: "bg-transparent text-gray-500 hover:bg-gray-50",
    outline: "border border-gray-200 text-gray-600 hover:bg-gray-50",
    indigo: "bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-100"
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`px-4 py-2 rounded-xl font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50 ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
};

interface BadgeProps {
  children: React.ReactNode;
  color?: 'gray' | 'indigo' | 'green' | 'red' | 'yellow' | 'purple';
}

const Badge: React.FC<BadgeProps> = ({ children, color = 'gray' }) => {
  const colors = {
    gray: "bg-gray-100 text-gray-600",
    indigo: "bg-indigo-100 text-indigo-700",
    green: "bg-green-100 text-green-700 border border-green-200",
    red: "bg-red-100 text-red-700",
    yellow: "bg-yellow-100 text-yellow-700",
    purple: "bg-purple-100 text-purple-700"
  };
  return <span className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider ${colors[color]}`}>{children}</span>;
};

// --- Main App Component ---
export default function App() {
  const [users, setUsers] = useState<User[]>([]);
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [view, setView] = useState<string>('login');
  const [boardViewMode, setBoardViewMode] = useState<'kanban' | 'list'>('kanban');
  const [selectedWorkId, setSelectedWorkId] = useState<string | null>(null);
  const [isChatOpen, setIsChatOpen] = useState<boolean>(false);
  const [managerWeights] = useState<Weights>({ impact: 3, urgency: 2, deadline: 5 });
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const [editingUserStatus, setEditingUserStatus] = useState<User | null>(null);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'ai'; text: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  // AI 학습 채팅방 (매니저 전용)
  const [isLearningOpen, setIsLearningOpen] = useState(false);
  const [learningInput, setLearningInput] = useState('');
  const [isLearningLoading, setIsLearningLoading] = useState(false);
  const [aiDirectives, setAiDirectives] = useState<{ id: string; text: string; createdAt: string; summary: string }[]>([]);
  // --- Firebase 실시간 인증 및 내비게이션 통합 리스너 컨텍스트 ---
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setLoadingMessage("데이터베이스 연결 중...");
        try {
          const userDocRef = doc(db, 'users', user.uid);
          let docSnap = await getDoc(userDocRef);

          // Race condition 대응: 회원가입 직후 Firestore 문서가 아직 생성되지 않았을 수 있음
          if (!docSnap.exists()) {
            console.log("Firestore 문서 대기 중... (1초 후 재시도)");
            await new Promise(resolve => setTimeout(resolve, 1500));
            docSnap = await getDoc(userDocRef);
          }

          if (docSnap.exists()) {
            const userData = docSnap.data() as Omit<User, 'id'>;
            const fullUser: User = { id: user.uid, ...userData };
            setCurrentUser(fullUser);

            // GA4 로그인 추적
            trackLogin(user.uid, fullUser.role, fullUser.name);

            // 로그인 상태에서만 최초 1회 강제 뷰 전환 (현재 뷰가 로그인/회원가입일 때만)
            setView(prev => {
              const nextView = (prev === 'login' || prev === 'signup')
                ? (fullUser.role === 'manager' ? 'board' : 'my')
                : prev;
              trackPageView(nextView);
              return nextView;
            });
          } else {
            // 문서가 여전히 없으면 기본 정보로 자동 생성
            console.warn("Firestore 문서 자동 생성 시도...");
            const fallbackData = {
              name: user.email?.split('@')[0] || '사용자',
              email: user.email || '',
              role: 'member' as Role,
              today_status: '근무',
              updated_at: new Date().toISOString()
            };
            await setDoc(userDocRef, fallbackData);
            const fullUser: User = { id: user.uid, ...fallbackData };
            setCurrentUser(fullUser);
            setView(prev => (prev === 'login' || prev === 'signup') ? 'my' : prev);
          }
        } catch (error) {
          console.error("인증 처리 중 오류:", error);
        } finally {
          setLoadingMessage(null);
        }
      } else {
        setCurrentUser(null);
        setView('login');
      }
    });

    return () => unsubscribeAuth();
  }, []);

  // --- 데이터 초기 시딩 (Seed) ---
  const seedFirestore = async () => {
    try {
      // 1. 업무 데이터 시딩
      const qWork = query(collection(db, 'workItems'));
      const snapWork = await getDocs(qWork);

      // 2. 사용자 데이터 시딩 (본인 외에 팀원들이 보이도록)
      const qUsers = query(collection(db, 'users'));
      const snapUsers = await getDocs(qUsers);

      const batch = writeBatch(db);
      let needsCommit = false;

      if (snapWork.empty) {
        setLoadingMessage("최초 업무 데이터를 생성 중입니다...");
        const mockItems = generateWorkItems();
        mockItems.forEach(item => {
          const newDocRef = doc(collection(db, 'workItems'));
          const { id, ...itemData } = item;
          batch.set(newDocRef, itemData);
        });
        needsCommit = true;
      }

      if (snapUsers.size < INITIAL_USERS.length) { // 팀원 데이터가 부족한 경우 (신규 멤버 추가 포함)
        setLoadingMessage("팀원 데이터를 생성 중입니다...");
        INITIAL_USERS.forEach(u => {
          // 이미 존재하는 이메일이나 ID는 스킵하거나 덮어쓰기
          const userRef = doc(db, 'users', u.id);
          const { password, ...userData } = u;
          batch.set(userRef, userData);
        });
        needsCommit = true;
      }

      if (needsCommit) {
        await batch.commit();
        setLoadingMessage(null);
        alert("데모용 업무 및 팀원 데이터가 성공적으로 생성되었습니다.");
      }
    } catch (error) {
      console.error("데이터 시딩 중 오류:", error);
    }
  };

  useEffect(() => {
    if (currentUser?.role === 'manager') {
      seedFirestore();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  // --- 데이터 실시간 동기화 (업무, 유저, 제안) ---
  useEffect(() => {
    if (!currentUser) return;

    const qWorkItems = query(collection(db, 'workItems'));
    const unsubscribeWork = onSnapshot(qWorkItems, (snapshot) => {
      const items = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        priority_score: getPriorityScore(doc.data().impact || 'low', doc.data().urgency || 'low', doc.data().due_date || new Date().toISOString(), managerWeights)
      } as WorkItem));
      setWorkItems(items);
    });

    const unsubscribeUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const uList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
      setUsers(uList);
    });

    const unsubscribeProposals = onSnapshot(collection(db, 'proposals'), (snapshot) => {
      const pList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Proposal));
      setProposals(pList);
    });

    // AI 학습 방향성 실시간 구독
    const qDirectives = query(collection(db, 'ai_directives'), orderBy('createdAt', 'desc'));
    const unsubscribeDirectives = onSnapshot(qDirectives, (snapshot) => {
      const dList = snapshot.docs.map(d => ({
        id: d.id,
        text: d.data().text || '',
        summary: d.data().summary || '',
        createdAt: d.data().createdAt || '',
      }));
      setAiDirectives(dList);
    });

    return () => {
      unsubscribeWork();
      unsubscribeUsers();
      unsubscribeProposals();
      unsubscribeDirectives();
    };
  }, [managerWeights, currentUser?.id]);

  // 가중치 변경 시 우선순위 점수 재계산
  useEffect(() => {
    setWorkItems(prev => prev.map(item => ({
      ...item,
      priority_score: getPriorityScore(item.impact, item.urgency, item.due_date, managerWeights)
    })));
  }, [managerWeights]);

  // --- Firebase 핸들러 (뷰 전환 로직 제거, 리스너가 처리) ---
  const handleSignup = async (name: string, email: string, password?: string, role: Role = 'member') => {
    try {
      if (!password) return;
      setLoadingMessage("계정 생성 중...");
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      await setDoc(doc(db, 'users', user.uid), {
        name, email, role,
        today_status: '근무',
        updated_at: new Date().toISOString()
      });
      // setView는 onAuthStateChanged 리스너가 처리함
    } catch (error: any) {
      if (error.code === 'auth/email-already-in-use') {
        await handleLogin(email, password);
      } else {
        alert("회원가입 실패: " + error.message);
      }
    } finally {
      setLoadingMessage(null);
    }
  };

  const handleLogin = async (email: string, password?: string) => {
    try {
      if (!password) return;
      setLoadingMessage("로그인 중...");
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      alert("로그인 실패: " + error.message);
    } finally {
      setLoadingMessage(null);
    }
  };

  const handleDemoLogin = async (email: string, role: Role) => {
    setLoadingMessage("데모 모드로 접속 중입니다...");
    const demoName = role === 'manager' ? '데모 매니저' : '데모 멤버';
    try {
      // 1단계: 먼저 로그인 시도
      let userCredential;
      try {
        userCredential = await signInWithEmailAndPassword(auth, email, 'demo1234');
      } catch (signInError: any) {
        // 2단계: 로그인 실패 시 계정 생성 시도
        try {
          userCredential = await createUserWithEmailAndPassword(auth, email, 'demo1234');
        } catch (signUpError: any) {
          if (signUpError.code === 'auth/email-already-in-use') {
            // 계정은 존재하지만 로그인 실패 — 비밀번호가 다를 수 있음
            alert("데모 계정의 비밀번호가 변경되었을 수 있습니다. 수동으로 로그인해주세요.");
            return;
          }
          throw signUpError;
        }
      }

      // 3단계: Firestore 사용자 문서가 없으면 생성 (핵심 수정)
      if (userCredential?.user) {
        const userDocRef = doc(db, 'users', userCredential.user.uid);
        const docSnap = await getDoc(userDocRef);
        if (!docSnap.exists()) {
          await setDoc(userDocRef, {
            name: demoName,
            email,
            role,
            today_status: '근무',
            updated_at: new Date().toISOString()
          });
        }
      }
    } catch (error: any) {
      console.error("데모 로그인 오류:", error);
      alert("데모 접속 중 오류가 발생했습니다: " + (error.code || error.message));
    } finally {
      setLoadingMessage(null);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  const addWorkItem = async (data: Partial<WorkItem>) => {
    try {
      await addDoc(collection(db, 'workItems'), {
        project_name: data.project_name || '미지정 프로젝트',
        title: data.title || '제목 없는 업무',
        description: data.description || '',
        type: data.type || '개발',
        assignees: data.assignees || [currentUser?.id || ''],
        requester: currentUser?.id || '',
        start_date: new Date().toISOString().split('T')[0],
        due_date: data.due_date || new Date().toISOString().split('T')[0],
        status: data.status || STATUS.TODO,
        impact: data.impact || LEVELS.MED,
        urgency: data.urgency || LEVELS.MED,
        approval_status: APPROVAL.NONE,
        updated_at: new Date().toISOString(),
        last_update_note: '신규 업무 생성됨'
      });
    } catch (error: any) {
      console.error("업무 추가 실패:", error);
    }
  };

  const updateWorkItem = async (id: string, data: Partial<WorkItem>) => {
    try {
      const docRef = doc(db, 'workItems', id);
      await updateDoc(docRef, {
        ...data,
        updated_at: new Date().toISOString()
      });
    } catch (error: any) {
      console.error("업무 수정 실패:", error);
    }
  };

  // --- UI Components ---

  const AuthView = () => {
    const [isSignup, setIsSignup] = useState(false);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState<Role>('member');

    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center space-y-4">
            <div className="inline-block bg-indigo-600 p-4 rounded-3xl shadow-2xl shadow-indigo-200 mb-4 transition-transform hover:scale-110">
              <CheckSquare className="text-white w-12 h-12" />
            </div>
            <h1 className="text-5xl font-black text-gray-900 tracking-tight">WorkFlow</h1>
            <p className="text-gray-400 font-bold uppercase tracking-[0.3em] text-[10px]">전략적 가시성 플랫폼</p>
          </div>

          <div className="bg-gray-50 p-10 rounded-[3rem] border border-gray-100 shadow-sm transition-all hover:shadow-xl">
            <form className="space-y-6" onSubmit={(e) => {
              e.preventDefault();
              if (isSignup) handleSignup(name, email, password, role);
              else handleLogin(email, password);
            }}>
              <div className="space-y-4">
                {isSignup && (
                  <>
                    <input required placeholder="이름" className="w-full px-6 py-5 bg-white border border-gray-100 rounded-2xl focus:ring-2 focus:ring-indigo-500 font-bold outline-none shadow-sm transition-all"
                      value={name} onChange={e => setName(e.target.value)} />
                    <div className="flex gap-3">
                      <button type="button" onClick={() => setRole('member')} className={`flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${role === 'member' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-gray-400 border border-gray-100'}`}>일반 멤버</button>
                      <button type="button" onClick={() => setRole('manager')} className={`flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${role === 'manager' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-gray-400 border border-gray-100'}`}>관리자</button>
                    </div>
                  </>
                )}
                <input required type="email" placeholder="이메일" className="w-full px-6 py-5 bg-white border border-gray-100 rounded-2xl focus:ring-2 focus:ring-indigo-500 font-bold outline-none shadow-sm transition-all"
                  value={email} onChange={e => setEmail(e.target.value)} />
                <input required type="password" placeholder="비밀번호" className="w-full px-6 py-5 bg-white border border-gray-100 rounded-2xl focus:ring-2 focus:ring-indigo-500 font-bold outline-none shadow-sm transition-all"
                  value={password} onChange={e => setPassword(e.target.value)} />
              </div>
              <Button type="submit" className="w-full py-5 rounded-2xl text-xl shadow-indigo-100">{isSignup ? '계정 생성하기' : '로그인'}</Button>
            </form>

            <div className="mt-8 text-center">
              <button onClick={() => {
                const nextSignup = !isSignup;
                setIsSignup(nextSignup);
                trackPageView(nextSignup ? 'signup' : 'login');
              }} className="text-indigo-600 font-black text-sm hover:underline">
                {isSignup ? '이미 계정이 있나요? 로그인' : '처음이신가요? 회원가입'}
              </button>
            </div>

            <div className="mt-10 pt-8 border-t border-gray-200">
              <p className="text-[10px] text-gray-400 mb-4 font-black uppercase tracking-widest text-center">데모 계정 빠른 접속</p>
              <div className="flex gap-3 justify-center">
                <button type="button" onClick={() => handleDemoLogin('member@demo.ai', 'member')} className="px-4 py-2 bg-white border border-gray-100 rounded-xl text-xs font-black text-indigo-600 hover:bg-indigo-50 transition-all uppercase tracking-tighter shadow-sm">멤버 모드</button>
                <button type="button" onClick={() => handleDemoLogin('manager@demo.ai', 'manager')} className="px-4 py-2 bg-white border border-gray-100 rounded-xl text-xs font-black text-indigo-600 hover:bg-indigo-50 transition-all uppercase tracking-tighter shadow-sm">매니저 모드</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const Sidebar = () => (
    <aside className="w-60 bg-white border-r border-gray-50 h-screen flex flex-col sticky top-0 overflow-hidden">
      <div className="p-5 flex items-center gap-3">
        <div className="bg-indigo-600 p-2 rounded-xl shadow-lg shadow-indigo-100">
          <CheckSquare className="text-white w-5 h-5" />
        </div>
        <span className="text-xl font-black tracking-tighter text-gray-900">WorkFlow</span>
      </div>
      <nav className="flex-1 px-4 space-y-1 mt-2">
        <SidebarItem icon={<BarChart2 size={18} />} label="내 대시보드" active={view === 'my'} onClick={() => { setView('my'); trackPageView('my'); }} />
        <SidebarItem icon={<Layout size={18} />} label="팀 업무 보드" active={view === 'board'} onClick={() => { setView('board'); trackPageView('board'); }} />
        <SidebarItem icon={<TrendingUp size={18} />} label="전략 우선순위 엔진" active={view === 'priority'} onClick={() => { setView('priority'); trackPageView('priority'); }} />
        <SidebarItem icon={<Inbox size={18} />} label="승인 인박스" active={view === 'inbox'} onClick={() => { setView('inbox'); trackPageView('inbox'); }} count={proposals.filter(p => p.approval_status === 'pending').length} />
      </nav>
      <div className="p-4 pb-6 mt-auto">
        <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 relative group transition-all hover:bg-white hover:shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-lg shadow-lg shadow-indigo-100 group-hover:scale-105 transition-transform">
              {currentUser?.name?.charAt(0)}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-bold text-gray-900 truncate">{currentUser?.name}</p>
              <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">{currentUser?.role}</p>
            </div>
            <button onClick={handleLogout} className="text-gray-300 hover:text-red-500 transition-colors p-2 hover:bg-white rounded-lg"><LogOut size={16} /></button>
          </div>
        </div>
      </div>
    </aside>
  );

  const SidebarItem = ({ icon, label, active, onClick, count }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void, count?: number }) => (
    <button onClick={onClick} className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all relative group ${active ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-gray-400 hover:bg-indigo-50 hover:text-indigo-600'}`}>
      {icon}
      <span className="flex-1 text-left">{label}</span>
      {count !== undefined && count > 0 && <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${active ? 'bg-white text-indigo-600' : 'bg-red-500 text-white animate-pulse shadow-sm shadow-red-200'}`}>{count}</span>}
    </button>
  );

  const Header = ({ title }: { title: string }) => (
    <header className="h-14 bg-white/90 backdrop-blur-xl flex items-center justify-between px-6 sticky top-0 z-20 border-b border-gray-50 shadow-sm">
      <div>
        <h1 className="text-lg font-bold text-gray-900 tracking-tight">{title}</h1>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-indigo-500 transition-colors" size={16} />
          <input className="pl-9 pr-4 py-2 bg-gray-50 border-transparent border focus:border-indigo-100 rounded-lg text-sm font-medium w-56 focus:ring-2 focus:ring-indigo-500/10 shadow-inner transition-all outline-none" placeholder="업무, 팀원 검색..." />
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => { setSelectedWorkId('new'); trackTaskFormOpen('header'); }} variant="indigo" className="px-4 py-2 rounded-lg text-xs font-bold">
            <Plus size={14} /> 업무 추가
          </Button>
          <Button onClick={() => { setIsChatOpen(true); trackChatMessageSent(currentUser?.role || 'member', false); }} className="px-4 py-2 rounded-lg text-xs font-bold">
            <Zap size={14} /> 전략 분석
          </Button>
          {currentUser?.role === ROLES.MANAGER && (
            <Button onClick={() => setIsLearningOpen(true)} className="px-4 py-2 rounded-lg text-xs font-bold bg-amber-500 text-white hover:bg-amber-600 border-amber-500">
              <BookOpen size={14} /> AI 학습
            </Button>
          )}
        </div>
      </div>
    </header>
  );

  const BoardPage = () => {
    const [filters, setFilters] = useState({ project: '전체', member: '전체', status: '전체' });

    const filteredItems = useMemo(() => {
      return workItems.filter(item => (
        (filters.project === '전체' || item.project_name === filters.project) &&
        (filters.member === '전체' || item.assignees.includes(filters.member)) &&
        (filters.status === '전체' || item.status === filters.status)
      ));
    }, [workItems, filters]);

    const columns = [STATUS.TODO, STATUS.IN_PROGRESS, STATUS.DONE];

    return (
      <div className="p-5 space-y-4 flex flex-col h-full bg-gray-50/30 overflow-hidden">
        <div className="flex items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-gray-50">
          <div className="flex items-center gap-10">
            <div className="flex items-center gap-4">
              <div className="bg-indigo-50 p-2.5 rounded-xl text-indigo-600 shadow-sm"><Filter size={20} /></div>
              <h3 className="text-base font-black text-gray-900 tracking-tight uppercase">지능형 필터</h3>
            </div>
            <div className="flex gap-4">
              <FilterSelect label="프로젝트 클러스터" value={filters.project} onChange={(v: string) => setFilters({ ...filters, project: v })} options={['전체', ...new Set(workItems.map(w => w.project_name))]} />
              <FilterSelect label="담당자" value={filters.member} onChange={(v: string) => setFilters({ ...filters, member: v })} options={['전체', ...users.map(u => ({ label: u.name, value: u.id }))]} />
            </div>
          </div>
          <div className="flex bg-gray-50 p-1.5 rounded-2xl border border-gray-100 shadow-inner">
            <button onClick={() => setBoardViewMode('kanban')} className={`flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${boardViewMode === 'kanban' ? 'bg-white text-indigo-600 shadow-md ring-1 ring-gray-100' : 'text-gray-400 hover:text-gray-600'}`}>
              <Layout size={16} /> 칸반 보드
            </button>
            <button onClick={() => setBoardViewMode('list')} className={`flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${boardViewMode === 'list' ? 'bg-white text-indigo-600 shadow-md ring-1 ring-gray-100' : 'text-gray-400 hover:text-gray-600'}`}>
              <List size={16} /> 리스트 뷰
            </button>
          </div>
        </div>

        {boardViewMode === 'kanban' ? (
          <div className="flex-1 flex gap-4 overflow-x-auto no-scrollbar pb-4">
            {columns.map(col => (
              <div key={col} className="w-[320px] flex flex-col gap-3 flex-shrink-0">
                <div className="flex items-center justify-between px-3 bg-white/50 py-2 rounded-lg border border-white/80">
                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    {col}
                    <span className="text-[10px] font-bold bg-indigo-600 text-white px-2 py-0.5 rounded-full shadow-sm">
                      {filteredItems.filter(i => i.status === col).length}
                    </span>
                  </h3>
                  <MoreVertical size={16} className="text-gray-300 hover:text-gray-600 cursor-pointer" />
                </div>
                <div className="flex-1 bg-white/30 rounded-xl p-3 space-y-3 overflow-y-auto no-scrollbar border border-white/50 backdrop-blur-sm shadow-inner">
                  {filteredItems.filter(i => i.status === col).map(item => (
                    <WorkCard key={item.id} item={item} onClick={() => setSelectedWorkId(item.id)} users={users} />
                  ))}
                  <button onClick={() => { setSelectedWorkId('new'); trackTaskFormOpen('board'); }} className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-gray-300 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all flex items-center justify-center gap-2 font-bold text-xs group">
                    <Plus size={16} className="group-hover:rotate-90 transition-transform" /> 업무 추가
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex-1 bg-white rounded-xl border border-gray-100 shadow-lg overflow-hidden flex flex-col">
            <div className="overflow-y-auto flex-1 no-scrollbar">
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-white/90 backdrop-blur-xl z-10 border-b border-gray-100">
                  <tr className="text-[11px] text-gray-400 font-black uppercase tracking-[0.2em]">
                    <th className="px-12 py-8">업무명 & 프로젝트 컨테이너</th>
                    <th className="px-8 py-8">유형</th>
                    <th className="px-8 py-8">담당 멤버</th>
                    <th className="px-8 py-8 text-center">상태</th>
                    <th className="px-8 py-8 text-center">전략 점수</th>
                    <th className="px-12 py-8 text-right">마감일</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredItems.map(item => (
                    <tr key={item.id} className="hover:bg-indigo-50 group transition-all cursor-pointer" onClick={() => setSelectedWorkId(item.id)}>
                      <td className="px-12 py-8">
                        <p className="text-[10px] text-indigo-500 font-black uppercase tracking-widest mb-1.5">{item.project_name}</p>
                        <p className="text-lg font-black text-gray-900 group-hover:text-indigo-600 transition-colors uppercase tracking-tight">{item.title}</p>
                      </td>
                      <td className="px-8 py-8"><Badge color="purple">{item.type}</Badge></td>
                      <td className="px-8 py-8">
                        <div className="flex items-center gap-3">
                          <div className="flex -space-x-2">
                            {item.assignees.map(aid => (
                              <div key={aid} className="w-9 h-9 rounded-xl bg-indigo-600 border-2 border-white flex items-center justify-center text-[11px] font-black text-white shadow-md transition-transform hover:scale-110" title={users.find((u: User) => u.id === aid)?.name}>
                                {users.find((u: User) => u.id === aid)?.name?.charAt(0)}
                              </div>
                            ))}
                          </div>
                          {item.assignees.length > 0 && (
                            <span className="text-xs font-black text-gray-500 uppercase tracking-tighter">
                              {item.assignees.length === 1
                                ? users.find((u: User) => u.id === item.assignees[0])?.name
                                : `${users.find((u: User) => u.id === item.assignees[0])?.name} 외 ${item.assignees.length - 1}명`}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-8 py-8 text-center"><Badge color={item.status === STATUS.DONE ? 'green' : (item.status === STATUS.IN_PROGRESS ? 'indigo' : 'gray')}>{item.status}</Badge></td>
                      <td className="px-8 py-8 text-center font-black text-xl text-gray-900 tabular-nums tracking-tighter">{Math.round(item.priority_score)}</td>
                      <td className="px-12 py-8 text-right text-sm font-black text-gray-400 uppercase tracking-widest">{formatDate(item.due_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredItems.length === 0 && (
                <div className="py-40 text-center font-black text-gray-300 uppercase tracking-[0.3em] flex flex-col items-center gap-6">
                  <Inbox size={60} className="text-gray-100" />
                  No data found in this visibility cluster
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const FilterSelect = ({ label, value, onChange, options }: any) => (
    <div className="flex flex-col gap-2 min-w-[160px]">
      <label className="text-[10px] font-black text-gray-300 uppercase tracking-widest ml-1">{label}</label>
      <div className="relative group">
        <select value={value} onChange={e => onChange(e.target.value)} className="w-full bg-gray-50 border-none appearance-none rounded-2xl px-5 py-3 text-xs font-black text-gray-900 focus:ring-4 focus:ring-indigo-500/10 outline-none shadow-inner cursor-pointer pr-10">
          {options.map((opt: any) => {
            const val = typeof opt === 'string' ? opt : opt.value;
            const lbl = typeof opt === 'string' ? opt : opt.label;
            return <option key={val} value={val}>{lbl}</option>;
          })}
        </select>
        <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none group-hover:text-indigo-600 transition-colors" />
      </div>
    </div>
  );

  const WorkCard = ({ item, onClick, users }: any) => (
    <div className="bg-white p-4 rounded-xl shadow-sm hover:shadow-lg hover:shadow-indigo-50 hover:-translate-y-1 transition-all cursor-pointer border border-gray-50 hover:border-indigo-100 group relative" onClick={onClick}>
      <div className="flex justify-between items-start mb-2">
        <Badge color={item.impact === 'high' ? 'red' : (item.impact === 'med' ? 'indigo' : 'gray')}>{item.type}</Badge>
        <div className="flex items-center gap-2">
          {item.approval_status === 'pending' && <div className="w-2 h-2 bg-yellow-400 rounded-full animate-ping" />}
          <span className="text-sm font-bold text-gray-900 tabular-nums">{Math.round(item.priority_score)}</span>
        </div>
      </div>
      <h4 className="text-sm font-bold text-gray-900 mb-1 leading-snug group-hover:text-indigo-600 transition-colors">{item.title}</h4>
      <p className="text-xs text-gray-400 font-medium line-clamp-2 mb-4 leading-relaxed">{item.description}</p>
      <div className="flex items-center justify-between pt-3 border-t border-gray-50">
        <div className="flex items-center gap-2">
          <div className="flex -space-x-2">
            {item.assignees.map((aid: string) => {
              const u = users.find((usr: User) => usr.id === aid);
              return (
                <div key={aid} className="w-7 h-7 rounded-lg bg-indigo-600 border-2 border-white flex items-center justify-center text-[10px] font-bold text-white shadow-sm" title={u?.name}>
                  {u?.name?.charAt(0)}
                </div>
              );
            })}
          </div>
          {item.assignees.length > 0 && (
            <span className="text-[10px] font-semibold text-gray-400">
              {(() => {
                const firstName = users.find((u: User) => u.id === item.assignees[0])?.name;
                if (!firstName) return '';
                return item.assignees.length === 1 ? firstName : `${firstName} 외 ${item.assignees.length - 1}명`;
              })()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 bg-gray-50 px-2.5 py-1 rounded-md border border-gray-100">
          <Calendar size={12} className="text-indigo-600" />
          <span className="text-[10px] font-semibold text-gray-500">{formatDate(item.due_date)}</span>
        </div>
      </div>
    </div>
  );

  const MyPage = () => {
    const myTasks = useMemo(() =>
      workItems.filter(item => item.assignees?.includes(currentUser?.id || ''))
        .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
      , [workItems, currentUser]);

    return (
      <div className="p-12 space-y-12 animate-in fade-in duration-1000">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          <StatCard title="배정된 업무" value={myTasks.length} icon={<CheckSquare className="text-white" />} color="bg-indigo-600" />
          <StatCard title="진행 중인 업무" value={myTasks.filter(t => t.status !== STATUS.DONE).length} icon={<Clock className="text-white" />} color="bg-yellow-500" />
          <StatCard title="고영향도 업무" value={myTasks.filter(t => t.impact === 'high').length} icon={<TrendingUp className="text-white" />} color="bg-red-500" />
        </div>

        {/* --- Team Attendance Section --- */}
        <section className="bg-white rounded-[4rem] shadow-2xl shadow-gray-200/50 border border-gray-100 overflow-hidden">
          <div className="p-12 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-black text-gray-900 tracking-tighter uppercase">팀원 전략적 근태 현황</h2>
              <p className="text-xs font-bold text-gray-300 tracking-[0.2em] mt-2 uppercase">현재 상황 및 예정 계획 실시간 동기화</p>
            </div>
            <div className="flex -space-x-3">
              {users.slice(0, 5).map(u => (
                <div key={u.id} className="w-10 h-10 rounded-xl bg-gray-50 border-2 border-white flex items-center justify-center text-[10px] font-black text-gray-400 shadow-sm">
                  {u.name.charAt(0)}
                </div>
              ))}
              {users.length > 5 && <div className="w-10 h-10 rounded-xl bg-indigo-50 border-2 border-white flex items-center justify-center text-[10px] font-black text-indigo-600">+{users.length - 5}</div>}
            </div>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 bg-gray-50/30">
            {users.map(user => {
              const canEdit = currentUser?.id === user.id || currentUser?.role === 'manager';
              return (
                <div key={user.id}
                  onClick={() => canEdit && setEditingUserStatus(user)}
                  className={`bg-white p-6 rounded-3xl border border-gray-100 flex items-center gap-6 shadow-sm transition-all hover:shadow-xl group ${canEdit ? 'cursor-pointer hover:border-indigo-200' : 'cursor-default'}`}>
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-black text-white shadow-lg transition-transform group-hover:scale-110 ${user.today_status === '휴가' ? 'bg-red-400' : (user.today_status === '재택' ? 'bg-purple-500' : 'bg-indigo-600')
                    }`}>
                    {user.name.charAt(0)}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-black text-gray-900 tracking-tight flex items-center gap-2">
                        {user.name}
                        {canEdit && <span className="opacity-0 group-hover:opacity-100 text-[10px] text-indigo-400">신원 확인됨</span>}
                      </p>
                      <Badge color={user.today_status === '근무' ? 'green' : (user.today_status === '휴가' ? 'red' : 'indigo')}>{user.today_status}</Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-bold text-gray-400">
                      <Calendar size={12} className="text-gray-300" />
                      <span className="truncate italic">계획: {user.scheduled_status || '특이사항 없음'}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="bg-white rounded-[4rem] shadow-2xl shadow-gray-200/50 border border-gray-100 overflow-hidden transition-all hover:border-indigo-100">
          <div className="p-12 border-b border-gray-100 flex items-center justify-between bg-white">
            <div>
              <h2 className="text-3xl font-black text-gray-900 tracking-tighter uppercase">집중 업무 큐</h2>
              <p className="text-xs font-bold text-gray-300 tracking-[0.2em] mt-2 italic uppercase">마감일 임박 순으로 정렬됨</p>
            </div>
            <Button variant="outline" onClick={() => { setView('board'); trackPageView('board'); }} className="px-8 py-4 rounded-full text-xs font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white border-2">전체 팀 보드 보기 <ChevronRight size={18} /></Button>
          </div>
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50/50 text-[11px] text-gray-400 font-black uppercase tracking-[0.2em]">
                <th className="px-12 py-8">업무 정보</th>
                <th className="px-8 py-8 text-center">진행 상태</th>
                <th className="px-8 py-8 text-center">마감 기한</th>
                <th className="px-12 py-8">최신 전략적 업데이트</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {myTasks.length === 0 ? (
                <tr><td colSpan={4} className="px-10 py-32 text-center text-gray-300 font-black uppercase tracking-[0.3em]">배정된 업무가 없습니다.</td></tr>
              ) : myTasks.map(task => (
                <tr key={task.id} className="hover:bg-indigo-50/30 cursor-pointer group transition-all" onClick={() => setSelectedWorkId(task.id)}>
                  <td className="px-12 py-10">
                    <p className="text-[10px] text-indigo-500 font-black uppercase mb-1.5 tracking-[0.15em]">{task.project_name}</p>
                    <p className="text-xl font-black text-gray-900 group-hover:text-indigo-600 transition-colors uppercase tracking-tight">{task.title}</p>
                  </td>
                  <td className="px-8 py-10 text-center">
                    <Badge color={task.status === STATUS.DONE ? 'green' : (task.status === STATUS.IN_PROGRESS ? 'indigo' : 'gray')}>{task.status}</Badge>
                  </td>
                  <td className="px-8 py-10 text-center">
                    <span className="text-sm text-gray-600 font-black uppercase tracking-widest">{formatDate(task.due_date)}</span>
                  </td>
                  <td className="px-12 py-10">
                    <div className="flex items-center gap-3 bg-white p-4 rounded-2xl border border-gray-100 group-hover:border-indigo-100 transition-all shadow-sm">
                      <AlertCircle size={16} className="text-indigo-400" />
                      <p className="text-sm text-gray-500 font-bold italic line-clamp-1">"{task.last_update_note}"</p>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    );
  };

  const StatCard = ({ title, value, icon, color }: { title: string; value: number; icon: React.ReactNode; color: string }) => (
    <div className="bg-white p-10 rounded-[3rem] shadow-xl shadow-gray-100 border border-gray-100 relative overflow-hidden group hover:-translate-y-2 transition-all hover:shadow-2xl">
      <div className="flex items-center justify-between mb-6 relative z-10">
        <h3 className="font-black text-gray-300 text-[11px] uppercase tracking-[0.2em]">{title}</h3>
        <div className={`p-4 rounded-2xl ${color} shadow-lg group-hover:scale-110 transition-transform`}>{icon}</div>
      </div>
      <div className="text-6xl font-black text-gray-900 tracking-tighter tabular-nums relative z-10">{value}</div>
      <div className="absolute top-0 right-0 w-32 h-32 bg-gray-50 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-indigo-50 transition-colors" />
    </div>
  );

  const WorkDetailModal = ({ id, onClose }: { id: string, onClose: () => void }) => {
    const isNew = id === 'new';
    const item: Partial<WorkItem> = workItems.find(w => w.id === id) || {
      title: '',
      description: '',
      project_name: '',
      status: STATUS.TODO,
      assignees: [currentUser?.id || ''],
      type: '개발',
      impact: LEVELS.MED,
      urgency: LEVELS.MED,
      due_date: new Date(Date.now() + 604800000).toISOString().split('T')[0],
      last_update_note: ''
    };
    const [form, setForm] = useState<Partial<WorkItem>>(item);

    return (
      <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-2xl flex items-center justify-center z-50 p-8 animate-in fade-in duration-300">
        <div className="bg-white rounded-[4rem] w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl transition-all scale-in-95 animate-in">
          <div className="px-14 py-10 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
            <div>
              <h2 className="text-4xl font-black text-gray-900 tracking-tighter uppercase">{isNew ? '새 업무 생성' : '업무 전략 상세'}</h2>
              <p className="text-xs font-bold text-gray-400 tracking-widest mt-2 uppercase">핵심 논리적 작업 정의</p>
            </div>
            <button onClick={onClose} className="p-4 hover:bg-white rounded-2xl transition-all text-gray-300 hover:text-red-500 border border-transparent hover:border-gray-200 shadow-sm"><X size={28} /></button>
          </div>
          <form className="flex-1 overflow-y-auto p-14 space-y-12 no-scrollbar" onSubmit={(e) => {
            e.preventDefault();
            if (isNew) {
              addWorkItem(form);
              trackTaskFormSubmit(Object.values(form).filter(v => !!v).length);
            }
            else updateWorkItem(id, form);
            onClose();
          }}>
            <div className="grid grid-cols-2 gap-12">
              <div className="col-span-2 space-y-4">
                <label className="text-xs font-black text-gray-300 uppercase tracking-[0.3em] block ml-1">업무 제목</label>
                <input required className="w-full px-8 py-6 bg-gray-50 border-transparent border focus:border-indigo-100 rounded-[2rem] focus:ring-4 focus:ring-indigo-500/5 font-black text-2xl outline-none shadow-inner transition-all uppercase placeholder:text-gray-200"
                  value={form.title} onFocus={() => trackTaskFieldTouch('title')} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="업무 식별자를 입력하세요..." />
              </div>
              <div className="space-y-4">
                <label className="text-xs font-black text-gray-300 uppercase tracking-[0.3em] block ml-1">프로젝트 클러스터</label>
                <input required className="w-full px-8 py-5 bg-gray-50 border-transparent border focus:border-indigo-100 rounded-2xl focus:ring-4 focus:ring-indigo-500/5 font-bold outline-none shadow-inner transition-all uppercase"
                  value={form.project_name} onChange={e => setForm({ ...form, project_name: e.target.value })} placeholder="프로젝트 이름..." />
              </div>
              <div className="space-y-4">
                <label className="text-xs font-black text-gray-300 uppercase tracking-[0.3em] block ml-1">작업 유형</label>
                <div className="relative group">
                  <select className="w-full px-8 py-5 bg-gray-50 border-transparent border focus:border-indigo-100 rounded-2xl focus:ring-4 focus:ring-indigo-500/5 font-bold outline-none shadow-inner appearance-none uppercase transition-all"
                    value={form.type} onChange={e => setForm({ ...form, type: e.target.value as WorkType })}>
                    {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none group-hover:text-indigo-600 transition-all" size={20} />
                </div>
              </div>
              <div className="col-span-2 space-y-4 bg-gray-50/50 p-10 rounded-[3rem] border border-gray-100">
                <label className="text-xs font-black text-gray-300 uppercase tracking-[0.3em] block ml-1 mb-2">담당 멤버 (멀티 선택 가능)</label>
                <div className="flex flex-wrap gap-4">
                  {users.map(u => {
                    const isSelected = form.assignees?.includes(u.id);
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          const currentAssignees = form.assignees || [];
                          const nextAssignees = isSelected
                            ? currentAssignees.filter(sid => sid !== u.id)
                            : [...currentAssignees, u.id];
                          setForm({ ...form, assignees: nextAssignees });
                        }}
                        className={`flex items-center gap-3 px-6 py-3.5 rounded-2xl text-xs font-black transition-all border-2 ${isSelected
                          ? 'bg-indigo-600 border-indigo-600 text-white shadow-xl shadow-indigo-100 -translate-y-1'
                          : 'bg-white border-gray-100 text-gray-400 hover:border-indigo-200 hover:text-indigo-600'}`}
                      >
                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] ${isSelected ? 'bg-white text-indigo-600' : 'bg-gray-100 text-gray-400'}`}>
                          {u.name.charAt(0)}
                        </div>
                        {u.name}
                        {u.id === currentUser?.id && <span className={`ml-1 text-[8px] px-1.5 py-0.5 rounded ${isSelected ? 'bg-indigo-500 text-white' : 'bg-gray-200 text-gray-400'}`}>나</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="col-span-2 space-y-4">
                <label className="text-xs font-black text-gray-300 uppercase tracking-[0.3em] block ml-1">전략적 설명</label>
                <textarea className="w-full px-8 py-6 bg-gray-50 border-transparent border focus:border-indigo-100 rounded-[2rem] focus:ring-4 focus:ring-indigo-500/5 font-bold text-gray-600 outline-none shadow-inner transition-all min-h-[160px] leading-relaxed uppercase tracking-tight"
                  value={form.description} onFocus={() => trackTaskFieldTouch('description')} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="핵심 근거 및 목표를 기술하세요..." />
              </div>
              <div className="grid grid-cols-2 gap-8 col-span-2 bg-indigo-50/30 p-10 rounded-[3rem] border border-indigo-100 shadow-inner">
                <div className="space-y-4">
                  <label className="text-xs font-black text-indigo-400 uppercase tracking-[0.3em] block ml-1">시간 범위 (마감일)</label>
                  <input type="date" className="w-full px-8 py-5 bg-white border border-indigo-100 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 font-black outline-none shadow-sm transition-all"
                    value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
                </div>
                <div className="space-y-4">
                  <label className="text-xs font-black text-indigo-400 uppercase tracking-[0.3em] block ml-1">워크플로우 상태</label>
                  <select className="w-full px-8 py-5 bg-white border border-indigo-100 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 font-black outline-none shadow-sm appearance-none transition-all"
                    value={form.status} onChange={e => setForm({ ...form, status: e.target.value as Status })}>
                    {Object.values(STATUS).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="space-y-4">
                  <label className="text-xs font-black text-red-400 uppercase tracking-[0.3em] block ml-1">전략적 영향도</label>
                  <select className="w-full px-8 py-5 bg-white border border-red-100 rounded-2xl focus:ring-4 focus:ring-red-500/10 font-black outline-none shadow-sm appearance-none transition-all uppercase"
                    value={form.impact} onChange={e => setForm({ ...form, impact: e.target.value as Level })}>
                    <option value="low">낮음</option>
                    <option value="med">중간</option>
                    <option value="high">높음</option>
                  </select>
                </div>
                <div className="space-y-4">
                  <label className="text-xs font-black text-yellow-500 uppercase tracking-[0.3em] block ml-1">긴급도 매트릭스</label>
                  <select className="w-full px-8 py-5 bg-white border border-yellow-100 rounded-2xl focus:ring-4 focus:ring-yellow-500/10 font-black outline-none shadow-sm appearance-none transition-all uppercase"
                    value={form.urgency} onChange={e => setForm({ ...form, urgency: e.target.value as Level })}>
                    <option value="low">낮음</option>
                    <option value="med">중간</option>
                    <option value="high">높음</option>
                  </select>
                </div>
              </div>
              <div className="col-span-2 space-y-4">
                <label className="text-xs font-black text-indigo-500 uppercase tracking-[0.3em] block ml-1 flex items-center gap-2">
                  <MessageSquare size={16} /> 최신 전술 정보
                </label>
                <input className="w-full px-8 py-6 bg-white border border-indigo-100 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 font-black outline-none shadow-xl shadow-indigo-100/20 italic"
                  value={form.last_update_note} onChange={e => setForm({ ...form, last_update_note: e.target.value })} placeholder="현재 어느 단계에 있습니까?" />
              </div>
            </div>
            <div className="flex justify-end gap-6 pt-10">
              <Button variant="ghost" onClick={onClose} className="px-14 py-5 rounded-full text-lg uppercase font-black hover:bg-gray-50 border-2">취소</Button>
              <Button type="submit" className="px-20 py-5 rounded-full text-lg shadow-2xl shadow-indigo-100 font-black uppercase tracking-widest transition-transform hover:scale-105 active:scale-95">데이터 확정</Button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  const InboxPage = () => (
    <div className="p-12 max-w-5xl mx-auto space-y-12 animate-in slide-in-from-top-10 duration-700 h-full overflow-y-auto no-scrollbar pb-32">
      <div>
        <h2 className="text-5xl font-black text-gray-900 tracking-tighter uppercase">승인 인박스</h2>
        <p className="text-gray-400 font-black mt-3 uppercase tracking-[0.4em] text-xs">전략적 승인을 기다리는 항목</p>
      </div>
      <div className="space-y-10">
        {proposals.filter(p => p.approval_status === 'pending').map(prop => (
          <div key={prop.id} className="bg-white p-14 rounded-[4rem] border border-gray-100 shadow-2xl shadow-indigo-100/20 flex flex-col gap-10 group hover:border-indigo-200 transition-all hover:-translate-y-2">
            <div className="flex items-start gap-10">
              <div className="bg-indigo-600 p-8 rounded-[2.5rem] text-white shadow-2xl shadow-indigo-200 group-hover:rotate-6 group-hover:scale-110 transition-all">
                <Zap size={48} />
              </div>
              <div className="flex-1 space-y-4">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-black text-indigo-600 uppercase tracking-[0.3em] bg-indigo-50 px-4 py-2 rounded-full border border-indigo-100">AI 논리 시뮬레이션 분석</span>
                  <span className="text-xs text-gray-300 font-black uppercase tracking-widest">{formatDate(prop.created_at)}</span>
                </div>
                <h4 className="font-black text-gray-900 text-3xl leading-tight uppercase tracking-tighter">{prop.suggestion_text}</h4>
                <div className="bg-gray-50 p-10 rounded-[3rem] border border-gray-100 group-hover:bg-white transition-all shadow-inner group-hover:shadow-md">
                  <p className="text-lg text-gray-500 leading-relaxed font-bold italic uppercase tracking-tight">"{prop.explanation}"</p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between pt-10 border-t border-gray-100">
              <div className="flex gap-6">
                <Button className="px-14 py-5 rounded-full font-black text-sm uppercase tracking-[0.2em] shadow-2xl shadow-indigo-100 hover:scale-105" onClick={async () => { try { await updateDoc(doc(db, 'proposals', prop.id), { approval_status: 'approved' }); } catch (e) { console.error('승인 실패:', e); } }}>승인</Button>
                <Button variant="outline" className="px-14 py-5 rounded-full font-black text-sm uppercase tracking-[0.2em] hover:bg-red-50 hover:text-red-500 hover:border-red-200" onClick={async () => { try { await updateDoc(doc(db, 'proposals', prop.id), { approval_status: 'rejected' }); } catch (e) { console.error('반려 실패:', e); } }}>반려</Button>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-gray-300 font-black uppercase tracking-[0.2em] mb-2 tracking-widest">요청자</p>
                <p className="text-lg font-black text-gray-800 uppercase tracking-tighter">{users.find(u => u.id === prop.created_by)?.name}</p>
              </div>
            </div>
          </div>
        ))}
        {proposals.filter(p => p.approval_status === 'pending').length === 0 && (
          <div className="py-40 text-center font-black text-gray-300 uppercase tracking-[0.5em] flex flex-col items-center gap-10">
            <CheckSquare size={100} className="text-gray-50 animate-bounce" />
            승인 대기 중인 항목이 없습니다.
          </div>
        )}
      </div>
    </div>
  );

  const PriorityPage = () => {
    const sortedItems = useMemo(() =>
      workItems.filter(i => i.status !== STATUS.DONE)
        .sort((a, b) => b.priority_score - a.priority_score)
      , [workItems]);

    const projectGroups = useMemo(() => {
      const groups: Record<string, WorkItem[]> = {};
      sortedItems.forEach(item => {
        if (!groups[item.project_name]) groups[item.project_name] = [];
        groups[item.project_name].push(item);
      });
      return groups;
    }, [sortedItems]);

    return (
      <div className="p-12 space-y-16 h-full overflow-y-auto no-scrollbar pb-40">
        {/* AI Strategic Intelligence Feed */}
        <div className="bg-white p-1 rounded-[4rem] shadow-2xl shadow-indigo-100 ring-1 ring-gray-100 overflow-hidden group">
          <div className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-indigo-900 p-16 rounded-[3.8rem] text-white relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-white/10 rounded-full blur-[100px] -mr-40 -mt-40 animate-pulse" />
            <div className="relative z-10 flex flex-col lg:flex-row gap-16 items-center">
              <div className="flex-1 space-y-8">
                <div className="flex items-center gap-6">
                  <div className="bg-white/20 p-6 rounded-[2rem] backdrop-blur-3xl border border-white/20 shadow-2xl ring-1 ring-white/30 animate-float">
                    <Zap size={48} className="text-white fill-white" />
                  </div>
                  <div>
                    <h3 className="text-4xl font-black tracking-tighter uppercase mb-2">주간 전략 인텔리전스</h3>
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                      <p className="text-indigo-200 font-black uppercase tracking-[0.3em] text-xs">시스템 라이브 시뮬레이션 활성</p>
                    </div>
                  </div>
                </div>
                <div className="bg-white/10 p-10 rounded-[3rem] border border-white/10 backdrop-blur-md shadow-inner transition-all hover:bg-white/15">
                  <p className="text-xl font-bold leading-relaxed italic opacity-95 uppercase tracking-tight">
                    "분석 완료: {Object.keys(projectGroups).length}개의 프로젝트 클러스터 중 'NextGen AI' 프로젝트에 즉각적인 리소스 투입이 필요합니다.
                    우선순위 인덱스가 현재 배포에서 4개의 크리티컬 실패 지점을 식별했습니다. 오늘 내로 인력 재배치를 권장합니다."
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-6 w-full lg:w-96">
                <PriorityStat label="시스템 우선순위 인덱스" value="98.4" sub="크리티컬" color="text-red-400" />
                <PriorityStat label="프로젝트 가속도" value="+22%" sub="상승 중" color="text-green-400" />
                <PriorityStat label="활성 리스크 요인" value="L4" sub="주의" color="text-yellow-400" />
                <PriorityStat label="팀 효율성" value="92%" sub="최적화됨" color="text-indigo-300" />
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto space-y-16">
          <div className="text-center space-y-4">
            <h2 className="text-6xl font-black text-gray-900 tracking-tighter uppercase">계산된 우선순위 매트릭스</h2>
            <p className="text-gray-400 font-extrabold uppercase tracking-[0.5em] text-sm">수학적 가중치가 적용된 업무 파이프라인</p>
          </div>

          <div className="space-y-20">
            {Object.entries(projectGroups).map(([project, items]) => (
              <div key={project} className="space-y-10 group">
                <div className="flex items-center gap-6 group">
                  <div className="h-px flex-1 bg-gray-100 group-hover:bg-indigo-100 transition-colors" />
                  <h3 className="text-3xl font-black text-gray-900 tracking-tighter uppercase px-12 py-5 bg-white rounded-full border border-gray-100 shadow-xl shadow-gray-100/50 group-hover:scale-105 transition-transform">
                    {project} 클러스터
                    <span className="ml-4 text-xs font-black text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full italic">{items.length}개 업무</span>
                  </h3>
                  <div className="h-px flex-1 bg-gray-100 group-hover:bg-indigo-100 transition-colors" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
                  {items.map(item => (
                    <WorkCard key={item.id} item={item} onClick={() => setSelectedWorkId(item.id)} users={users} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const PriorityStat = ({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) => (
    <div className="bg-white/5 p-8 rounded-[2.5rem] border border-white/5 text-center flex flex-col justify-center backdrop-blur-sm transition-all hover:bg-white/10 hover:border-white/10">
      <p className="text-[10px] font-black text-indigo-300 uppercase tracking-[0.2em] mb-3">{label}</p>
      <p className="text-5xl font-black tracking-tighter mb-2">{value}</p>
      <p className={`text-[10px] font-black uppercase tracking-[0.4em] ${color}`}>{sub}</p>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-white text-gray-900 selection:bg-indigo-100 selection:text-indigo-900 font-sans tracking-tight">
      {view !== 'login' && view !== 'signup' && <Sidebar />}
      <main className="flex-1 flex flex-col overflow-hidden">
        {(view !== 'login' && view !== 'signup') && (
          <Header title={view === 'my' ? '개인 전략 보기' : (view === 'board' ? '팀 가시성 보드' : (view === 'priority' ? '전략 우선순위 엔진' : '승인 대기 인박스'))} />
        )}
        <div className="flex-1 overflow-y-auto no-scrollbar relative">
          {(view === 'login' || view === 'signup') && <AuthView />}
          {view === 'my' && <MyPage />}
          {view === 'board' && <BoardPage />}
          {view === 'priority' && <PriorityPage />}
          {view === 'inbox' && <InboxPage />}
        </div>
      </main>

      {selectedWorkId && <WorkDetailModal id={selectedWorkId} onClose={() => { setSelectedWorkId(null); trackTaskFormAbandon(); }} />}
      {editingUserStatus && <UserStatusModal user={editingUserStatus} onClose={() => setEditingUserStatus(null)} />}

      {/* AI Intelligence Chat Overlay */}
      {isChatOpen && (() => {
        const handleSendChat = async (text: string) => {
          if (!text.trim() || isChatLoading) return;
          const userMsg = text.trim();
          setChatMessages(prev => [...prev, { role: 'user', text: userMsg }]);
          setChatInput('');
          setIsChatLoading(true);

          // GA4 채팅 전송 추적
          trackChatMessageSent(currentUser?.role || 'member', chatMessages.length === 0);

          try {
            // 업무 컨텍스트 구성
            const now = new Date();
            const threeDaysLater = new Date(now.getTime() + 3 * 86400000);
            const upcomingDeadlines = workItems
              .filter(w => w.status !== '완료' && new Date(w.due_date) <= threeDaysLater)
              .map(w => ({ title: w.title, dueDate: w.due_date }));

            const context = {
              userName: currentUser?.name || '사용자',
              totalTasks: workItems.length,
              highImpactTasks: workItems.filter(w => w.impact === 'high').length,
              inProgressTasks: workItems.filter(w => w.status === '진행').length,
              todoTasks: workItems.filter(w => w.status === '준비').length,
              doneTasks: workItems.filter(w => w.status === '완료').length,
              projectNames: [...new Set(workItems.map(w => w.project_name))],
              upcomingDeadlines,
            };

            const directives = aiDirectives.map(d => d.summary || d.text);
            const aiResponse = await generateStrategyResponse(userMsg, context, directives);
            setChatMessages(prev => [...prev, { role: 'ai', text: aiResponse }]);
          } catch {
            setChatMessages(prev => [...prev, {
              role: 'ai',
              text: '⚠️ AI 응답 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
            }]);
          } finally {
            setIsChatLoading(false);
          }
        };
        return (
          <div className="fixed bottom-6 right-6 w-[380px] h-[500px] bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col z-50 animate-scale-in">
            <div className="px-5 py-3.5 border-b border-gray-50 flex items-center justify-between bg-indigo-600 rounded-t-2xl">
              <div className="flex items-center gap-2">
                <Zap className="text-white" size={16} />
                <h3 className="text-white font-bold text-sm">전략 어시스턴트</h3>
              </div>
              <button onClick={() => setIsChatOpen(false)} className="text-white/50 hover:text-white transition-colors"><X size={18} /></button>
            </div>
            <div className="flex-1 p-4 overflow-y-auto space-y-3 no-scrollbar">
              <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                <p className="text-sm font-medium text-gray-700 leading-relaxed">
                  안녕하세요 {currentUser?.name}님. 현재 프로젝트 정보를 로드했습니다. 어떤 분석이 필요하신가요?
                </p>
              </div>
              {chatMessages.length === 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-gray-400 tracking-wider">추천 질문</p>
                  {['현재 프로젝트 리스크 분석해줘', '이번 주 우선순위 조정 제안해줘', '팀 업무 부하 분석해줘'].map(q => (
                    <button key={q} onClick={() => handleSendChat(q)} className="w-full text-left p-3 rounded-lg border border-gray-100 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 transition-all">{q}</button>
                  ))}
                </div>
              )}
              {chatMessages.map((msg, idx) => (
                <div key={idx} className={`p-3 rounded-xl text-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white ml-8 font-medium' : 'bg-gray-50 border border-gray-100 text-gray-700 mr-4 font-medium leading-relaxed'}`}>
                  {msg.text}
                </div>
              ))}
              {isChatLoading && (
                <div className="bg-gray-50 border border-gray-100 mr-4 p-3 rounded-xl flex items-center gap-2">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-xs text-gray-400 font-medium">AI 분석 중...</span>
                </div>
              )}
            </div>
            <form onSubmit={(e) => { e.preventDefault(); handleSendChat(chatInput); }} className="p-3 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl">
              <div className="flex gap-2">
                <input className="flex-1 pl-4 pr-3 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 text-sm font-medium outline-none shadow-sm" placeholder="AI에게 질문하세요..." value={chatInput} onChange={e => setChatInput(e.target.value)} />
                <button type="submit" className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-lg hover:bg-indigo-700 transition-colors"><ChevronRight size={16} /></button>
              </div>
            </form>
          </div>
        );
      })()}

      {/* AI 학습 채팅방 (매니저 전용) */}
      {isLearningOpen && currentUser?.role === ROLES.MANAGER && (() => {
        const handleLearningSubmit = async (text: string) => {
          if (!text.trim() || isLearningLoading) return;
          const input = text.trim();
          setLearningInput('');
          setIsLearningLoading(true);
          try {
            const existingTexts = aiDirectives.map(d => d.summary || d.text);
            const summary = await processLearningInput(input, existingTexts);
            await addDoc(collection(db, 'ai_directives'), {
              text: input,
              summary,
              createdAt: new Date().toISOString(),
              createdBy: currentUser?.id || '',
              createdByName: currentUser?.name || '',
            });
          } catch {
            alert('AI 학습 저장에 실패했습니다. 다시 시도해 주세요.');
          } finally {
            setIsLearningLoading(false);
          }
        };

        const handleDeleteDirective = async (id: string) => {
          if (!confirm('이 방향성을 삭제하시겠습니까?')) return;
          await deleteDoc(doc(db, 'ai_directives', id));
        };

        return (
          <div className="fixed bottom-6 right-[410px] w-[400px] h-[540px] bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col z-50 animate-scale-in">
            <div className="px-5 py-3.5 border-b border-gray-50 flex items-center justify-between bg-amber-500 rounded-t-2xl">
              <div className="flex items-center gap-2">
                <BookOpen className="text-white" size={16} />
                <h3 className="text-white font-bold text-sm">AI 전략 학습</h3>
                <span className="text-amber-100 text-[10px] font-semibold bg-amber-600/50 px-2 py-0.5 rounded-full">매니저 전용</span>
              </div>
              <button onClick={() => setIsLearningOpen(false)} className="text-white/50 hover:text-white transition-colors"><X size={18} /></button>
            </div>
            <div className="flex-1 p-4 overflow-y-auto space-y-3 no-scrollbar">
              <div className="bg-amber-50 p-3 rounded-xl border border-amber-100">
                <p className="text-sm font-medium text-amber-800 leading-relaxed">
                  팀의 전략적 방향성을 입력하면 AI가 학습하여 모든 팀원에게 일관된 전략 분석을 제공합니다.
                </p>
              </div>

              {/* 저장된 방향성 목록 */}
              {aiDirectives.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-gray-400 tracking-wider">학습된 방향성 ({aiDirectives.length}개)</p>
                  {aiDirectives.map((d) => (
                    <div key={d.id} className="p-3 rounded-xl border border-gray-100 bg-gray-50 group relative">
                      <p className="text-xs font-bold text-gray-800 mb-1">📌 {d.summary}</p>
                      <p className="text-[10px] text-gray-400 leading-relaxed">"{d.text}"</p>
                      <p className="text-[9px] text-gray-300 mt-1.5">{new Date(d.createdAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                      <button onClick={() => handleDeleteDirective(d.id)} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all"><Trash2 size={12} /></button>
                    </div>
                  ))}
                </div>
              )}

              {aiDirectives.length === 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-gray-400 tracking-wider">예시 입력</p>
                  {[
                    '이번 분기는 신규 고객 확보보다 기존 고객 유지에 집중해야 해',
                    '프론트엔드보다 백엔드 안정화를 우선시해줘',
                    '팀원들에게 코드 리뷰를 적극 추천해줘'
                  ].map(q => (
                    <button key={q} onClick={() => handleLearningSubmit(q)} className="w-full text-left p-3 rounded-lg border border-amber-100 text-xs font-semibold text-amber-700 hover:bg-amber-50 transition-all">{q}</button>
                  ))}
                </div>
              )}

              {isLearningLoading && (
                <div className="bg-amber-50 border border-amber-100 p-3 rounded-xl flex items-center gap-2">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-xs text-amber-600 font-medium">AI 학습 중...</span>
                </div>
              )}
            </div>
            <form onSubmit={(e) => { e.preventDefault(); handleLearningSubmit(learningInput); }} className="p-3 border-t border-gray-100 bg-amber-50/30 rounded-b-2xl">
              <div className="flex gap-2">
                <input className="flex-1 pl-4 pr-3 py-2.5 bg-white border border-amber-200 rounded-xl focus:ring-2 focus:ring-amber-500 text-sm font-medium outline-none shadow-sm" placeholder="팀 방향성/전략을 입력하세요..." value={learningInput} onChange={e => setLearningInput(e.target.value)} />
                <button type="submit" disabled={isLearningLoading} className="p-2.5 bg-amber-500 text-white rounded-xl shadow-lg hover:bg-amber-600 transition-colors disabled:opacity-50"><ChevronRight size={16} /></button>
              </div>
            </form>
          </div>
        );
      })()}

      {/* 실시간 로딩 토스트 알림 */}
      {loadingMessage && (
        <div className="fixed top-10 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="bg-indigo-900/90 backdrop-blur-xl text-white px-8 py-5 rounded-3xl shadow-2xl flex items-center gap-4 border border-indigo-500/30">
            <div className="w-5 h-5 border-3 border-indigo-400 border-t-white rounded-full animate-spin" />
            <p className="text-sm font-black uppercase tracking-tight">{loadingMessage}</p>
          </div>
        </div>
      )}
    </div>
  );
}

const UserStatusModal = ({ user, onClose }: { user: User, onClose: () => void }) => {
  const [status, setStatus] = useState(user.today_status);
  const [note, setNote] = useState(user.scheduled_status || '');
  const [loading, setLoading] = useState(false);

  const handleUpdate = async () => {
    try {
      setLoading(true);
      const userRef = doc(db, 'users', user.id);
      await updateDoc(userRef, {
        today_status: status,
        scheduled_status: note,
        updated_at: new Date().toISOString()
      });
      onClose();
    } catch (error) {
      console.error("상태 업데이트 실패:", error);
      alert("상태 수정 권한이 없거나 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-lg rounded-[3rem] shadow-2xl overflow-hidden border border-gray-100">
        <div className="p-10 border-b border-gray-50 flex items-center justify-between bg-indigo-600">
          <h3 className="text-2xl font-black text-white tracking-tighter uppercase">{user.name} 근태 정보 수정</h3>
          <button onClick={onClose} className="text-white/50 hover:text-white transition-colors"><X size={24} /></button>
        </div>
        <div className="p-10 space-y-8">
          <div className="space-y-4">
            <label className="text-xs font-black text-gray-300 uppercase tracking-[0.3em] block ml-1">현재 상태</label>
            <div className="flex flex-wrap gap-2">
              {['근무', '재택', '회의', '외근', '휴가'].map(s => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`px-6 py-3 rounded-2xl text-xs font-black transition-all border-2 ${status === s
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg'
                    : 'bg-white border-gray-100 text-gray-400 hover:border-indigo-100'}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-4">
            <label className="text-xs font-black text-gray-300 uppercase tracking-[0.3em] block ml-1">예정 계획 / 특이사항</label>
            <input
              className="w-full px-8 py-5 bg-gray-50 border-transparent border focus:border-indigo-100 rounded-2xl focus:ring-4 focus:ring-indigo-500/5 font-bold outline-none shadow-inner transition-all"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="예) 오후 2시 반차 예정, 신사동 외근 등"
            />
          </div>
        </div>
        <div className="p-10 bg-gray-50 flex justify-end gap-4">
          <Button variant="ghost" onClick={onClose} className="px-10 py-4">취소</Button>
          <Button onClick={handleUpdate} disabled={loading} className="px-12 py-4 shadow-indigo-200">
            {loading ? '저장 중...' : '데이터 업데이트'}
          </Button>
        </div>
      </div>
    </div>
  );
};
