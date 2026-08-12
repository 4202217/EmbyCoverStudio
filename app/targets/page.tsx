'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
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
  styleByKind?: { library?: string; collection?: string };
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

const PICK_LABEL: Record<string, string> = { added: '最新入库', premiere: '最新发行', random: '随机', manual: '手动选择' };

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
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<Target | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [sync, setSync] = useState<SyncState | null>(null);
  const [forcePoll, setForcePoll] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const seenActive = useRef(false);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = async () => {
    try {
      const [t, s] = await Promise.all([api<{ targets: Target[] }>('/api/targets'), api<Styles>('/api/styles')]);
      setTargets(t.targets);
      setStyles(s);
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
  }, [forcePoll, sync?.running, sync?.status]);

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
  }, [sync?.running, sync?.status]);

  const effStyle = (t: Target) => (t.kind === 'collection' ? 'single' : t.template || styles.styleByKind?.library || 'single');
  const effPick = (t: Target) => t.pickBy || styles.defaultPickByByStyle?.[`${t.kind}-${effStyle(t)}`] || 'added';
  const pickLabel = (p: string) => PICK_LABEL[p] || '最新入库';

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
    toast('info', '开始同步所有未锁定封面…');
    api('/api/sync', { method: 'POST', body: JSON.stringify({ force: true }) })
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
      try {
        const body: Record<string, unknown> = { style: pending.style, pickBy: pending.style === 'single' ? pending.pickBy : 'added' };
        if (body.pickBy === 'manual') {
          if (!pending.manualItemId) return;
          body.manualItemId = pending.manualItemId;
          body.manualItemName = pending.manualItemName;
        }
        const r = await api<{ coverUrl: string }>(`/api/targets/${id}/preview-draft`, { method: 'POST', body: JSON.stringify(body) });
        setDrafts((d) => ({ ...d, [id]: r.coverUrl }));
      } catch {
        // 预览失败时保留当前封面
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [pending, selectedSingle]);

  const saveConfig = async (t: Target) => {
    if (!pending) return;
    const style = pending.style;
    const pickBy = style === 'single' ? pending.pickBy : 'added'; // 海报墙样式不支持手动/随机
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

  const clearFilters = () => {
    setQuery('');
    setTypeF('all');
    setStatusF('all');
    setCfgF('all');
    setCoverF('all');
  };

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
        <h1 className="text-2xl font-bold">封面管理</h1>
        <p className="text-sm text-muted-foreground">管理 Emby 媒体库与合集的封面生成，单选可单独配置，支持多选批量操作</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="搜索名称…" value={query} onChange={(e) => setQuery(e.target.value)} className="w-56 pl-8" />
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
        <button className="flex items-center gap-1 px-1 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground" onClick={clearFilters}>
          <XCircle className="h-3.5 w-3.5" />
          清除筛选
        </button>
      </div>

      {syncVisible ? (
        <Card className="p-3">
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
            <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${syncPct}%` }} />
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

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card p-2.5">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={visible.length > 0 && visible.every((t) => selected.has(t.id))}
              onChange={(e) => {
                if (e.target.checked) setSelected(new Set(visible.map((t) => t.id)));
                else setSelected(new Set());
              }}
            />
            全选
          </label>
          <span className="text-muted-foreground">已选 {selected.size} 项</span>
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
        <Button size="sm" onClick={syncAll}>
          同步媒体库封面
        </Button>
      </div>

      <div className="space-y-2">
        {!loaded ? (
          <div className="rounded-md border bg-card p-6 text-center text-sm text-muted-foreground">加载中…</div>
        ) : !visible.length ? (
          <div className="rounded-md border bg-card p-6 text-center text-sm text-muted-foreground">
            <ImageIcon className="mx-auto mb-2 h-6 w-6 text-muted-foreground/40" />
            没有符合条件的合集
          </div>
        ) : null}
        {visible.map((t) => {
          const isSelected = selected.has(t.id);
          const pick = effPick(t);
          const style = effStyle(t);
          const effPendingPick = pending ? (pending.style === 'single' ? pending.pickBy : 'added') : pick;
          const isBoxsetsLib = t.kind === 'library' && (t.collectionType === 'boxsets' || t.collectionType === 'collections');
          const countText = isBoxsetsLib ? `共 ${t.itemCount || 0} 合集` : `${t.itemCount ?? 0} 部影片`;
          return (
            <Card
              key={t.id}
              className={cn('cursor-pointer p-3 transition-colors hover:border-primary/50', isSelected && 'border-primary', t.missing && 'opacity-70')}
              onClick={() => {
                setSelected(new Set(isSelected ? [] : [t.id]));
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
                  className={cn('shrink-0 cursor-pointer overflow-hidden rounded-md border bg-muted/40', t.kind === 'library' ? 'h-14 w-24' : 'h-16 w-12')}
                  title="点击预览"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPreview(t);
                  }}
                >
                  {t.coverUrl ? (
                    <img src={drafts[t.id] || `${t.coverUrl}?v=${encodeURIComponent(t.lastGeneratedAt || '')}`} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <ImageIcon className="h-5 w-5 text-muted-foreground/50" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold">{t.name}</span>
                    <Badge variant={t.kind === 'library' ? 'default' : 'secondary'}>{t.kind === 'library' ? '媒体库' : '合集'}</Badge>
                    {t.configured ? <Badge variant="warning">手动配置</Badge> : <Badge variant="muted">默认配置</Badge>}
                    {t.locked ? <Badge variant="destructive">已锁定</Badge> : null}
                    {t.missing ? <Badge variant="muted">已删除</Badge> : null}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {fmtTime(t.lastGeneratedAt)} 生成 · {pickLabel(pick)} · {countText}
                    {style === 'single' && t.posterSource ? <span className="block truncate">海报来源：{t.posterSource}</span> : null}
                  </div>
                  {t.lastError ? <div className="mt-1 flex items-center gap-1 text-xs text-red-400"><AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {t.lastError}</div> : null}
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
                    {t.configured ? <Badge variant="warning">手动配置</Badge> : <Badge variant="muted">默认配置</Badge>}
                    {!t.configured ? <span className="text-muted-foreground">（跟随{t.kind === 'library' ? '媒体库' : '合集'}全局配置）</span> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">封面样式</span>
                    <div className="flex gap-1.5">
                      <PickBtn active={(pending?.style || style) === 'single'} disabled={t.locked} onClick={() => setPending({ ...(pending || { style, pickBy: pick, manualItemId: '', manualItemName: '' }), style: 'single' })}>
                        单图海报
                      </PickBtn>
                      {t.kind === 'library' ? (
                        <PickBtn active={(pending?.style || style) === 'wall3'} disabled={t.locked} onClick={() => setPending({ ...(pending || { style, pickBy: pick, manualItemId: '', manualItemName: '' }), style: 'wall3' })}>
                          海报墙
                        </PickBtn>
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
                      {(pending?.style || style) === 'single' ? (
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
                    {(pending?.style || style) !== 'single' ? <span className="text-[11px] text-muted-foreground">海报墙样式不支持手动选择</span> : null}
                  </div>
                  {pending?.pickBy === 'manual' ? (
                    <div className="text-xs text-muted-foreground">
                      已选：{pending.manualItemName || '未选择（点选图依据可重新选择）'}
                      {pending.manualItemName ? ' · 保存后自动锁定' : ''}
                    </div>
                  ) : null}
                  {t.locked ? (
                    <div className="text-[11px] text-muted-foreground">已锁定，需先取消锁定才能修改</div>
                  ) : changed(t) ? (
                    <Button size="sm" onClick={() => saveConfig(t)}>
                      保存
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>

      <Modal open={!!preview} onClose={() => setPreview(null)} title="封面预览">
        {preview ? (
          <div className="flex flex-col items-start gap-4 sm:flex-row">
            <div className="shrink-0">
              {preview.coverUrl ? (
                <img
                  src={`${preview.coverUrl}?v=${encodeURIComponent(preview.lastGeneratedAt || Date.now())}`}
                  alt=""
                  className={cn('rounded-lg border', preview.kind === 'library' ? 'w-80' : 'w-52')}
                />
              ) : (
                <div className="flex h-44 w-40 items-center justify-center rounded-lg border text-xs text-muted-foreground">
                  尚未生成封面
                </div>
              )}
            </div>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                展示当前已生成的封面{preview.lastGeneratedAt ? `（${fmtTime(preview.lastGeneratedAt)} 生成）` : ''}，不会重复合成。
              </p>
              <Button size="sm" disabled={previewBusy} onClick={async () => {
                setPreviewBusy(true);
                try {
                  await api(`/api/targets/${preview.id}/generate`, { method: 'POST', body: '{}' });
                  toast('ok', '封面已更新并上传');
                  await load();
                  setPreview(null);
                } catch (e: any) {
                  toast('err', e.message);
                } finally {
                  setPreviewBusy(false);
                }
              }}>
                {previewBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {previewBusy ? '生成中…' : '更新并上传'}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal open={items.length > 0} onClose={() => setItems([])} title="选择封面影片">
        {items.length ? (
          <div>
            <p className="mb-3 text-xs text-muted-foreground">点击任意影片，将其海报作为该合集封面。选择后先本地预览，点「保存」后才上传 Emby。</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {items.map((i) => (
                <button
                  key={i.id}
                  className="flex flex-col items-center gap-1 rounded-md border p-1.5 text-xs hover:border-primary"
                  onClick={() => {
                    setPending((p) => ({ ...(p || { style: 'single', pickBy: 'manual', manualItemId: '', manualItemName: '' }), pickBy: 'manual', manualItemId: i.id, manualItemName: i.name }));
                    setItems([]);
                  }}
                >
                  <img src={`/api/item-image/${i.id}?w=120`} alt="" className="h-20 w-14 rounded object-cover" loading="lazy" />
                  <span className="line-clamp-2">{i.name}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </Modal>
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
        className="flex h-9 items-center gap-1.5 rounded-md border border-input bg-card px-2.5 text-sm text-foreground shadow-sm transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        {current?.icon || icon}
        <span className="whitespace-nowrap">{current?.label || ''}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-40 mt-1 min-w-full overflow-hidden rounded-md border bg-popover py-1 text-popover-foreground shadow-xl">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              className={cn(
                'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground',
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
      className={cn(
        'rounded-md border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:pointer-events-none disabled:opacity-40',
        active && 'border-primary bg-primary/10 text-primary'
      )}
    >
      {children}
    </button>
  );
}
