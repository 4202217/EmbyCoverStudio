'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
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
};

type Styles = {
  styleByKind?: { library?: string; collection?: string };
  defaultPickByByStyle?: Record<string, string>;
};

type Item = { id: string; name: string; hasPrimary?: boolean };

async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) }
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `请求失败（${res.status}）`);
  return data as T;
}

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

  const load = async () => {
    try {
      const [t, s] = await Promise.all([api<{ targets: Target[] }>('/api/targets'), api<Styles>('/api/styles')]);
      setTargets(t.targets);
      setStyles(s);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    load();
  }, []);

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
    await api(`/api/targets/${id}`, { method: 'PUT', body: JSON.stringify(body) });
    await load();
  };

  const generate = async (id: string) => {
    setBusy(id);
    try {
      await api(`/api/targets/${id}/generate`, { method: 'POST', body: '{}' });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const batch = async (action: string, value = '') => {
    const ids = [...selected];
    if (!ids.length) return;
    await api('/api/targets/batch', { method: 'POST', body: JSON.stringify({ ids, action, value }) });
    await load();
  };

  const syncAll = async () => {
    await api('/api/sync', { method: 'POST', body: JSON.stringify({ force: true }) });
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
        const body: Record<string, unknown> = { style: pending.style, pickBy: pending.pickBy };
        if (pending.pickBy === 'manual') {
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
    const body: Record<string, unknown> = { template: pending.style, pickBy: pending.pickBy };
    if (pending.pickBy === 'manual') {
      body.manualItemId = pending.manualItemId;
      body.manualItemName = pending.manualItemName;
    }
    await updateTarget(t.id, body);
    await generate(t.id);
    setPending(null);
    setDrafts((d) => {
      const n = { ...d };
      delete n[t.id];
      return n;
    });
  };

  const clearFilters = () => {
    setQuery('');
    setTypeF('all');
    setStatusF('all');
    setCfgF('all');
    setCoverF('all');
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">封面管理</h1>
        <p className="text-sm text-muted-foreground">管理 Emby 媒体库与合集的封面生成</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="搜索名称…" value={query} onChange={(e) => setQuery(e.target.value)} className="max-w-[220px]" />
        <Select value={typeF} onChange={(e) => setTypeF(e.target.value)} className="w-28">
          <option value="all">全部类型</option>
          <option value="library">媒体库</option>
          <option value="collection">合集</option>
        </Select>
        <Select value={statusF} onChange={(e) => setStatusF(e.target.value)} className="w-28">
          <option value="all">全部状态</option>
          <option value="enabled">监控中</option>
          <option value="locked">已锁定</option>
        </Select>
        <Select value={cfgF} onChange={(e) => setCfgF(e.target.value)} className="w-28">
          <option value="all">全部配置</option>
          <option value="default">默认配置</option>
          <option value="configured">手动配置</option>
        </Select>
        <Select value={coverF} onChange={(e) => setCoverF(e.target.value)} className="w-28">
          <option value="all">全部封面</option>
          <option value="generated">已生成</option>
          <option value="error">有错误</option>
        </Select>
        <Button size="sm" variant="link" className="px-1 text-muted-foreground underline underline-offset-4" onClick={clearFilters}>
          清除筛选
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card p-2.5">
        <div className="flex items-center gap-2 text-xs">
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
        {visible.map((t) => {
          const isSelected = selected.has(t.id);
          const pick = effPick(t);
          return (
            <Card
              key={t.id}
              className={cn('cursor-pointer p-3 transition-colors hover:border-primary/50', isSelected && 'border-primary')}
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
                <div className={cn('shrink-0 rounded-md border bg-muted/40', t.kind === 'library' ? 'h-14 w-24' : 'h-16 w-12')}>
                  {t.coverUrl ? (
                    <img src={drafts[t.id] || `${t.coverUrl}?v=${encodeURIComponent(t.lastGeneratedAt || '')}`} alt="" className="h-full w-full rounded-md object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold">{t.name}</span>
                    <Badge variant={t.kind === 'library' ? 'default' : 'secondary'}>{t.kind === 'library' ? '媒体库' : '合集'}</Badge>
                    {t.configured ? <Badge variant="warning">手动配置</Badge> : <Badge variant="muted">默认配置</Badge>}
                    {t.locked ? <Badge variant="destructive">已锁定</Badge> : null}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {fmtTime(t.lastGeneratedAt)} 生成 · {pickLabel(pick)} · {t.itemCount ?? 0} 部影片
                    {t.posterSource ? <span className="block truncate">海报来源：{t.posterSource}</span> : null}
                  </div>
                  {t.lastError ? <div className="mt-1 flex items-center gap-1 text-xs text-red-400"><AlertIcon /> {t.lastError}</div> : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <Button size="sm" disabled={t.locked || busy === t.id} onClick={(e) => { e.stopPropagation(); generate(t.id); }}>
                    {busy === t.id ? '更新中…' : '更新'}
                  </Button>
                  {isSelected ? (
                    <Button
                      size="sm"
                      variant="outline"
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
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">封面样式</span>
                    <div className="flex gap-1.5">
                      <PickBtn active={(pending?.style || effStyle(t)) === 'single'} onClick={() => setPending({ ...(pending || { style: effStyle(t), pickBy: pick, manualItemId: '', manualItemName: '' }), style: 'single' })}>
                        单图海报
                      </PickBtn>
                      {t.kind === 'library' ? (
                        <PickBtn active={(pending?.style || effStyle(t)) === 'wall3'} onClick={() => setPending({ ...(pending || { style: effStyle(t), pickBy: pick, manualItemId: '', manualItemName: '' }), style: 'wall3' })}>
                          海报墙
                        </PickBtn>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">选图依据</span>
                    <div className="flex gap-1.5">
                      <PickBtn active={(pending?.pickBy || pick) === 'added'} onClick={() => setPending({ ...(pending || { style: effStyle(t), pickBy: pick, manualItemId: '', manualItemName: '' }), pickBy: 'added' })}>
                        最新入库
                      </PickBtn>
                      <PickBtn active={(pending?.pickBy || pick) === 'premiere'} onClick={() => setPending({ ...(pending || { style: effStyle(t), pickBy: pick, manualItemId: '', manualItemName: '' }), pickBy: 'premiere' })}>
                        最新发行
                      </PickBtn>
                      {(pending?.style || effStyle(t)) === 'single' ? (
                        <>
                          <PickBtn active={(pending?.pickBy || pick) === 'random'} onClick={() => setPending({ ...(pending || { style: effStyle(t), pickBy: pick, manualItemId: '', manualItemName: '' }), pickBy: 'random' })}>
                            随机
                          </PickBtn>
                          <PickBtn active={(pending?.pickBy || pick) === 'manual'} onClick={() => openPicker(t)}>
                            手动选择
                          </PickBtn>
                        </>
                      ) : null}
                    </div>
                  </div>
                  {pending?.pickBy === 'manual' ? (
                    <div className="text-xs text-muted-foreground">已选：{pending.manualItemName || '未选择（点击手动选择重新选）'}</div>
                  ) : null}
                  {changed(t) ? (
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

      {items.length ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setItems([])}>
          <Card className="max-h-[80vh] w-full max-w-xl overflow-auto p-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-3 text-sm font-semibold">选择封面影片</h2>
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
                  <img src={`/api/item-image/${i.id}?w=120`} alt="" className="h-20 w-14 rounded object-cover" />
                  <span className="line-clamp-2">{i.name}</span>
                </button>
              ))}
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function PickBtn({ active, onClick, children }: { active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary',
        active && 'border-primary bg-primary/10 text-primary'
      )}
    >
      {children}
    </button>
  );
}

function AlertIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" className="h-3.5 w-3.5 shrink-0">
      <path d="M8 2.5 14.5 13h-13z" strokeLinejoin="round" />
      <path d="M8 6.5v3" strokeLinecap="round" />
      <circle cx="8" cy="11.2" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}
