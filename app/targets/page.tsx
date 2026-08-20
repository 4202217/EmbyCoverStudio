'use client';

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Image from 'next/image';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  FileText,
  Folder,
  Image as ImageIcon,
  Layers,
  LayoutGrid,
  Loader2,
  Lock,
  Pause,
  Pencil,
  Play,
  Search,
  ShieldCheck,
  XCircle
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { ConfirmDialog, type ConfirmState } from '@/components/confirm-dialog';
import { api } from '@/lib/api';
import { toast } from '@/components/toast-provider';
import { cn, fmtTime } from '@/lib/utils';

type Target = {
  id: string;
  name: string;
  kind: 'library' | 'collection';
  coverUrl?: string;
  lastGeneratedAt?: string;
  lastError?: string;
  locked?: boolean;
  configured?: boolean;
  template?: string;
  pickBy?: string;
  manualItemId?: string;
  manualItemName?: string;
  itemCount?: number;
  posterSource?: string;
  collectionType?: string;
  missing?: boolean;
};

type Styles = {
  defaultPickByByStyle?: Record<string, string>;
};

type Item = { id: string; name: string; hasPrimary?: boolean };

type SyncState = {
  status?: string;
  running?: boolean;
  total?: number;
  done?: number;
  current?: string;
  updated?: number;
  failed?: number;
  unchanged?: number;
};

// 海报墙类样式（多图拼接）不支持手动/随机选图，其余单图样式支持
const isWall = (s: string) => s === 'wall-v';
// 墙类样式可用的选图依据（不支持手动/随机）
const WALL_PICKS = ['added', 'premiere'];
const wallPickBy = (v: string) => (WALL_PICKS.includes(v) ? v : 'added');

