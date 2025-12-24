
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, LayoutDashboard, Target, Layers, ChevronRight, CheckCircle2, Circle, Clock, Sparkles, Trash2, ArrowLeft, CheckSquare, Search, Filter, X, Edit2, Check, XCircle, Calendar, AlignLeft, AlertCircle, Briefcase, Inbox, Send, Kanban, List as ListIcon } from 'lucide-react';
import { Project, Goal, ProjectStatus, GoalStatus, GoalPriority } from './types';
import { getProjectRoadmap } from './geminiService';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';

type ViewMode = 'dashboard' | 'projects' | 'tasks' | 'kanban';

// Robust UUID generation for non-secure contexts
const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

const App: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>(() => {
    const saved = localStorage.getItem('ps_projects');
    const initialProjects = saved ? JSON.parse(saved) : [];
    if (initialProjects.length === 0) {
      return [{
        id: 'inbox-project',
        title: 'Inbox',
        description: 'General tasks and quick thoughts.',
        category: 'Personal',
        status: ProjectStatus.ACTIVE,
        goals: [],
        createdAt: new Date().toISOString()
      }];
    }
    return initialProjects;
  });
  
  const [activeView, setActiveView] = useState<ViewMode>('dashboard');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Local view toggle within Project detail
  const [projectDetailView, setProjectDetailView] = useState<'list' | 'kanban'>('list');

  // Task specific UI state
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const quickAddInputRef = useRef<HTMLInputElement>(null);
  
  // Filtering state
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [priorityFilter, setPriorityFilter] = useState<string>('All');

  useEffect(() => {
    localStorage.setItem('ps_projects', JSON.stringify(projects));
  }, [projects]);

  const selectedProject = useMemo(() => 
    projects.find(p => p.id === selectedProjectId), 
    [projects, selectedProjectId]
  );

  const categories = useMemo(() => {
    const cats = new Set(projects.map(p => p.category));
    return ['All', ...Array.from(cats)];
  }, [projects]);

  const allGoals = useMemo(() => {
    return projects.flatMap(p => p.goals.map(g => ({ ...g, projectTitle: p.title })));
  }, [projects]);

  const stats = useMemo(() => {
    const totalGoals = allGoals.length;
    const completedGoals = allGoals.filter(g => g.status === GoalStatus.COMPLETED).length;
    const completionRate = totalGoals ? Math.round((completedGoals / totalGoals) * 100) : 0;
    
    return {
      totalProjects: projects.length,
      activeProjects: projects.filter(p => p.status === ProjectStatus.ACTIVE).length,
      totalGoals,
      completionRate
    };
  }, [projects, allGoals]);

  const chartData = useMemo(() => {
    return projects.map(p => ({
      name: p.title.length > 10 ? p.title.substring(0, 10) + '...' : p.title,
      completed: p.goals.filter(g => g.status === GoalStatus.COMPLETED).length,
      total: p.goals.length || 1,
    }));
  }, [projects]);

  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      const matchesSearch = p.title.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'All' || p.status === statusFilter;
      const matchesCategory = categoryFilter === 'All' || p.category === categoryFilter;
      return matchesSearch && matchesStatus && matchesCategory;
    });
  }, [projects, searchQuery, statusFilter, categoryFilter]);

  const handleSaveProject = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const title = formData.get('title') as string;
    const description = formData.get('description') as string;
    const category = formData.get('category') as string;
    const status = formData.get('status') as ProjectStatus;
    const deadline = formData.get('deadline') as string;

    if (editingProject) {
      setProjects(prev => prev.map(p => 
        p.id === editingProject.id 
          ? { ...p, title, description, category, status, deadline } 
          : p
      ));
    } else {
      const newProject: Project = {
        id: generateId(),
        title,
        description,
        category,
        status: ProjectStatus.ACTIVE,
        goals: [],
        deadline,
        createdAt: new Date().toISOString()
      };
      setProjects([...projects, newProject]);
    }
    
    setIsModalOpen(false);
    setEditingProject(null);
  };

  const handleAddGoal = (projectId: string, title: string, description: string = "", dueDate?: string, priority: GoalPriority = GoalPriority.MEDIUM) => {
    if (!title.trim() || !projectId) return;
    
    const newGoal: Goal = {
      id: generateId(),
      projectId,
      title,
      description,
      status: GoalStatus.PENDING,
      priority,
      dueDate
    };
    
    setProjects(prev => prev.map(p => 
      p.id === projectId ? { ...p, goals: [newGoal, ...p.goals] } : p
    ));
    
    setIsAddingTask(false);
    setEditingGoalId(null);
  };

  const updateGoal = (projectId: string, goalId: string, updates: Partial<Goal>) => {
    setProjects(prev => {
      let originalGoal: Goal | undefined;
      for (const p of prev) {
        const found = p.goals.find(g => g.id === goalId);
        if (found) {
          originalGoal = found;
          break;
        }
      }

      if (!originalGoal) return prev;

      if (updates.projectId && updates.projectId !== projectId) {
        return prev.map(p => {
          if (p.id === projectId) {
            return { ...p, goals: p.goals.filter(g => g.id !== goalId) };
          }
          if (p.id === updates.projectId) {
            return { ...p, goals: [{ ...originalGoal, ...updates } as Goal, ...p.goals] };
          }
          return p;
        });
      }

      return prev.map(p => {
        if (p.id === projectId) {
          return {
            ...p,
            goals: p.goals.map(g => g.id === goalId ? { ...g, ...updates } : g)
          };
        }
        return p;
      });
    });
    setEditingGoalId(null);
  };

  const toggleGoalStatus = (projectId: string, goalId: string) => {
    setProjects(prev => prev.map(p => {
      if (p.id === projectId) {
        return {
          ...p,
          goals: p.goals.map(g => g.id === goalId ? {
            ...g,
            status: g.status === GoalStatus.COMPLETED ? GoalStatus.PENDING : GoalStatus.COMPLETED
          } : g)
        };
      }
      return p;
    }));
  };

  // Improved, foolproof delete goal function
  const deleteGoal = (goalId: string) => {
    // Immediate state update for snappy feel
    setProjects(prev => prev.map(p => ({
      ...p,
      goals: p.goals.filter(g => g.id !== goalId)
    })));
    setEditingGoalId(null);
  };

  const deleteProject = (id: string) => {
    if (id === 'inbox-project') {
      alert("The Inbox project cannot be deleted.");
      return;
    }
    if (!confirm('Delete project and all its tasks?')) return;
    setProjects(projects.filter(p => p.id !== id));
    if (selectedProjectId === id) setSelectedProjectId(null);
  };

  const runAiDecomposition = async (project: Project) => {
    setAiLoading(true);
    try {
      const recommendation = await getProjectRoadmap(project.title, project.description);
      const newGoals: Goal[] = recommendation.suggestedGoals.map(sg => ({
        id: generateId(),
        projectId: project.id,
        title: sg.title,
        description: sg.description,
        status: GoalStatus.PENDING,
        priority: sg.priority || GoalPriority.MEDIUM
      }));
      setProjects(prev => prev.map(p => p.id === project.id ? { ...p, goals: [...newGoals, ...p.goals] } : p));
    } catch (err) {
      alert("AI failed to generate goals. Please check your API key.");
    } finally {
      setAiLoading(false);
    }
  };

  const resetFilters = () => {
    setStatusFilter('All');
    setCategoryFilter('All');
    setPriorityFilter('All');
    setSearchQuery('');
    setEditingGoalId(null);
    setIsAddingTask(false);
  };

  const openEditProjectModal = (project: Project) => {
    setEditingProject(project);
    setIsModalOpen(true);
  };

  const getPriorityColor = (priority: GoalPriority) => {
    switch (priority) {
      case GoalPriority.HIGH: return 'text-rose-600 bg-rose-50 border-rose-100';
      case GoalPriority.MEDIUM: return 'text-amber-600 bg-amber-50 border-amber-100';
      case GoalPriority.LOW: return 'text-slate-500 bg-slate-50 border-slate-100';
      default: return 'text-slate-500 bg-slate-50 border-slate-100';
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden">
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col hidden md:flex shadow-sm">
        <div className="p-6 flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <Target className="text-white w-5 h-5" />
          </div>
          <span className="font-bold text-xl tracking-tight text-slate-800">ProjectSync</span>
        </div>
        
        <nav className="flex-1 px-4 space-y-1">
          <SidebarItem 
            icon={<LayoutDashboard className="w-5 h-5" />} 
            label="Dashboard" 
            active={activeView === 'dashboard'} 
            onClick={() => { setActiveView('dashboard'); setSelectedProjectId(null); resetFilters(); }} 
          />
          <SidebarItem 
            icon={<Layers className="w-5 h-5" />} 
            label="Projects" 
            active={activeView === 'projects'} 
            onClick={() => { setActiveView('projects'); setSelectedProjectId(null); resetFilters(); }} 
          />
          <SidebarItem 
            icon={<CheckSquare className="w-5 h-5" />} 
            label="Tasks" 
            active={activeView === 'tasks'} 
            onClick={() => { setActiveView('tasks'); setSelectedProjectId(null); resetFilters(); }} 
          />
          <SidebarItem 
            icon={<Kanban className="w-5 h-5" />} 
            label="Board" 
            active={activeView === 'kanban'} 
            onClick={() => { setActiveView('kanban'); setSelectedProjectId(null); resetFilters(); }} 
          />
        </nav>

        <div className="p-4 border-t border-slate-100">
          <button 
            onClick={() => { setEditingProject(null); setIsModalOpen(true); }}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium flex items-center justify-center gap-2 transition-all shadow-md shadow-indigo-100"
          >
            <Plus className="w-5 h-5" />
            New Project
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-slate-200 px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-slate-800">
              {selectedProjectId ? 'Project View' : activeView === 'kanban' ? 'Task Board' : activeView.charAt(0).toUpperCase() + activeView.slice(1)}
            </h1>
          </div>
          <div className="flex items-center gap-4 w-1/3">
             <div className="relative w-full">
               <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
               <input 
                type="text" 
                placeholder="Search anything..." 
                className="w-full pl-10 pr-4 py-2 bg-slate-100 border-transparent focus:bg-white focus:ring-2 focus:ring-indigo-500 rounded-full text-sm outline-none transition-all"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
               />
             </div>
          </div>
        </header>

        <div className="p-8 max-w-7xl mx-auto space-y-8">
          {activeView === 'dashboard' && !selectedProjectId && (
            <DashboardView 
              stats={stats} 
              chartData={chartData} 
              recentProjects={projects.slice(0, 3)} 
              onSelectProject={(id) => { setSelectedProjectId(id); setActiveView('projects'); }}
            />
          )}

          {activeView === 'kanban' && !selectedProjectId && (
            <div className="space-y-6">
               <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                   <h2 className="text-2xl font-bold">Global Task Board</h2>
                   <p className="text-sm text-slate-500">Visualize tasks across all your ongoing projects.</p>
                </div>
              </div>
              <KanbanBoard 
                goals={allGoals.filter(g => g.title.toLowerCase().includes(searchQuery.toLowerCase()))}
                onStatusChange={updateGoal}
                onEditGoal={setEditingGoalId}
                onDeleteGoal={deleteGoal}
              />
            </div>
          )}

          {activeView === 'tasks' && !selectedProjectId && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                   <h2 className="text-2xl font-bold">Unified Task List</h2>
                   <p className="text-sm text-slate-500">Manage all your short-term goals across projects.</p>
                </div>
                <div className="flex items-center gap-3">
                   <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm">
                    <Filter className="w-3.5 h-3.5 text-slate-400" />
                    <select 
                      value={priorityFilter}
                      onChange={(e) => setPriorityFilter(e.target.value)}
                      className="text-xs font-bold uppercase tracking-widest text-slate-600 outline-none bg-transparent cursor-pointer"
                    >
                      <option value="All">Priority: All</option>
                      {Object.values(GoalPriority).map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                  <button 
                    onClick={() => {
                      setIsAddingTask(true);
                      setTimeout(() => quickAddInputRef.current?.focus(), 100);
                    }}
                    className="px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl font-bold flex items-center gap-2 transition-all shadow-md shadow-indigo-100"
                  >
                    <Plus className="w-5 h-5" /> Add Task
                  </button>
                </div>
              </div>

              {/* Quick Add To-Do Entry */}
              <QuickTaskEntry 
                projects={projects} 
                onSave={handleAddGoal} 
                inputRef={quickAddInputRef}
                isExpanded={isAddingTask}
                onCancel={() => setIsAddingTask(false)}
                onExpand={() => setIsAddingTask(true)}
              />

              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="divide-y divide-slate-100">
                  {allGoals.length === 0 ? (
                    <div className="p-20 text-center flex flex-col items-center gap-4">
                        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-300">
                           <Target className="w-8 h-8" />
                        </div>
                        <p className="text-slate-400 italic font-medium">No tasks found. Use the quick add bar to start your list!</p>
                    </div>
                  ) : (
                    allGoals
                      .filter(g => {
                        const matchesSearch = g.title.toLowerCase().includes(searchQuery.toLowerCase());
                        const matchesPriority = priorityFilter === 'All' || g.priority === priorityFilter;
                        return matchesSearch && matchesPriority;
                      })
                      .map(goal => (
                      editingGoalId === goal.id ? (
                        <div key={goal.id} className="p-6 bg-indigo-50/30">
                          <InlineTaskForm 
                             projects={projects}
                             initialData={goal}
                             onSave={(data) => updateGoal(goal.projectId, goal.id, data)}
                             onCancel={() => setEditingGoalId(null)}
                             onDelete={() => deleteGoal(goal.id)}
                          />
                        </div>
                      ) : (
                        <div key={goal.id} className="p-6 hover:bg-slate-50 transition-colors flex items-start justify-between group">
                          <div className="flex items-start gap-4">
                            <button 
                              onClick={() => toggleGoalStatus(goal.projectId, goal.id)}
                              className={`mt-1 ${goal.status === GoalStatus.COMPLETED ? 'text-indigo-600' : 'text-slate-300 hover:text-indigo-400'} transition-all`}
                            >
                              {goal.status === GoalStatus.COMPLETED ? <CheckCircle2 className="w-6 h-6" /> : <Circle className="w-6 h-6" />}
                            </button>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className={`font-semibold text-lg ${goal.status === GoalStatus.COMPLETED ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                                  {goal.title}
                                  </h4>
                                  <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest border ${getPriorityColor(goal.priority)}`}>
                                      {goal.priority}
                                  </span>
                              </div>
                              {goal.description && <p className="text-sm text-slate-500 mt-1 max-w-2xl">{goal.description}</p>}
                              <div className="flex flex-wrap items-center gap-3 mt-3">
                                <span className="text-[10px] font-bold px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-lg uppercase tracking-wider border border-indigo-100 flex items-center gap-1">
                                  <Briefcase className="w-3 h-3" /> {goal.projectTitle}
                                </span>
                                {goal.dueDate && (
                                  <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-100">
                                    <Calendar className="w-3 h-3" /> {new Date(goal.dueDate).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                             <button 
                               onClick={() => setEditingGoalId(goal.id)}
                               className="p-2 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl opacity-100 md:opacity-0 group-hover:opacity-100 transition-all"
                             >
                               <Edit2 className="w-4 h-4" />
                             </button>
                             <button 
                               type="button"
                               onClick={(e) => { e.stopPropagation(); deleteGoal(goal.id); }}
                               className="p-2 text-rose-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl opacity-100 md:opacity-0 group-hover:opacity-100 transition-all"
                             >
                               <Trash2 className="w-4 h-4" />
                             </button>
                          </div>
                        </div>
                      )
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {activeView === 'projects' && !selectedProjectId && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h2 className="text-2xl font-bold text-slate-800">My Projects</h2>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm">
                    <Filter className="w-3.5 h-3.5 text-slate-400" />
                    <select 
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="text-xs font-bold uppercase tracking-widest text-slate-600 outline-none bg-transparent cursor-pointer"
                    >
                      <option value="All">Status: All</option>
                      {Object.values(ProjectStatus).map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm">
                    <Layers className="w-3.5 h-3.5 text-slate-400" />
                    <select 
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      className="text-xs font-bold uppercase tracking-widest text-slate-600 outline-none bg-transparent cursor-pointer"
                    >
                      {categories.map(c => (
                        <option key={c} value={c}>Category: {c}</option>
                      ))}
                    </select>
                  </div>

                  {(statusFilter !== 'All' || categoryFilter !== 'All' || searchQuery !== '') && (
                    <button 
                      onClick={resetFilters}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-rose-500 bg-rose-50 rounded-xl border border-rose-100 hover:bg-rose-100 transition-colors"
                    >
                      <X className="w-3 h-3" /> Clear Filters
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredProjects.map(p => (
                  <ProjectCard 
                    key={p.id} 
                    project={p} 
                    onClick={() => setSelectedProjectId(p.id)}
                    onDelete={() => deleteProject(p.id)}
                    onEdit={() => openEditProjectModal(p)}
                  />
                ))}
                <button 
                  onClick={() => { setEditingProject(null); setIsModalOpen(true); }}
                  className="h-full min-h-[300px] border-2 border-dashed border-slate-200 rounded-[2.5rem] flex flex-col items-center justify-center gap-2 text-slate-400 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50/30 transition-all group"
                >
                  <Plus className="w-12 h-12 group-hover:scale-110 transition-transform" />
                  <span className="font-black uppercase tracking-widest text-xs">New Project</span>
                </button>
              </div>
            </div>
          )}

          {selectedProjectId && selectedProject && (
            <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-300">
              <button 
                onClick={() => setSelectedProjectId(null)}
                className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 font-medium transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to projects
              </button>

              <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm space-y-8">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-600 text-[10px] font-black tracking-widest uppercase border border-indigo-100">
                        {selectedProject.category}
                      </span>
                      <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black tracking-widest uppercase border ${
                        selectedProject.status === ProjectStatus.ACTIVE 
                          ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                          : 'bg-slate-50 text-slate-600 border-slate-100'
                      }`}>
                        {selectedProject.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                        <h2 className="text-4xl font-extrabold text-slate-900 tracking-tight">{selectedProject.title}</h2>
                        <button 
                          onClick={() => openEditProjectModal(selectedProject)}
                          className="p-2 bg-slate-50 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                        >
                          <Edit2 className="w-5 h-5" />
                        </button>
                    </div>
                    <p className="text-slate-500 text-lg max-w-3xl leading-relaxed">{selectedProject.description}</p>
                  </div>
                  
                  <div className="flex gap-3">
                    <button 
                      onClick={() => runAiDecomposition(selectedProject)}
                      disabled={aiLoading}
                      className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl flex items-center gap-2 font-bold disabled:opacity-50 transition-all shadow-lg shadow-indigo-100 group"
                    >
                      <Sparkles className={`w-5 h-5 ${aiLoading ? 'animate-spin' : 'group-hover:rotate-12'} transition-transform`} />
                      {aiLoading ? 'Thinking...' : 'Generate Roadmap'}
                    </button>
                    <button 
                      onClick={() => deleteProject(selectedProject.id)}
                      className="p-3 bg-slate-50 text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-100 rounded-2xl transition-all"
                    >
                      <Trash2 className="w-6 h-6" />
                    </button>
                  </div>
                </div>

                <div className="pt-8 border-t border-slate-100">
                   <div className="flex items-center justify-between mb-8">
                      <div className="flex items-center gap-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                            <CheckSquare className="w-6 h-6" />
                          </div>
                          <h3 className="text-2xl font-bold text-slate-800 tracking-tight">Tasks & Milestones</h3>
                        </div>
                        <div className="flex bg-slate-100 p-1 rounded-xl">
                           <button 
                            onClick={() => setProjectDetailView('list')}
                            className={`p-2 rounded-lg flex items-center gap-2 text-xs font-bold uppercase tracking-widest transition-all ${projectDetailView === 'list' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}
                           >
                            <ListIcon className="w-4 h-4" /> List
                           </button>
                           <button 
                            onClick={() => setProjectDetailView('kanban')}
                            className={`p-2 rounded-lg flex items-center gap-2 text-xs font-bold uppercase tracking-widest transition-all ${projectDetailView === 'kanban' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}
                           >
                            <Kanban className="w-4 h-4" /> Board
                           </button>
                        </div>
                      </div>
                      <button 
                        onClick={() => {
                          setIsAddingTask(true);
                          setTimeout(() => quickAddInputRef.current?.focus(), 100);
                        }}
                        className="px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl font-bold flex items-center gap-2 transition-all shadow-md shadow-indigo-100"
                      >
                        <Plus className="w-5 h-5" /> Add Task
                      </button>
                   </div>

                   {projectDetailView === 'list' ? (
                     <>
                        <div className="mb-6">
                            <QuickTaskEntry 
                                projects={projects} 
                                initialProjectId={selectedProject.id}
                                onSave={handleAddGoal} 
                                inputRef={quickAddInputRef}
                                isExpanded={isAddingTask}
                                onCancel={() => setIsAddingTask(false)}
                                onExpand={() => setIsAddingTask(true)}
                            />
                        </div>

                        <div className="grid gap-4">
                            {selectedProject.goals.length === 0 && !isAddingTask ? (
                            <div className="py-20 text-center bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                                <Target className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                                <p className="text-slate-500 font-medium">This project has no tasks yet.</p>
                                <p className="text-slate-400 text-sm">Use the quick add bar or the AI Roadmap generator to start.</p>
                            </div>
                            ) : (
                            selectedProject.goals.sort((a,b) => {
                                if (a.status === GoalStatus.COMPLETED && b.status !== GoalStatus.COMPLETED) return 1;
                                if (a.status !== GoalStatus.COMPLETED && b.status === GoalStatus.COMPLETED) return -1;
                                const priorities = { [GoalPriority.HIGH]: 0, [GoalPriority.MEDIUM]: 1, [GoalPriority.LOW]: 2 };
                                return priorities[a.priority] - priorities[b.priority];
                            }).map(goal => (
                                editingGoalId === goal.id ? (
                                <InlineTaskForm 
                                    projects={projects}
                                    key={goal.id}
                                    initialData={goal}
                                    onSave={(data) => updateGoal(selectedProject.id, goal.id, data)}
                                    onCancel={() => setEditingGoalId(null)}
                                    onDelete={() => deleteGoal(goal.id)}
                                />
                                ) : (
                                <div 
                                    key={goal.id} 
                                    className="flex items-start justify-between p-6 rounded-3xl bg-white border border-slate-100 hover:border-indigo-200 hover:shadow-md transition-all group"
                                >
                                    <div className="flex items-start gap-5">
                                    <button 
                                        onClick={() => toggleGoalStatus(selectedProject.id, goal.id)}
                                        className={`mt-1 ${goal.status === GoalStatus.COMPLETED ? 'text-indigo-600 scale-110' : 'text-slate-200 hover:text-indigo-400'} transition-all`}
                                    >
                                        {goal.status === GoalStatus.COMPLETED ? <CheckCircle2 className="w-8 h-8" /> : <Circle className="w-8 h-8" />}
                                    </button>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h4 className={`text-xl font-bold ${goal.status === GoalStatus.COMPLETED ? 'text-slate-300 line-through' : 'text-slate-800'}`}>
                                            {goal.title}
                                            </h4>
                                            <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest border ${getPriorityColor(goal.priority)}`}>
                                                {goal.priority}
                                            </span>
                                        </div>
                                        {goal.description && <p className="text-slate-500 mt-1 max-w-2xl leading-relaxed">{goal.description}</p>}
                                        {goal.dueDate && (
                                        <div className="flex items-center gap-1.5 mt-3 text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-lg border border-amber-100 w-fit">
                                            <Calendar className="w-3.5 h-3.5" /> 
                                            {new Date(goal.dueDate).toLocaleDateString()}
                                        </div>
                                        )}
                                    </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button 
                                        onClick={() => setEditingGoalId(goal.id)}
                                        className="p-2 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl opacity-100 md:opacity-0 group-hover:opacity-100 transition-all"
                                        >
                                        <Edit2 className="w-5 h-5" />
                                        </button>
                                        <button 
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); deleteGoal(goal.id); }}
                                        className="p-2 text-rose-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl opacity-100 md:opacity-0 group-hover:opacity-100 transition-all"
                                        >
                                        <Trash2 className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                                )
                            ))
                            )}
                        </div>
                     </>
                   ) : (
                     <KanbanBoard 
                        goals={selectedProject.goals.filter(g => g.title.toLowerCase().includes(searchQuery.toLowerCase()))}
                        onStatusChange={updateGoal}
                        onEditGoal={setEditingGoalId}
                        onDeleteGoal={(_, goalId) => deleteGoal(goalId)}
                     />
                   )}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-[2rem] w-full max-w-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-10 pb-6 flex items-center justify-between">
              <div>
                <h3 className="text-3xl font-black text-slate-900 tracking-tight">{editingProject ? 'Edit Vision' : 'New Vision'}</h3>
                <p className="text-slate-500 mt-1">
                    {editingProject ? 'Update the details of your ongoing project.' : 'Define your long-term project and its scope.'}
                </p>
              </div>
              <button onClick={() => { setIsModalOpen(false); setEditingProject(null); }} className="w-10 h-10 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full transition-colors">
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </div>
            <form onSubmit={handleSaveProject} className="p-10 pt-4 space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Project Title</label>
                <input 
                  required
                  name="title"
                  autoFocus
                  defaultValue={editingProject?.title || ''}
                  placeholder="e.g. Launch New Mobile App"
                  className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-100 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all text-lg font-bold"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Ambition / Goal</label>
                <textarea 
                  required
                  name="description"
                  rows={3}
                  defaultValue={editingProject?.description || ''}
                  placeholder="What is the high-level goal you want to achieve?"
                  className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-100 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all resize-none font-medium leading-relaxed"
                />
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Category</label>
                  <select 
                    name="category"
                    defaultValue={editingProject?.category || 'Development'}
                    className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-100 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all appearance-none font-bold"
                  >
                    <option>Development</option>
                    <option>Business</option>
                    <option>Personal</option>
                    <option>Health</option>
                    <option>Lifestyle</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Target Deadline</label>
                  <input 
                    type="date" 
                    name="deadline"
                    defaultValue={editingProject?.deadline || ''}
                    className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-100 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none font-bold" 
                  />
                </div>
              </div>
              {editingProject && editingProject.id !== 'inbox-project' && (
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Status</label>
                  <select 
                    name="status"
                    defaultValue={editingProject.status}
                    className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-100 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all appearance-none font-bold text-indigo-600"
                  >
                    {Object.values(ProjectStatus).map(s => (
                        <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              )}
              <button 
                type="submit"
                className="w-full py-5 bg-indigo-600 text-white rounded-[1.5rem] font-black text-xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 flex items-center justify-center gap-3"
              >
                {editingProject ? 'Save Changes' : 'Launch Project'} <ChevronRight className="w-6 h-6" />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Shared Task Editing Modal (Only for Board View) */}
      {(activeView === 'kanban' || projectDetailView === 'kanban') && editingGoalId && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
              <div className="w-full max-w-2xl">
                <InlineTaskForm 
                    projects={projects}
                    initialData={allGoals.find(g => g.id === editingGoalId)}
                    onSave={(data) => {
                        const goal = allGoals.find(g => g.id === editingGoalId);
                        if (goal) updateGoal(goal.projectId, goal.id, data);
                    }}
                    onCancel={() => setEditingGoalId(null)}
                    onDelete={() => deleteGoal(editingGoalId)}
                />
              </div>
          </div>
      )}
    </div>
  );
};

/**
 * Kanban Board Component
 */
const KanbanBoard: React.FC<{
  goals: Goal[],
  onStatusChange: (projectId: string, goalId: string, updates: Partial<Goal>) => void,
  onEditGoal: (id: string) => void,
  onDeleteGoal: (projectId: string, id: string) => void
}> = ({ goals, onStatusChange, onEditGoal, onDeleteGoal }) => {
  const columns: { title: string, status: GoalStatus, color: string }[] = [
    { title: 'Pending', status: GoalStatus.PENDING, color: 'bg-slate-100 border-slate-200' },
    { title: 'In Progress', status: GoalStatus.IN_PROGRESS, color: 'bg-indigo-50 border-indigo-100' },
    { title: 'Completed', status: GoalStatus.COMPLETED, color: 'bg-emerald-50 border-emerald-100' }
  ];

  const handleDragStart = (e: React.DragEvent, goalId: string, projectId: string) => {
    e.dataTransfer.setData('goalId', goalId);
    e.dataTransfer.setData('projectId', projectId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = (e: React.DragEvent, status: GoalStatus) => {
    e.preventDefault();
    const goalId = e.dataTransfer.getData('goalId');
    const projectId = e.dataTransfer.getData('projectId');
    if (goalId && projectId) {
      onStatusChange(projectId, goalId, { status });
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  return (
    <div className="flex gap-6 overflow-x-auto pb-6 min-h-[600px] animate-in fade-in duration-500">
      {columns.map(col => {
        const colGoals = goals.filter(g => g.status === col.status);
        return (
          <div 
            key={col.status}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, col.status)}
            className={`flex-1 min-w-[320px] rounded-[2rem] border p-4 flex flex-col gap-4 ${col.color}`}
          >
            <div className="flex items-center justify-between px-4 py-2">
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">{col.title}</h3>
              <span className="bg-white px-2 py-0.5 rounded-lg text-[10px] font-black border border-slate-200 text-slate-500">
                {colGoals.length}
              </span>
            </div>
            
            <div className="flex-1 space-y-4">
              {colGoals.length === 0 && (
                <div className="h-full border-2 border-dashed border-slate-200 rounded-3xl flex items-center justify-center p-8 text-center">
                  <p className="text-xs font-medium text-slate-400">Drag tasks here</p>
                </div>
              )}
              {colGoals.map(goal => (
                <div 
                  key={goal.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, goal.id, goal.projectId)}
                  className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all cursor-grab active:cursor-grabbing group"
                >
                  <div className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest border ${getPriorityColorKanban(goal.priority)}`}>
                        {goal.priority}
                      </span>
                      <div className="flex gap-1 opacity-100 group-hover:opacity-100 transition-all">
                        <button 
                          type="button"
                          onClick={() => onEditGoal(goal.id)}
                          className="p-1 text-slate-400 hover:text-indigo-600 transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onDeleteGoal(goal.projectId, goal.id); }}
                          className="p-1 text-rose-300 hover:text-rose-600 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <h4 className={`font-bold text-slate-800 group-hover:text-indigo-600 transition-colors ${goal.status === GoalStatus.COMPLETED ? 'line-through text-slate-400' : ''}`}>
                      {goal.title}
                    </h4>
                    {goal.description && (
                      <p className="text-xs text-slate-500 line-clamp-2">{goal.description}</p>
                    )}
                    {(goal.dueDate || (goal as any).projectTitle) && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {(goal as any).projectTitle && (
                          <span className="text-[9px] font-bold text-indigo-400 flex items-center gap-1">
                            <Briefcase className="w-2.5 h-2.5" /> {(goal as any).projectTitle}
                          </span>
                        )}
                        {goal.dueDate && (
                          <span className="text-[9px] font-bold text-amber-500 flex items-center gap-1">
                            <Calendar className="w-2.5 h-2.5" /> {new Date(goal.dueDate).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const getPriorityColorKanban = (priority: GoalPriority) => {
  switch (priority) {
    case GoalPriority.HIGH: return 'text-rose-600 bg-rose-50 border-rose-100';
    case GoalPriority.MEDIUM: return 'text-amber-600 bg-amber-50 border-amber-100';
    case GoalPriority.LOW: return 'text-slate-500 bg-slate-50 border-slate-100';
    default: return 'text-slate-500 bg-slate-50 border-slate-100';
  }
};

/**
 * A sleek To-Do style entry bar for quick task addition
 */
const QuickTaskEntry: React.FC<{
    projects: Project[],
    initialProjectId?: string,
    onSave: (projectId: string, title: string, description: string, dueDate: string, priority: GoalPriority) => void,
    inputRef: React.RefObject<HTMLInputElement>,
    isExpanded: boolean,
    onCancel: () => void,
    onExpand: () => void
}> = ({ projects, initialProjectId, onSave, inputRef, isExpanded, onCancel, onExpand }) => {
    const [title, setTitle] = useState('');
    const [projectId, setProjectId] = useState(initialProjectId || projects[0]?.id || '');
    const [dueDate, setDueDate] = useState('');
    const [priority, setPriority] = useState<GoalPriority>(GoalPriority.MEDIUM);

    useEffect(() => {
        if (initialProjectId) setProjectId(initialProjectId);
    }, [initialProjectId]);

    const handleQuickSave = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!title.trim() || !projectId) return;
        onSave(projectId, title, '', dueDate, priority);
        setTitle('');
        setDueDate('');
        setPriority(GoalPriority.MEDIUM);
    };

    if (isExpanded) {
        return (
            <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                <InlineTaskForm 
                    projects={projects}
                    initialData={{ projectId, priority }}
                    onSave={(data) => {
                        onSave(data.projectId!, data.title, data.description || '', data.dueDate || '', data.priority);
                        onCancel();
                    }}
                    onCancel={onCancel}
                />
            </div>
        );
    }

    return (
        <form onSubmit={handleQuickSave} className="relative group animate-in fade-in duration-500">
            <div className="bg-white rounded-3xl border border-slate-200 p-2 pl-6 flex items-center gap-4 focus-within:ring-4 focus-within:ring-indigo-500/10 focus-within:border-indigo-400 transition-all shadow-sm">
                <div className="w-6 h-6 text-slate-300">
                    <Inbox className="w-full h-full" />
                </div>
                <input 
                    ref={inputRef}
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Add a task to list... (Press Enter to quick save)"
                    className="flex-1 bg-transparent border-none outline-none font-medium text-slate-700 placeholder:text-slate-300 py-3"
                />
                
                <div className="flex items-center gap-1 pr-2">
                    <button 
                        type="button"
                        onClick={onExpand}
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                        title="Add more details"
                    >
                        <AlignLeft className="w-5 h-5" />
                    </button>
                    <button 
                        type="submit"
                        disabled={!title.trim()}
                        className="p-2.5 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-300 transition-all shadow-md shadow-indigo-100"
                    >
                        <Send className="w-5 h-5" />
                    </button>
                </div>
            </div>
            {!title.trim() && (
                <div className="absolute top-full left-6 mt-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
                    Quick Add to {projects.find(p => p.id === projectId)?.title || 'Inbox'}
                </div>
            )}
        </form>
    );
};

const InlineTaskForm: React.FC<{ 
  initialData?: Partial<Goal>, 
  projects?: Project[],
  onSave: (data: { title: string, description: string, dueDate?: string, priority: GoalPriority, projectId?: string }) => void, 
  onCancel: () => void,
  onDelete?: () => void
}> = ({ initialData, projects = [], onSave, onCancel, onDelete }) => {
  const [title, setTitle] = useState(initialData?.title || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [dueDate, setDueDate] = useState(initialData?.dueDate || '');
  const [priority, setPriority] = useState<GoalPriority>(initialData?.priority || GoalPriority.MEDIUM);
  const [projectId, setProjectId] = useState(initialData?.projectId || (projects.length > 0 ? projects[0].id : ''));
  
  const handleSave = () => {
    if (!title.trim()) return;
    const finalProjectId = projectId || (projects.length > 0 ? projects[0].id : undefined);
    onSave({ title, description, dueDate, priority, projectId: finalProjectId });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      handleSave();
    }
  };

  return (
    <div className="p-8 rounded-[2rem] bg-indigo-50 border border-indigo-200 animate-in fade-in slide-in-from-top-2 duration-300 shadow-xl shadow-indigo-100/50 space-y-6">
      <div className="flex items-start gap-4">
        <div className="mt-1.5 p-2 bg-indigo-100 text-indigo-600 rounded-xl">
          <CheckSquare className="w-6 h-6" />
        </div>
        <div className="flex-1 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <input 
                autoFocus
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.ctrlKey && handleSave()}
                placeholder="What's the task title?"
                className="w-full bg-transparent border-none outline-none font-black text-2xl text-indigo-900 placeholder:text-indigo-300"
            />
            {onDelete && (
                <button 
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onDelete(); }}
                  className="p-2.5 text-rose-400 hover:text-rose-600 hover:bg-rose-100 rounded-2xl transition-all flex items-center gap-2"
                  title="Delete Task"
                >
                  <Trash2 className="w-6 h-6" />
                  <span className="text-xs font-bold uppercase hidden sm:inline">Delete</span>
                </button>
            )}
          </div>
          
          <div className="space-y-4">
            {projects.length > 0 && (
              <div className="flex items-center gap-3 text-indigo-400 focus-within:text-indigo-600 transition-colors">
                <Briefcase className="w-5 h-5" />
                <select 
                   value={projectId}
                   onChange={(e) => setProjectId(e.target.value)}
                   className="bg-transparent border-none outline-none text-sm font-bold text-indigo-800 cursor-pointer"
                >
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>Project: {p.title}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-start gap-3 text-indigo-400 focus-within:text-indigo-600 transition-colors">
              <AlignLeft className="w-5 h-5 mt-1" />
              <textarea 
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Add more details about this task..."
                rows={2}
                className="w-full bg-transparent border-none outline-none text-sm font-medium text-indigo-800 placeholder:text-indigo-300 resize-none leading-relaxed"
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center gap-3 text-indigo-400 focus-within:text-indigo-600 transition-colors">
                    <Calendar className="w-5 h-5" />
                    <input 
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className="bg-transparent border-none outline-none text-sm font-bold text-indigo-800 cursor-pointer"
                    />
                </div>

                <div className="flex items-center gap-3 text-indigo-400 focus-within:text-indigo-600 transition-colors">
                    <AlertCircle className="w-5 h-5" />
                    <select 
                        value={priority}
                        onChange={(e) => setPriority(e.target.value as GoalPriority)}
                        className="bg-transparent border-none outline-none text-sm font-bold text-indigo-800 cursor-pointer appearance-none"
                    >
                        {Object.values(GoalPriority).map(p => (
                            <option key={p} value={p}>Priority: {p.charAt(0).toUpperCase() + p.slice(1)}</option>
                        ))}
                    </select>
                </div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="flex items-center justify-end gap-3 pt-2">
        <button 
          type="button"
          onClick={onCancel}
          className="px-6 py-2.5 bg-white text-slate-400 rounded-xl hover:text-rose-500 font-bold transition-all border border-indigo-100 flex items-center gap-2"
        >
          <XCircle className="w-5 h-5" /> Cancel
        </button>
        <button 
          type="button"
          onClick={handleSave}
          disabled={!title.trim() || (projects.length > 0 && !projectId && !initialData?.projectId)}
          className="px-8 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-black transition-all shadow-lg shadow-indigo-200 disabled:opacity-50 flex items-center gap-2"
        >
          <Check className="w-5 h-5" /> Save Task
        </button>
      </div>
    </div>
  );
};

const DashboardView: React.FC<{ 
  stats: any, 
  chartData: any[], 
  recentProjects: Project[], 
  onSelectProject: (id: string) => void 
}> = ({ stats, chartData, recentProjects, onSelectProject }) => (
  <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      <StatCard label="Total Projects" value={stats.totalProjects} icon={<Layers className="w-6 h-6" />} color="bg-indigo-50 text-indigo-600 border-indigo-100" />
      <StatCard label="Active" value={stats.activeProjects} icon={<Clock className="w-6 h-6" />} color="bg-emerald-50 text-emerald-600 border-emerald-100" />
      <StatCard label="Total Tasks" value={stats.totalGoals} icon={<Target className="w-6 h-6" />} color="bg-amber-50 text-amber-600 border-amber-100" />
      <StatCard label="Success Rate" value={`${stats.completionRate}%`} icon={<CheckCircle2 className="w-6 h-6" />} color="bg-violet-50 text-violet-600 border-violet-100" />
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
      <div className="lg:col-span-2 bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col">
        <h3 className="text-2xl font-black text-slate-800 mb-8 tracking-tight">Progress Momentum</h3>
        <div className="flex-1 min-h-[350px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12, fontWeight: 700}} />
              <YAxis hide />
              <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '20px', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.15)', padding: '15px'}} />
              <Bar dataKey="completed" fill="#4f46e5" radius={[10, 10, 10, 10]} barSize={45} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      
      <div className="bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col">
        <h3 className="text-2xl font-black text-slate-800 mb-8 tracking-tight">Current Focus</h3>
        <div className="flex-1 space-y-5">
          {recentProjects.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-300">
              <Layers className="w-12 h-12 mb-3 opacity-20" />
              <p className="text-sm font-bold italic uppercase tracking-widest">No Active Projects</p>
            </div>
          ) : (
            recentProjects.map(p => (
              <div 
                key={p.id} 
                onClick={() => onSelectProject(p.id)}
                className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100 hover:border-indigo-200 cursor-pointer transition-all group hover:bg-white hover:shadow-lg"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-white border border-slate-100 text-indigo-600 flex items-center justify-center font-black text-xl shadow-sm group-hover:bg-indigo-600 group-hover:text-white transition-all">
                    {p.title[0]}
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800">{p.title}</h4>
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest">{p.goals.length} Milestones</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all" />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  </div>
);

const ProjectCard: React.FC<{ 
  project: Project, 
  onClick: () => void,
  onDelete: () => void,
  onEdit: () => void
}> = ({ project, onClick, onDelete, onEdit }) => {
  const completedCount = project.goals.filter(g => g.status === GoalStatus.COMPLETED).length;
  const progress = project.goals.length ? Math.round((completedCount / project.goals.length) * 100) : 0;

  return (
    <div 
      className="bg-white rounded-[2rem] p-8 border border-slate-200 shadow-sm hover:shadow-2xl hover:border-indigo-100 transition-all cursor-pointer group flex flex-col justify-between h-[300px]"
      onClick={onClick}
    >
      <div>
        <div className="flex justify-between items-start mb-6">
          <span className="px-2.5 py-1 rounded-lg bg-slate-50 text-slate-500 text-[9px] font-black tracking-widest uppercase border border-slate-100">
            {project.category}
          </span>
          <div className="flex gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-all">
            <button 
              type="button"
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="p-2 rounded-xl text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
            >
              <Edit2 className="w-5 h-5" />
            </button>
            <button 
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="p-2 rounded-xl text-rose-300 hover:text-rose-600 hover:bg-rose-50 transition-all"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        </div>
        <h3 className="text-2xl font-black text-slate-900 group-hover:text-indigo-600 transition-colors leading-tight mb-3">{project.title}</h3>
        <p className="text-slate-500 text-sm font-medium line-clamp-2 leading-relaxed">{project.description}</p>
      </div>

      <div className="space-y-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-widest">
            <span className="text-slate-400">Progress</span>
            <span className="text-indigo-600">{progress}%</span>
          </div>
          <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner">
            <div 
              className="h-full bg-indigo-600 rounded-full transition-all duration-1000 ease-out shadow-sm shadow-indigo-200"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        <div className="flex items-center justify-between">
           <div className="flex -space-x-2">
              {[...Array(Math.min(3, project.goals.length || 0))].map((_, i) => (
                <div key={i} className="w-7 h-7 rounded-full bg-indigo-50 border-2 border-white flex items-center justify-center">
                  <Target className="w-3 h-3 text-indigo-400" />
                </div>
              ))}
              {project.goals.length > 3 && (
                <div className="w-7 h-7 rounded-full bg-slate-50 border-2 border-white flex items-center justify-center text-[10px] font-bold text-slate-400">
                  +{project.goals.length - 3}
                </div>
              )}
           </div>
           <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            {project.goals.length} Tasks
           </span>
        </div>
      </div>
    </div>
  );
};

const StatCard: React.FC<{ label: string, value: string | number, icon: React.ReactNode, color: string }> = ({ label, value, icon, color }) => (
  <div className="bg-white p-7 rounded-[2rem] border border-slate-200 shadow-sm flex items-center gap-5 hover:shadow-lg transition-all hover:border-indigo-100 group">
    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border transition-all group-hover:scale-110 ${color}`}>
      {icon}
    </div>
    <div>
      <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
      <h4 className="text-3xl font-black text-slate-900 tracking-tight">{value}</h4>
    </div>
  </div>
);

const SidebarItem: React.FC<{ icon: React.ReactNode, label: string, active?: boolean, onClick: () => void }> = ({ icon, label, active, onClick }) => (
  <button 
    onClick={onClick}
    className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all ${
      active 
        ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-100 translate-x-1' 
        : 'text-slate-400 hover:bg-slate-50 hover:text-slate-900'
    }`}
  >
    <div className={`${active ? 'text-white' : 'text-slate-400'}`}>
      {icon}
    </div>
    <span>{label}</span>
  </button>
);

export default App;
