'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS, type ProjectStatus } from '@/types';
import { SettingsDialog } from '@/components/settings-dialog';

type ProjectSummary = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  plan: { id: string; version: number } | null;
  _count: { conversations: number; commits: number; contextLogs: number };
};

export default function DashboardPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchProjects();
  }, []);

  async function readJsonSafe(response: Response): Promise<Record<string, unknown> | null> {
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  async function fetchProjects() {
    setLoading(true);
    try {
      const res = await fetch('/api/projects', { cache: 'no-store', next: { revalidate: 0 } });
      const data = await readJsonSafe(res);
      if (!res.ok) {
        throw new Error(
          (typeof data?.error === 'string' ? data.error : null) ||
            `Failed to fetch projects (${res.status})`
        );
      }
      setProjects(Array.isArray(data?.projects) ? (data.projects as ProjectSummary[]) : []);
    } catch (error) {
      console.error('Failed to fetch projects', error);
      setProjects([]);
    }
    setLoading(false);
  }

  async function createProject() {
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New Project', description: '' }),
    });
    const data = await readJsonSafe(res);
    const projectId =
      data && typeof data.project === 'object' && data.project !== null && 'id' in data.project
        ? (data.project as { id?: string }).id
        : undefined;
    if (!res.ok || !projectId) {
      throw new Error(
        (typeof data?.error === 'string' ? data.error : null) ||
          `Failed to create project (${res.status})`
      );
    }
    router.push(`/new?projectId=${projectId}`);
  }

  async function deleteProject(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    
    if (deletingId !== id) {
      setDeletingId(id);
      // Auto-reset the deletion confirmation after 3 seconds
      setTimeout(() => setDeletingId(null), 3000);
      return;
    }
    
    // Optimistic UI update for instant feedback
    setProjects(prev => prev.filter(p => p.id !== id));
    setDeletingId(null);
    
    try {
      await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      // Background re-sync
      const res = await fetch('/api/projects', { cache: 'no-store', next: { revalidate: 0 } });
      const data = await readJsonSafe(res);
      if (!res.ok) {
        throw new Error(
          (typeof data?.error === 'string' ? data.error : null) ||
            `Failed to re-sync projects (${res.status})`
        );
      }
      setProjects(Array.isArray(data?.projects) ? (data.projects as ProjectSummary[]) : []);
    } catch (error) {
      console.error('Failed to delete', error);
      fetchProjects(); // Revert on failure
    }
  }

  async function runTestProject() {
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test: Todo App', description: 'A test project to verify the pipeline' }),
    });
    const data = await readJsonSafe(res);
    const projectId =
      data && typeof data.project === 'object' && data.project !== null && 'id' in data.project
        ? (data.project as { id?: string }).id
        : undefined;
    if (!res.ok || !projectId) {
      throw new Error(
        (typeof data?.error === 'string' ? data.error : null) ||
          `Failed to create test project (${res.status})`
      );
    }
    router.push(`/new?projectId=${projectId}&testMode=true`);
  }

  const filtered = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.description && p.description.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="border-b border-border/40 backdrop-blur-xl bg-background/80 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center">
              <span className="text-white font-bold text-sm">⚡</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight">
              init-ai
            </h1>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              vibe planner
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSettingsOpen(true)}
              className="text-muted-foreground hover:text-foreground"
            >
              ⚙️ Settings
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">
        {/* Hero Section */}
        <div className="mb-10">
          <h2 className="text-3xl font-bold mb-2 bg-gradient-to-r from-violet-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent">
            Your Projects
          </h2>
          <p className="text-muted-foreground">
            Create AI-agent-ready project plans, export them for your favorite vibe-coding tool.
          </p>
        </div>

        {/* Actions Bar */}
        <div className="flex items-center gap-4 mb-6">
          <Input
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm bg-muted/50 border-border/50"
          />
          <Button
            onClick={createProject}
            className="bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white shadow-lg shadow-violet-500/20 transition-all duration-300 hover:shadow-violet-500/40 hover:scale-[1.02]"
          >
            ✨ New Project
          </Button>
          <Button
            onClick={runTestProject}
            variant="outline"
            className="border-violet-500/30 hover:bg-violet-500/10 transition-colors"
          >
            🧪 Test Pipeline
          </Button>
        </div>

        {/* Projects Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="border-border/30 bg-card/50 animate-pulse">
                <CardHeader><div className="h-5 bg-muted rounded w-2/3" /></CardHeader>
                <CardContent><div className="h-4 bg-muted rounded w-1/2" /></CardContent>
              </Card>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">🚀</div>
            <h3 className="text-xl font-semibold mb-2">No projects yet</h3>
            <p className="text-muted-foreground mb-6">
              Create your first AI-powered project plan
            </p>
            <Button
              onClick={createProject}
              className="bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white"
            >
              ✨ Create Project
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((project) => (
              <Card
                key={project.id}
                className="border-border/30 bg-card/50 backdrop-blur-sm hover:bg-card/80 hover:border-violet-500/30 transition-all duration-300 cursor-pointer group hover:shadow-lg hover:shadow-violet-500/5"
                onClick={() => {
                  if (project.status === 'CLARIFYING') {
                    router.push(`/new?projectId=${project.id}`);
                  } else {
                    router.push(`/project/${project.id}`);
                  }
                }}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-lg group-hover:text-violet-400 transition-colors">
                      {project.name}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="secondary"
                        className={PROJECT_STATUS_COLORS[project.status as ProjectStatus] || 'bg-muted text-muted-foreground'}
                      >
                        {PROJECT_STATUS_LABELS[project.status as ProjectStatus] || project.status}
                      </Badge>
                      <Button
                        variant={deletingId === project.id ? 'destructive' : 'ghost'}
                        size={deletingId === project.id ? 'sm' : 'icon'}
                        className={`transition-all ${
                          deletingId === project.id 
                            ? 'h-6 text-xs px-2 shadow-sm' 
                            : 'h-6 w-6 text-muted-foreground hover:text-red-400 opacity-0 group-hover:opacity-100'
                        }`}
                        onClick={(e) => deleteProject(e, project.id)}
                      >
                        {deletingId === project.id ? 'Sure?' : '✕'}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                    {project.description || 'No description'}
                  </p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>💬 {project._count.conversations}</span>
                    <span>📦 {project._count.commits}</span>
                    {project.plan && (
                      <span className="text-green-400">✅ Plan v{project.plan.version}</span>
                    )}
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground/60">
                    Updated {new Date(project.updatedAt).toLocaleDateString()}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Settings Dialog */}
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