export default function TargetsPage() {
  const [targets, setTargets] = useState<Target[]>([]);
  const [styles, setStyles] = useState<Styles>({});
  const [query, setQuery] = useState('');
  const [typeF, setTypeF] = useState('all');
  const [statusF, setStatusF] = useState('all');
  const [cfgF, setCfgF] = useState('all');
  const [coverF, setCoverF] = useState('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<{ style: string; pickBy: string; manualItemId: string; manualItemName: string } | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [pickerSel, setPickerSel] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [draftLoading, setDraftLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<Target | null>(null);
  const [sync, setSync] = useState<SyncState | null>(null);
  const [forcePoll, setForcePoll] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const seenActive = useRef(false);
  const errorParamHandled = useRef(false);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = async () => {
    try {
      const [t, s] = await Promise.all([api<{ targets: Target[] }>('/api/targets'), api<Styles>('/api/styles')]);
      setTargets(t.targets);
      setStyles(s);
      // 从首页异常横幅跳转时（/targets?error=1），首次加载自动切到「有错误」筛选
      if (!errorParamHandled.current && typeof window !== 'undefined') {
        errorParamHandled.current = true;
        if (new URLSearchParams(window.location.search).get('error') === '1') {
          setCoverF('error');
        }
      }
      setSelected((sel) => {
        const ids = new Set(t.targets.map((x) => x.id));
        return new Set([...sel].filter((id) => ids.has(id)));
      });
    } catch {
      // ignore
    } finally {
      setLoaded(true);
    }
  };

  const loadSync = async () => {
    try {
      const st = await api<{ sync: SyncState }>('/api/status');
      setSync(st.sync);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    load();
    loadSync();
  }, []);

  const startSyncPolling = () => {
    seenActive.current = true;
    setForcePoll(true);
    loadSync();
  };

  // 同步进度轮询：运行/暂停中或等待启动期间每秒刷新
  useEffect(() => {
    const active = forcePoll || sync?.running || sync?.status === 'paused';
    if (!active) return;
    const timer = setInterval(loadSync, 1000);
    return () => clearInterval(timer);
  }, [forcePoll, sync]);

  // 同步结束：刷新列表并让进度卡片停留 6 秒后自动收起
  useEffect(() => {
    const isActive = !!sync?.running || sync?.status === 'paused';
    if (isActive) {
      seenActive.current = true;
      setShowDone(false);
      if (doneTimer.current) {
        clearTimeout(doneTimer.current);
        doneTimer.current = null;
      }
      return;
    }
    if (!sync || sync.status === 'idle') return;
    setForcePoll(false);
    if (!seenActive.current) return; // 页面加载时遇到旧的完成状态，不弹进度卡
    setShowDone(true);
    load();
    if (doneTimer.current) clearTimeout(doneTimer.current);
    doneTimer.current = setTimeout(() => setShowDone(false), 6000);
  }, [sync]);

  const effStyle = (t: Target) => (t.kind === 'collection' ? 'single' : t.template || 'single');
  const cfgStyle = (s: string) => (s === 'hero' ? 'single' : isWall(s) ? 'wall' : s);
  const effPick = (t: Target) => t.pickBy || styles.defaultPickByByStyle?.[`${t.kind}-${cfgStyle(effStyle(t))}`] || 'added';

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return targets
      .filter((t) => !q || t.name.toLowerCase().includes(q))
      .filter((t) => typeF === 'all' || t.kind === typeF)
      .filter((t) => statusF === 'all' || (statusF === 'locked' ? t.locked : !t.locked))
      .filter((t) => cfgF === 'all' || (cfgF === 'configured' ? t.configured : !t.configured))
      .filter((t) => coverF === 'all' || (coverF === 'generated' ? !!t.coverUrl : !!t.lastError))
      .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'library' ? -1 : 1) || a.name.localeCompare(b.name, 'zh-CN'));
  }, [targets, query, typeF, statusF, cfgF, coverF]);

  const libs = useMemo(() => visible.filter((t) => t.kind === 'library'), [visible]);
  const cols = useMemo(() => visible.filter((t) => t.kind === 'collection'), [visible]);

  const selectedSingle = selected.size === 1 ? targets.find((t) => selected.has(t.id)) ?? null : null;

  const updateTarget = async (id: string, body: Record<string, unknown>) => {
    try {
      await api(`/api/targets/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      await load();
    } catch (e: any) {
      toast('err', e.message);
    }
  };

  const generate = async (id: string) => {
    setBusy(id);
    try {
      await api(`/api/targets/${id}/generate`, { method: 'POST', body: '{}' });
      toast('ok', '封面已重新生成并上传');
      await load();
      loadSync();
    } catch (e: any) {
      toast('err', e.message);
    } finally {
      setBusy(null);
    }
  };

  const batch = async (action: string, value = '') => {
    const ids = [...selected];
    if (!ids.length) return;
    try {
      const r = await api<{ updated: number }>('/api/targets/batch', { method: 'POST', body: JSON.stringify({ ids, action, value }) });
      if (action === 'generate') toast('info', `已开始批量更新封面（${r.updated} 项）`);
      else if (action === 'reset') toast('info', `已恢复默认配置，正在重新生成封面（${r.updated} 项）`);
      else if (action === 'enable') toast('ok', `已取消锁定（${r.updated} 项）`);
      else if (action === 'disable') toast('ok', `已锁定（${r.updated} 项）`);
      await load();
      if (action === 'generate' || action === 'reset') startSyncPolling();
    } catch (e: any) {
      toast('err', e.message);
    }
  };

  const syncAll = async () => {
    toast('info', '开始同步封面，仅更新有变化的条目…');
    api('/api/sync', { method: 'POST', body: JSON.stringify({}) })
      .catch((e: any) => toast('err', e.message));
    startSyncPolling();
  };

  const syncControl = async (action: 'pause' | 'resume' | 'cancel') => {
    try {
      await api(`/api/sync/${action}`, { method: 'POST', body: '{}' });
      if (action === 'resume') {
        seenActive.current = true;
        setForcePoll(true);
      }
      loadSync();
    } catch (e: any) {
      toast('err', e.message);
    }
  };

  const openPicker = async (t: Target) => {
    const r = await api<{ items: Item[] }>(`/api/targets/${t.id}/items`);
    setItems(r.items.filter((i) => i.hasPrimary));
    setPickerSel(t.manualItemId || '');
  };

  const changed = (t: Target) => {
    if (!pending) return false;
    if (pending.style !== effStyle(t)) return true;
    if (pending.pickBy !== effPick(t)) return true;
    if (pending.pickBy === 'manual' && pending.manualItemId !== (t.manualItemId || '')) return true;
    return false;
  };

  // 修改配置后生成本地草稿预览（不推送 Emby）
  useEffect(() => {
    if (!selectedSingle || !pending) return;
    const id = selectedSingle.id;
    const timer = setTimeout(async () => {
      setDraftLoading(true);
      try {
        const body: Record<string, unknown> = { style: pending.style, pickBy: isWall(pending.style) ? wallPickBy(pending.pickBy) : pending.pickBy };
        if (body.pickBy === 'manual') {
          if (!pending.manualItemId) {
            setDraftLoading(false);
            return;
          }
          body.manualItemId = pending.manualItemId;
          body.manualItemName = pending.manualItemName;
        }
        const r = await api<{ coverUrl: string }>(`/api/targets/${id}/preview-draft`, { method: 'POST', body: JSON.stringify(body) });
        setDrafts((d) => ({ ...d, [id]: r.coverUrl }));
      } catch {
        // 预览失败时保留当前封面
      } finally {
        setDraftLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [pending, selectedSingle]);

  const saveConfig = async (t: Target) => {
    if (!pending) return;
    const style = pending.style;
    const pickBy = isWall(style) ? wallPickBy(pending.pickBy) : pending.pickBy;
    const withLock = pickBy === 'manual';
    const body: Record<string, unknown> = { template: style, pickBy, locked: withLock };
    if (pickBy === 'manual') {
      if (!pending.manualItemId) {
        toast('err', '手动选择需要先选择一部封面影片');
        return;
      }
      body.manualItemId = pending.manualItemId;
      body.manualItemName = pending.manualItemName;
    }
    try {
      await updateTarget(t.id, body);
      toast('info', withLock ? '配置已保存并锁定，正在更新封面…' : '配置已保存，正在更新封面…');
      await generate(t.id);
      setPending(null);
      setSelected(new Set());
      setDrafts({});
    } catch (e: any) {
      toast('err', `保存失败：${e.message}`);
    }
  };

  // 恢复默认配置：重置样式/选图/手动选片并重新生成封面
  const resetConfig = (t: Target) => {
    setConfirm({
      title: '恢复默认配置',
      description: '将重置该目标的封面样式与选图依据，并重新生成封面。确定要继续吗？',
      confirmText: '恢复并重新生成',
      destructive: false,
      onConfirm: async () => {
        try {
          const r = await api<{ updated: number }>('/api/targets/batch', { method: 'POST', body: JSON.stringify({ ids: [t.id], action: 'reset' }) });
          toast('info', `已恢复默认配置，正在重新生成封面（${r.updated} 项）`);
          await load();
          startSyncPolling();
          setPending(null);
          setDrafts({});
        } catch (e: any) {
          toast('err', e.message);
        }
      }
    });
  };

  const clearFilters = () => {
    setQuery('');
    setTypeF('all');
    setStatusF('all');
    setCfgF('all');
    setCoverF('all');
  };

  const hasFilters = !!(query.trim() || typeF !== 'all' || statusF !== 'all' || cfgF !== 'all' || coverF !== 'all');

  const syncLabels: Record<string, string> = { idle: '空闲', running: '进行中', paused: '已暂停', cancelled: '已取消', done: '已完成', failed: '失败' };
  const syncPct = sync?.total ? Math.round(((sync?.done || 0) / sync.total) * 100) : 0;
  const syncActive = !!sync?.running || sync?.status === 'paused';
  const syncJustDone = sync && !sync.running && sync.status !== 'idle' && sync.status !== 'paused';
  const syncVisible = syncActive || forcePoll || (syncJustDone && showDone);
  const syncStatusText = syncActive
    ? `${syncLabels[sync?.status || ''] || sync?.status} · ${sync?.done ?? 0} / ${sync?.total ?? 0}（${syncPct}%）`
    : forcePoll && !syncJustDone
      ? '准备中…'
      : syncJustDone
        ? `${syncLabels[sync?.status || ''] || sync?.status} · ${sync?.done ?? 0} / ${sync?.total ?? 0}（${syncPct}%）`
        : '';

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex flex-wrap items-center gap-2.5 text-2xl font-bold tracking-tight">
          封面管理
          <span className="inline-flex min-w-[2.75rem] items-center justify-center rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 font-mono text-xs font-normal text-primary">
            {loaded ? targets.length : '…'}
          </span>
          <button
            type="button"
            onClick={syncAll}
            className="cursor-pointer rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary transition-colors duration-150 ease-out hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
          >
            立即同步
          </button>
        </h1>
        <p className="text-sm text-muted-foreground">管理 Emby 媒体库与合集的封面生成，单选可单独配置，支持多选批量操作</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="搜索名称…" aria-label="搜索名称" value={query} onChange={(e) => setQuery(e.target.value)} className="w-56 pl-8" />
        </div>
        <FilterSelect value={typeF} onChange={setTypeF} icon={<LayoutGrid className="h-3.5 w-3.5" />} options={[
          { value: 'all', label: '全部类型', icon: <LayoutGrid className="h-3.5 w-3.5" /> },
          { value: 'library', label: '媒体库', icon: <Layers className="h-3.5 w-3.5" /> },
          { value: 'collection', label: '合集', icon: <Folder className="h-3.5 w-3.5" /> }
        ]} />
        <FilterSelect value={statusF} onChange={setStatusF} icon={<ShieldCheck className="h-3.5 w-3.5" />} options={[
          { value: 'all', label: '全部状态', icon: <ShieldCheck className="h-3.5 w-3.5" /> },
          { value: 'enabled', label: '监控中', icon: <Play className="h-3.5 w-3.5" /> },
          { value: 'locked', label: '已锁定', icon: <Lock className="h-3.5 w-3.5" /> }
        ]} />
        <FilterSelect value={cfgF} onChange={setCfgF} icon={<FileText className="h-3.5 w-3.5" />} options={[
          { value: 'all', label: '全部配置', icon: <FileText className="h-3.5 w-3.5" /> },
          { value: 'default', label: '默认配置', icon: <FileText className="h-3.5 w-3.5" /> },
          { value: 'configured', label: '手动配置', icon: <Pencil className="h-3.5 w-3.5" /> }
        ]} />
        <FilterSelect value={coverF} onChange={setCoverF} icon={<ImageIcon className="h-3.5 w-3.5" />} options={[
          { value: 'all', label: '全部封面', icon: <ImageIcon className="h-3.5 w-3.5" /> },
          { value: 'generated', label: '已生成', icon: <ImageIcon className="h-3.5 w-3.5" /> },
          { value: 'error', label: '有错误', icon: <AlertTriangle className="h-3.5 w-3.5" /> }
        ]} />
        <button className="flex cursor-pointer items-center gap-1 px-1 py-1 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground" onClick={clearFilters}>
          <XCircle aria-hidden="true" className="h-3.5 w-3.5" />
          清除筛选
        </button>
      </div>

      {syncVisible ? (
        <Card className="p-3 animate-in fade-in slide-in-from-top-2 duration-200 ease-out motion-reduce:animate-none">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">封面更新进度</span>
            <span className="text-xs text-muted-foreground">
              {syncStatusText}
              {sync?.current ? ` · 正在处理：${sync.current}` : ''}
              {sync?.failed ? ` · 失败 ${sync.failed} 个` : ''}
              {sync?.updated ? ` · 已更新 ${sync.updated} 个` : ''}
              {sync?.unchanged ? ` · 无变化 ${sync.unchanged} 个` : ''}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div
              role="progressbar"
              aria-label="封面更新进度"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={syncPct}
              className="h-full rounded-full bg-primary film-progress transition-[width] duration-500 ease-out"
              style={{ width: `${syncPct}%` }}
            />
          </div>
          <div className="mt-2.5 flex gap-2">
            {syncActive ? (
              <>
                <Button size="sm" variant="outline" onClick={() => syncControl(sync?.status === 'paused' ? 'resume' : 'pause')}>
                  {sync?.status === 'paused' ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                  {sync?.status === 'paused' ? '继续' : '暂停'}
                </Button>
                <Button size="sm" variant="destructive" onClick={() => syncControl('cancel')}>
                  取消
                </Button>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">
                {sync?.status === 'cancelled' ? '任务已取消' : sync?.status === 'failed' ? '任务失败' : '全部完成'}
              </span>
            )}
          </div>
        </Card>
      ) : null}

      <div className="sticky top-[calc(6rem+env(safe-area-inset-top))] z-20 flex flex-col gap-2 rounded-xl border border-primary/25 bg-card/95 p-2.5 shadow-pop backdrop-blur-md lg:top-2 lg:flex-row lg:items-center">
        <div className="flex items-center gap-2 text-xs">
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              className="accent-primary"
              checked={visible.length > 0 && visible.every((t) => selected.has(t.id))}
              onChange={(e) => {
                if (e.target.checked) setSelected(new Set(visible.map((t) => t.id)));
                else setSelected(new Set());
              }}
            />
            全选
          </label>
          <span className="text-muted-foreground">已选 {selected.size} 项</span>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} disabled={!selected.size}>
            清除
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Button size="sm" variant="outline" onClick={() => batch('enable')} disabled={!selected.size}>
            取消锁定
          </Button>
          <Button size="sm" variant="outline" onClick={() => batch('disable')} disabled={!selected.size}>
            锁定
          </Button>
          <Button size="sm" variant="outline" onClick={() => batch('reset')} disabled={!selected.size}>
            恢复默认配置
          </Button>
          <Button size="sm" onClick={() => batch('generate')} disabled={!selected.size}>
            更新封面
          </Button>
        </div>
      </div>

      <div className="grid gap-2 min-[1200px]:grid-cols-2">
        {!loaded ? (
          <div className="col-span-full rounded-md border bg-card p-6 text-center text-sm text-muted-foreground">加载中…</div>
        ) : !visible.length ? (
          <div className="col-span-full rounded-md border bg-card p-8 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted/50">
              <ImageIcon className="h-6 w-6 text-muted-foreground/50" />
            </div>
            <p className="text-sm font-medium text-foreground">{hasFilters ? '没有符合条件的合集' : '还没有可管理的合集'}</p>
            <p className="mt-1 text-xs text-muted-foreground">{hasFilters ? '试试调整筛选条件' : '点击同步媒体库，封面会自动出现在这里'}</p>
            <Button size="sm" variant="outline" className="mt-4" onClick={hasFilters ? clearFilters : syncAll}>
              {hasFilters ? '清除筛选' : '同步媒体库'}
            </Button>
          </div>
        ) : null}
        {visible.map((t, i) => {
          const prevKind = i > 0 ? visible[i - 1].kind : null;
          const isLibHead = t.kind === 'library' && prevKind !== 'library';
          const isColHead = t.kind === 'collection' && prevKind !== 'collection';
          const isSelected = selected.has(t.id);
          const pick = effPick(t);
          const style = effStyle(t);
          const effPendingPick = pending ? (isWall(pending.style) ? wallPickBy(pending.pickBy) : pending.pickBy) : pick;
          const isBoxsetsLib = t.kind === 'library' && (t.collectionType === 'boxsets' || t.collectionType === 'collections');
          const countText = isBoxsetsLib ? `共 ${t.itemCount || 0} 合集` : `${t.itemCount ?? 0} 部影片`;
          return (
            <Fragment key={t.id}>
              {isLibHead ? (
                <div className="col-span-full flex items-center gap-2 px-1 pt-2">
                  <Layers aria-hidden="true" className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold">媒体库</h2>
                  <span className="font-mono text-xs text-muted-foreground">{libs.length}</span>
                </div>
              ) : null}
              {isColHead ? (
                <div className="col-span-full flex items-center gap-2 px-1 pt-2">
                  <Folder aria-hidden="true" className="h-4 w-4 text-gold" />
                  <h2 className="text-sm font-semibold">合集</h2>
                  <span className="font-mono text-xs text-muted-foreground">{cols.length}</span>
                </div>
              ) : null}
              <Card
                className={cn(
                  'cursor-pointer p-3 transition-[border-color,background-color,box-shadow] duration-150 ease-out hover:border-primary/50 hover:shadow-pop',
                  isSelected && 'border-primary/60 bg-primary/[0.04] shadow-pop ring-1 ring-primary/40',
                  t.missing && 'opacity-70',
                  (t.kind === 'library' || (t.kind === 'collection' && isSelected)) && 'min-[1200px]:col-span-full'
                )}
                onClick={() => {
                  // 单击选中该卡片；再次单击已选中的卡片则取消选择（单选，不累积多选）
                  setSelected((prev) => (prev.has(t.id) ? new Set() : new Set([t.id])));
                  setPending(null);
                  setDrafts((d) => {
                    const n = { ...d };
                    delete n[t.id];
                    return n;
                  });
                }}
              >
              <div className="flex items-center gap-3">
                <div
                  className={cn('group relative shrink-0 cursor-pointer overflow-hidden rounded-md border bg-muted/40', t.kind === 'library' ? 'h-16 w-28' : 'h-24 w-16')}
                  title="点击预览"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPreview(t);
                  }}
                >
                  {t.coverUrl ? (
                    <Image
                      src={`${t.coverUrl}?w=192&v=${encodeURIComponent(t.lastGeneratedAt || '')}`}
                      alt=""
                      fill
                      sizes="112px"
                      unoptimized
                      loading="lazy"
                      decoding="async"
                      className="object-cover transition-transform duration-300 ease-out group-hover:scale-110"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <ImageIcon className="h-5 w-5 text-muted-foreground/50" />
                    </div>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-between gap-1.5 self-stretch">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={cn('truncate font-semibold', t.kind === 'collection' ? 'text-base' : 'text-sm')}>{t.name}</span>
                    <Badge className={cn('border-transparent', t.kind === 'library' ? 'bg-primary/10 text-primary' : 'bg-gold/10 text-gold')}>
                      {t.kind === 'library' ? '媒体库' : '合集'}
                    </Badge>
                    {t.locked ? <Badge variant="destructive">已锁定</Badge> : null}
                    {t.missing ? <Badge variant="muted">已删除</Badge> : null}
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className={cn('flex items-baseline gap-0.5', t.kind === 'collection' ? 'text-[15px]' : 'text-sm')}>
                      {countText.split(/(\d+)/).filter(Boolean).map((part, idx) =>
                        /\d+/.test(part) ? (
                          <span key={idx} className="font-semibold text-primary">{part}</span>
                        ) : (
                          <span key={idx} className="text-muted-foreground">{part}</span>
                        )
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span>{t.lastGeneratedAt ? <>{fmtTime(t.lastGeneratedAt)} 生成</> : '尚未生成'}</span>
                      {t.configured ? <Badge className="border border-violet-500/40 bg-violet-500/5 text-violet-400">手动配置</Badge> : null}
                    </div>
                    {t.lastError ? (
                      <div className="mt-0.5 flex items-center gap-1.5 rounded border-l-2 border-red-500 bg-red-500/10 px-2 py-1 text-xs text-red-400">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        <span className="min-w-0 truncate" title={t.lastError}>{t.lastError}</span>
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <Button size="sm" className="w-[74px]" disabled={t.locked || busy === t.id} onClick={(e) => { e.stopPropagation(); generate(t.id); }}>
                    {busy === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '更新'}
                  </Button>
                  {isSelected ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-[74px]"
                      onClick={(e) => {
                        e.stopPropagation();
                        updateTarget(t.id, { locked: !t.locked });
                      }}
                    >
                      {t.locked ? '取消锁定' : '锁定'}
                    </Button>
                  ) : null}
                </div>
              </div>

              {isSelected && selectedSingle ? (
                <div className="mt-3 space-y-2 border-t pt-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">当前：</span>
                    {t.configured ? <Badge className="border border-violet-500/40 bg-violet-500/5 text-violet-400">手动配置</Badge> : <Badge variant="muted">默认配置</Badge>}
                    {!t.configured ? (
                      <span className="text-muted-foreground">
                        {t.kind === 'library' ? '（默认单图海报，选图依据跟随全局）' : '（选图依据跟随合集全局配置）'}
                      </span>
                    ) : null}
                  </div>
                  {pending ? (
                    <div className="flex gap-4">
                      <div className="shrink-0">
                        <div className="mb-1 text-[11px] text-muted-foreground">当前封面</div>
                        {t.coverUrl ? (
                          <div className={cn('relative overflow-hidden rounded border', t.kind === 'library' ? 'aspect-video w-52' : 'aspect-[2/3] w-32')}>
                            <Image
                              src={`${t.coverUrl}?w=416&v=${encodeURIComponent(t.lastGeneratedAt || '')}`}
                              alt="当前封面"
                              fill
                              sizes="208px"
                              unoptimized
                              className="object-cover"
                            />
                          </div>
                        ) : (
                          <div className={cn('flex items-center justify-center rounded border bg-muted/40 text-xs text-muted-foreground', t.kind === 'library' ? 'aspect-video w-52' : 'aspect-[2/3] w-32')}>
                            尚未生成
                          </div>
                        )}
                      </div>
                      <div className="shrink-0">
                        <div className="mb-1 text-[11px] text-muted-foreground">预览（新配置）</div>
                        {drafts[t.id] ? (
                          <div className={cn('relative overflow-hidden rounded border', t.kind === 'library' ? 'aspect-video w-52' : 'aspect-[2/3] w-32')}>
                            <Image src={`${drafts[t.id]}?w=416`} alt="新配置预览" fill sizes="208px" unoptimized className="object-cover" />
                          </div>
                        ) : (
                          <div className={cn('flex items-center justify-center rounded border bg-muted/40 text-xs text-muted-foreground', t.kind === 'library' ? 'aspect-video w-52' : 'aspect-[2/3] w-32')}>
                            {draftLoading ? '生成中…' : '调整配置后自动生成'}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">封面样式</span>
                    <div className="flex flex-wrap gap-1.5">
                      <PickBtn active={(pending?.style || style) === 'single'} disabled={t.locked} onClick={() => setPending({ ...(pending || { style, pickBy: pick, manualItemId: '', manualItemName: '' }), style: 'single' })}>
                        单图海报
                      </PickBtn>
                      {t.kind === 'library' ? (
                        <>
                          <PickBtn active={(pending?.style || style) === 'hero'} disabled={t.locked} onClick={() => setPending({ ...(pending || { style, pickBy: pick, manualItemId: '', manualItemName: '' }), style: 'hero' })}>
                            大标题
                          </PickBtn>
                          <PickBtn active={(pending?.style || style) === 'wall-v'} disabled={t.locked} onClick={() => setPending({ ...(pending || { style, pickBy: pick, manualItemId: '', manualItemName: '' }), style: 'wall-v', pickBy: wallPickBy(pending?.pickBy || pick) })}>
                            海报墙
                          </PickBtn>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">选图依据</span>
                    <div className="flex gap-1.5">
                      <PickBtn active={effPendingPick === 'added'} disabled={t.locked} onClick={() => setPending({ ...(pending || { style, pickBy: pick, manualItemId: '', manualItemName: '' }), pickBy: 'added' })}>
                        最新入库
                      </PickBtn>
                      <PickBtn active={effPendingPick === 'premiere'} disabled={t.locked} onClick={() => setPending({ ...(pending || { style, pickBy: pick, manualItemId: '', manualItemName: '' }), pickBy: 'premiere' })}>
                        最新发行
                      </PickBtn>
                      {!isWall(pending?.style || style) ? (
                        <>
                          <PickBtn active={effPendingPick === 'random'} disabled={t.locked} onClick={() => setPending({ ...(pending || { style, pickBy: pick, manualItemId: '', manualItemName: '' }), pickBy: 'random' })}>
                            随机
                          </PickBtn>
                          <PickBtn
                            active={effPendingPick === 'manual'}
                            disabled={t.locked}
                            onClick={() => {
                              setPending({ ...(pending || { style, pickBy: pick, manualItemId: '', manualItemName: '' }), pickBy: 'manual' });
                              openPicker(t);
                            }}
                          >
                            手动选择
                          </PickBtn>
                        </>
                      ) : null}
                    </div>
                  </div>
                  {pending?.pickBy === 'manual' ? (
                    <div className="text-xs text-muted-foreground">
                      已选：{pending.manualItemName || '未选择（点选图依据可重新选择）'}
                      {pending.manualItemName ? ' · 保存后自动锁定' : ''}
                    </div>
                  ) : null}
                  {t.locked ? (
                    <div className="text-[11px] text-muted-foreground">已锁定，需先取消锁定才能修改</div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      {t.configured ? (
                        <Button size="sm" variant="outline" onClick={() => resetConfig(t)}>
                          恢复默认配置
                        </Button>
                      ) : null}
                      {changed(t) ? (
                        <Button size="sm" onClick={() => saveConfig(t)}>
                          保存
                        </Button>
                      ) : null}
                    </div>
                  )}
                </div>
              ) : null}
              </Card>
            </Fragment>
          );
        })}
      </div>

      <Modal open={!!preview} onClose={() => setPreview(null)} title="封面预览" className="max-w-3xl">
        {preview ? (
          <div>
            <div className="relative mx-auto h-[45vh] w-full max-w-2xl overflow-hidden rounded-lg border border-border/40">
              {preview.coverUrl ? (
                <Image
                  src={`${preview.coverUrl}?w=1024&v=${encodeURIComponent(preview.lastGeneratedAt || Date.now())}`}
                  alt={preview.name}
                  fill
                  sizes="90vw"
                  unoptimized
                  className="object-contain"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                  尚未生成封面
                </div>
              )}
            </div>
            <div className="mt-4 text-center">
              <div className="text-base font-semibold text-foreground">{preview.name}</div>
              <div className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                <div>
                  {preview.kind === 'library' ? '媒体库' : '合集'}
                  {preview.itemCount != null ? ` · ${preview.itemCount} 部作品` : ''}
                  {preview.lastGeneratedAt ? ` · 生成于 ${fmtTime(preview.lastGeneratedAt)}` : ''}
                </div>
                {preview.posterSource ? <div>海报来源：{preview.posterSource}</div> : null}
                {preview.lastError ? <div className="text-red-400">最近错误：{preview.lastError}</div> : null}
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={items.length > 0}
        onClose={() => setItems([])}
        title="选择封面影片"
        description="点击任意影片打勾，将其海报作为该合集封面；点「确定」后本地预览，保存后才上传 Emby。"
        className="max-w-2xl"
      >
        {items.length ? (
          <div className="flex flex-col">
            <div className="grid max-h-[50vh] grid-cols-4 gap-2 overflow-y-auto pr-1 sm:grid-cols-5">
              {items.map((i) => (
                <button
                  key={i.id}
                  className={cn(
                    'group relative flex cursor-pointer flex-col overflow-hidden rounded-lg border bg-card text-left text-xs transition-[border-color,background-color,box-shadow,transform] duration-150 ease-out hover:border-primary/60 hover:shadow-pop active:scale-[0.98]',
                    pickerSel === i.id && 'border-primary/60 bg-primary/[0.04] ring-1 ring-primary/40'
                  )}
                  onClick={() => setPickerSel(i.id)}
                >
                  <div className="relative aspect-[2/3] w-full overflow-hidden bg-muted/40">
                    {/* eslint-disable-next-line @next/next/no-img-element -- 后端已按 ?w=240 缩尺寸的动态代理图，无需 next/image 优化 */}
                    <img src={`/api/item-image/${i.id}?w=240`} alt={i.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-105" />
                    {pickerSel === i.id ? (
                      <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-soft">
                        <Check aria-hidden="true" className="h-3 w-3" />
                      </span>
                    ) : null}
                  </div>
                  <span className={cn('line-clamp-2 w-full px-1.5 py-1.5 leading-tight', pickerSel === i.id ? 'font-medium text-primary' : 'text-foreground/85')}>
                    {i.name}
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-end gap-2 border-t pt-3">
              <Button size="sm" variant="outline" onClick={() => setItems([])}>
                取消
              </Button>
              <Button
                size="sm"
                disabled={!pickerSel}
                onClick={() => {
                  const picked = items.find((i) => i.id === pickerSel);
                  if (!picked) return;
                  setPending((p) => ({ ...(p || { style: 'single', pickBy: 'manual', manualItemId: '', manualItemName: '' }), pickBy: 'manual', manualItemId: picked.id, manualItemName: picked.name }));
                  setItems([]);
                }}
              >
                确定
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  icon,
  options
}: {
  value: string;
  onChange: (v: string) => void;
  icon: ReactNode;
  options: { value: string; label: string; icon: ReactNode }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value) || options[0];
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-input bg-card px-2.5 text-sm text-foreground shadow-sm transition-[color,border-color,box-shadow,transform] duration-150 ease-out hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 active:scale-[0.97]"
      >
        {current?.icon || icon}
        <span className="whitespace-nowrap">{current?.label || ''}</span>
        <ChevronDown aria-hidden="true" className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-40 mt-1 min-w-full origin-top-left overflow-hidden rounded-md border bg-popover py-1 text-popover-foreground shadow-pop animate-in fade-in zoom-in-95 duration-150 ease-out motion-reduce:animate-none">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              className={cn(
                'flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                o.value === value && 'bg-primary/10 text-primary'
              )}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              {o.icon}
              {o.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PickBtn({ active, disabled, onClick, children }: { active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'cursor-pointer rounded-md border px-2.5 py-1 text-xs text-muted-foreground transition-[color,border-color,background-color,transform] duration-150 ease-out hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40',
        active && 'border-primary bg-primary/10 text-primary'
      )}
    >
      {children}
    </button>
  );
}
