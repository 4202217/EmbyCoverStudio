'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { PasswordInput } from '@/components/ui/password-input';
import { ConfirmDialog, type ConfirmState } from '@/components/confirm-dialog';
import { api, rawFetch } from '@/lib/api';
import { toast } from '@/components/toast-provider';
import { cn, fmtTime } from '@/lib/utils';

type Settings = Record<string, any>;
type Status = { lastRun?: string; lastReason?: string; lastError?: string; nextRun?: string; counts?: Record<string, number>; webhook?: { url?: string; lastEvent?: string; lastEventAt?: string; test?: { armed?: boolean; result?: { event?: string; at?: string } } } };

const GROUPS = [
  { key: 'library-single', label: '媒体库·单图海报' },
  { key: 'library-wall', label: '媒体库·海报墙' },
  { key: 'collection-single', label: '合集·单图海报' }
];

// 字号滑动条的有效区间（超出上限受布局空间限制不再变大）
const SIZE_RANGE: Record<string, { title: [number, number]; subtitle: [number, number] }> = {
  'library-single': { title: [40, 120], subtitle: [20, 65] },
  'library-wall': { title: [40, 140], subtitle: [20, 70] },
  'collection-single': { title: [40, 120], subtitle: [20, 65] }
};
const clampRange = (v: number | undefined, [min, max]: [number, number]) => Math.min(max, Math.max(min, Number(v) || min));

export default function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [group, setGroup] = useState('library-single');
  const [status, setStatus] = useState<Status | null>(null);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [waiting, setWaiting] = useState(false);
  const [waitMsg, setWaitMsg] = useState('');
  const [previewSource, setPreviewSource] = useState('');
  const [targets, setTargets] = useState<{ id: string; name: string; kind: string; missing?: boolean }[]>([]);
  const [previewSrc, setPreviewSrc] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const webhookTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (webhookTimer.current) clearInterval(webhookTimer.current);
    },
    []
  );

  const cur = draft?.coverByStyle?.[group] || {};
  const curPick = draft?.defaultPickByByStyle?.[group] || 'added';

  // 实时预览
  useEffect(() => {
    const timer = setTimeout(() => {
      const q = new URLSearchParams({
        style: group.endsWith('-wall') ? 'wall-v' : 'single',
        size: group.startsWith('library') ? 'thumb' : 'poster',
        backgroundMode: cur.backgroundMode || 'gradient',
        title: group.startsWith('library') ? '媒体库' : '合集',
        showCount: cur.showCount !== false ? '1' : '0',
        titleSize: String(cur.titleSize ?? 84),
        subtitleSize: String(cur.subtitleSize ?? 36),
        bgTop: cur.bgTop || '#17233d',
        bgBottom: cur.bgBottom || '#0a0f1c',
        accent: cur.accent || '#00a4dc',
        titleColor: cur.titleColor || '#ffffff',
        subtitleColor: cur.subtitleColor || '#c9d6f2'
      });
      if (previewSource) {
        q.set('targetId', previewSource);
        q.set('pickBy', curPick);
      }
      setLoading(true);
      const img = new Image();
      img.onload = () => {
        setPreviewSrc(img.src);
        setLoading(false);
      };
      img.onerror = () => setLoading(false);
      img.src = `/api/demo-preview?${q.toString()}&t=${Date.now()}`;
    }, 350);
    return () => clearTimeout(timer);
  }, [group, cur, curPick, previewSource]);

  // 切换配置组时，预览数据源类型不匹配则自动清空
  useEffect(() => {
    if (!previewSource) return;
    const kind = group.startsWith('library') ? 'library' : 'collection';
    const t = targets.find((x) => x.id === previewSource);
    if (t && t.kind !== kind) setPreviewSource('');
  }, [group, targets, previewSource]);

  const load = async () => {
    try {
      const r = await api<{ settings: Settings }>('/api/settings');
      setS(r.settings);
      setDraft(r.settings);
      const [st, wh] = await Promise.all([api<Status>('/api/status'), api<{ url: string }>('/api/webhook/url').catch(() => ({ url: '' }))]);
      setStatus(st);
      setWebhookUrl(wh.url);
      const t = await api<{ targets: { id: string; name: string; kind: string }[] }>('/api/targets').catch(() => ({ targets: [] }));
      setTargets(t.targets);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (!s || !draft) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
          加载设置中…
        </div>
      </div>
    );
  }

  const save = async (patch: Record<string, unknown>) => {
    try {
      const r = await api<{ settings: Settings }>('/api/settings', { method: 'PUT', body: JSON.stringify(patch) });
      setS(r.settings);
      setDraft(r.settings);
      toast('ok', '已保存');
    } catch (e: any) {
      toast('err', `保存失败：${e.message}`);
    }
  };

  const setGroupDraft = (patch: Record<string, unknown>) => {
    setDraft((d) => {
      if (!d) return d;
      const cover = { ...(d.coverByStyle?.[group] || {}), ...patch };
      return { ...d, coverByStyle: { ...(d.coverByStyle || {}), [group]: cover } };
    });
  };

  const exportBackup = async () => {
    try {
      const res = await rawFetch('/api/export');
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `导出失败（HTTP ${res.status}）`);
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const name = `emby-cover-studio-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
      toast('ok', `备份已导出 ${name}`);
    } catch (e: any) {
      toast('err', e.message);
    }
  };

  const importBackup = (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (!data || data.version !== 1 || !data.settings || !data.targets) throw new Error('备份文件格式不正确或版本不匹配');
        setConfirm({
          title: '导入备份',
          description: '导入将覆盖当前全部配置与数据，确定继续吗？',
          confirmText: '覆盖并导入',
          onConfirm: async () => {
            await api('/api/import', { method: 'POST', body: JSON.stringify({ data }) });
            toast('ok', '导入成功，正在刷新…');
            load();
          }
        });
      } catch (e: any) {
        toast('err', `导入失败：${e.message}`);
      }
    };
    reader.readAsText(file);
  };

  const startWebhookTest = async () => {
    setWaiting(true);
    setWaitMsg('等待接收中…请到 Emby Webhooks 插件点击「测试通知」（60 秒超时）');
    try {
      await api('/api/webhook/test/arm', { method: 'POST', body: '{}' });
    } catch (e: any) {
      setWaiting(false);
      setWaitMsg(`启动失败：${e.message}`);
      return;
    }
    const start = Date.now();
    webhookTimer.current = setInterval(async () => {
      const st = await api<Status>('/api/status').catch(() => null);
      if (st?.webhook?.test?.result) {
        if (webhookTimer.current) clearInterval(webhookTimer.current);
        webhookTimer.current = null;
        setWaiting(false);
        setWaitMsg(`已收到测试通知（事件：${st.webhook.test.result.event} · ${fmtTime(st.webhook.test.result.at)}）`);
        setStatus(st);
        toast('ok', '已收到 Emby 测试通知');
        return;
      }
      if (Date.now() - start > 60000) {
        if (webhookTimer.current) clearInterval(webhookTimer.current);
        webhookTimer.current = null;
        setWaiting(false);
        setWaitMsg('60 秒内未收到，请确认插件已配置此地址并点击了「测试通知」');
      }
    }, 2000);
  };

  const saveAndRegen = async () => {
    try {
      const r = await api<{ settings: Settings }>('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({
          defaultPickByByStyle: draft.defaultPickByByStyle,
          coverByStyle: draft.coverByStyle,
          outputFormat: draft.outputFormat
        })
      });
      setS(r.settings);
      setDraft(r.settings);
      const kind = group.startsWith('library') ? 'library' : 'collection';
      const style = group.endsWith('-wall') ? 'wall' : 'single';
      const label = `${kind === 'library' ? '媒体库' : '合集'}·${style === 'wall' ? '海报墙' : '单图海报'}`;
      api('/api/sync', { method: 'POST', body: JSON.stringify({ force: true, onlyKind: kind, onlyStyle: style }) }).catch((e: any) => toast('err', e.message));
      toast('info', `设置已保存，开始重新生成${label}封面（仅未锁定项）`);
    } catch (e: any) {
      toast('err', `保存失败：${e.message}`);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">设置</h1>
        <p className="text-sm text-muted-foreground">配置 Emby 连接、自动更新与封面配置</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Emby 连接</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="服务器地址">
              <Input aria-label="服务器地址" value={draft.embyUrl || ''} placeholder="http://192.168.1.100:8096" onChange={(e) => setDraft({ ...draft, embyUrl: e.target.value })} />
            </Field>
            <Field label="API 密钥">
              <PasswordInput aria-label="API 密钥" value={draft.embyApiKey || ''} onChange={(e) => setDraft({ ...draft, embyApiKey: e.target.value })} />
            </Field>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => save({ embyUrl: draft.embyUrl, embyApiKey: draft.embyApiKey })}>保存连接设置</Button>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  const r = await api<{ serverName?: string; version?: string }>('/api/emby/test', { method: 'POST', body: JSON.stringify({ embyUrl: draft.embyUrl, embyApiKey: draft.embyApiKey }) });
                  toast('ok', `连接成功：${r.serverName} v${r.version}`);
                } catch (e: any) {
                  toast('err', `连接失败：${e.message}`);
                }
              }}
            >
              测试连接
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>自动更新</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="定时同步 cron">
              <Input aria-label="定时同步 cron" value={draft.cron || ''} onChange={(e) => setDraft({ ...draft, cron: e.target.value })} />
            </Field>
            <Field label="Webhook 防抖（毫秒）">
              <Input type="number" aria-label="Webhook 防抖（毫秒）" value={draft.webhookDebounceMs ?? 20000} onChange={(e) => setDraft({ ...draft, webhookDebounceMs: Number(e.target.value) })} />
            </Field>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs">
              <Switch checked={!!draft.autoEnableNew} onCheckedChange={(v) => setDraft({ ...draft, autoEnableNew: v })} />
              自动启用新发现
            </label>
            <label className="flex items-center gap-2 text-xs">
              <Switch checked={!!draft.syncOnStart} onCheckedChange={(v) => setDraft({ ...draft, syncOnStart: v })} />
              服务启动时自动同步
            </label>
            <label className="flex items-center gap-2 text-xs">
              <Switch checked={!!draft.excludeUsedPosters} onCheckedChange={(v) => setDraft({ ...draft, excludeUsedPosters: v })} />
              避免复用其它封面已用的海报
            </label>
          </div>
          <Button onClick={() => save({ cron: draft.cron, webhookDebounceMs: draft.webhookDebounceMs, autoEnableNew: draft.autoEnableNew, syncOnStart: draft.syncOnStart, excludeUsedPosters: draft.excludeUsedPosters })}>
            保存自动更新设置
          </Button>

          <div className="space-y-1.5 border-t pt-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate rounded border bg-muted/30 px-2 py-1">{webhookUrl}</span>
              <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(webhookUrl)}>复制</Button>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" disabled={waiting} onClick={startWebhookTest}>
                {waiting ? '等待接收中…' : '等待接收测试通知'}
              </Button>
              <span>{waitMsg}</span>
            </div>
            <div>最近收到：{status?.webhook?.lastEventAt ? `${status.webhook.lastEvent || '未知事件'} · ${fmtTime(status.webhook.lastEventAt)}` : '—'}</div>
            <div>上次触发：{status?.lastRun ? `${fmtTime(status.lastRun)}（${status.lastReason || '未知原因'}）` : '从未触发'}</div>
            <div>上次结果：{(() => { const c = status?.counts || {}; const p = [c.updated ? `更新 ${c.updated} 个` : '', c.unchanged ? `无变化 ${c.unchanged} 个` : '', c.failed ? `失败 ${c.failed} 个` : ''].filter(Boolean); return p.length ? p.join('，') : (status?.lastRun ? '完成' : '—'); })()}</div>
            <div>下次定时：{fmtTime(status?.nextRun)}</div>
            {status?.lastError ? <div className="text-red-400">最近错误：{status.lastError}</div> : null}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch">
        <Card className="flex-1">
          <CardHeader>
            <CardTitle>封面配置</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              {GROUPS.map((g) => (
                <Button key={g.key} size="sm" variant={group === g.key ? 'default' : 'outline'} onClick={() => setGroup(g.key)}>
                  {g.label}
                </Button>
              ))}
            </div>

            <Field label="选图依据">
              <div className="flex gap-1.5">
                {['added', 'premiere', 'random'].map((p) => (
                  <button
                    key={p}
                    aria-pressed={curPick === p}
                    className={cn(
                      'cursor-pointer rounded-md border px-2.5 py-1 text-xs transition-[color,border-color,background-color,transform] duration-150 ease-out hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 active:scale-[0.97]',
                      curPick === p ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground'
                    )}
                    onClick={() => setDraft({ ...draft, defaultPickByByStyle: { ...(draft.defaultPickByByStyle || {}), [group]: p } })}
                  >
                    {p === 'added' ? '最新入库' : p === 'premiere' ? '最新发行' : '随机'}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="背景模式">
              <div className="flex gap-1.5">
                {['gradient', 'poster'].map((b) => (
                  <button
                    key={b}
                    aria-pressed={(cur.backgroundMode || 'gradient') === b}
                    className={cn(
                      'cursor-pointer rounded-md border px-2.5 py-1 text-xs transition-[color,border-color,background-color,transform] duration-150 ease-out hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 active:scale-[0.97]',
                      (cur.backgroundMode || 'gradient') === b ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground'
                    )}
                    onClick={() => setGroupDraft({ backgroundMode: b })}
                  >
                    {b === 'gradient' ? '渐变色' : '海报渐变模糊'}
                  </button>
                ))}
              </div>
            </Field>

            {(cur.backgroundMode || 'gradient') === 'gradient' ? (
              <div className="flex flex-wrap gap-2">
                <ColorField label="背景顶部" value={cur.bgTop || '#17233d'} onChange={(v) => setGroupDraft({ bgTop: v })} />
                <ColorField label="背景底部" value={cur.bgBottom || '#0a0f1c'} onChange={(v) => setGroupDraft({ bgBottom: v })} />
              </div>
            ) : null}

            <Field label="字号">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span>标题字号</span>
                    <span className="tabular-nums">{clampRange(cur.titleSize, SIZE_RANGE[group]?.title || [40, 120])}</span>
                  </span>
                  <input
                    type="range"
                    min={SIZE_RANGE[group]?.title[0] ?? 40}
                    max={SIZE_RANGE[group]?.title[1] ?? 120}
                    value={clampRange(cur.titleSize, SIZE_RANGE[group]?.title || [40, 120])}
                    onChange={(e) => setGroupDraft({ titleSize: Number(e.target.value) })}
                    className="w-full accent-primary"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span>副标题字号</span>
                    <span className="tabular-nums">{clampRange(cur.subtitleSize, SIZE_RANGE[group]?.subtitle || [20, 65])}</span>
                  </span>
                  <input
                    type="range"
                    min={SIZE_RANGE[group]?.subtitle[0] ?? 20}
                    max={SIZE_RANGE[group]?.subtitle[1] ?? 65}
                    value={clampRange(cur.subtitleSize, SIZE_RANGE[group]?.subtitle || [20, 65])}
                    onChange={(e) => setGroupDraft({ subtitleSize: Number(e.target.value) })}
                    className="w-full accent-primary"
                  />
                </label>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground/70">按输出等比缩放；受布局空间限制，标题/副标题较长时会自动贴合可用区域</p>
            </Field>

            <div className="flex flex-wrap gap-2">
              <ColorField label="强调色" value={cur.accent || '#00a4dc'} onChange={(v) => setGroupDraft({ accent: v })} />
              <ColorField label="标题颜色" value={cur.titleColor || '#ffffff'} onChange={(v) => setGroupDraft({ titleColor: v })} />
              <ColorField label="副标题颜色" value={cur.subtitleColor || '#c9d6f2'} onChange={(v) => setGroupDraft({ subtitleColor: v })} />
              <label className="flex items-center gap-2 text-xs">
                <Switch checked={cur.showCount !== false} onCheckedChange={(v) => setGroupDraft({ showCount: v })} />
                显示数量副标题
              </label>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <Switch checked={draft.outputFormat === 'webp'} onCheckedChange={(v) => setDraft({ ...draft, outputFormat: v ? 'webp' : 'png' })} />
              无损 WebP 输出（体积更小，需 Emby 支持）
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <Button
                className="w-full"
                onClick={() =>
                  save({
                    defaultPickByByStyle: draft.defaultPickByByStyle,
                    coverByStyle: draft.coverByStyle,
                    outputFormat: draft.outputFormat
                  })
                }
              >
                保存封面配置
              </Button>
              <Button variant="outline" className="w-full" onClick={saveAndRegen}>
                保存并重新生成当前配置封面
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="w-full shrink-0 lg:flex lg:w-80 lg:flex-col">
          <Card className="flex flex-1 flex-col">
            <CardHeader>
              <CardTitle>实时预览</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col justify-center gap-3">
              <Select value={previewSource} onChange={(e) => setPreviewSource(e.target.value)}>
                <option value="">占位图</option>
                {targets
                  .filter((t) => !t.missing && (group.startsWith('library') ? t.kind === 'library' : t.kind === 'collection'))
                  .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </Select>
              <div className="relative flex h-64 w-full items-center justify-center overflow-hidden rounded-lg border bg-muted/30 p-2">
                {previewSrc ? (
                  <img
                    key={previewSrc}
                    src={previewSrc}
                    alt="封面预览"
                    className="h-auto max-h-full w-auto max-w-full animate-in fade-in rounded-lg border object-contain duration-200 motion-reduce:animate-none"
                  />
                ) : null}
                {loading ? (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 text-xs text-white">生成中…</div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>配置与数据备份</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button onClick={exportBackup}>导出备份</Button>
            <Button variant="outline" onClick={() => document.getElementById('import-file')?.click()}>导入备份</Button>
            <input id="import-file" type="file" accept=".json" className="hidden" onChange={(e) => e.target.files?.[0] && importBackup(e.target.files[0])} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>访问令牌（可选）</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <PasswordInput aria-label="访问令牌" value={draft.accessToken || ''} placeholder="留空表示不启用" onChange={(e) => setDraft({ ...draft, accessToken: e.target.value })} className="max-w-sm" />
          <Button onClick={() => save({ accessToken: draft.accessToken })}>保存访问令牌</Button>
        </CardContent>
      </Card>

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md border border-input bg-card px-2.5 py-1.5 text-xs text-muted-foreground shadow-sm transition-[border-color,transform] duration-150 ease-out hover:border-primary/50 hover:text-foreground active:scale-[0.97]">
      <span className="relative h-[18px] w-[18px] shrink-0 overflow-hidden rounded border border-input">
        <span className="absolute inset-0" style={{ backgroundColor: value }} />
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label={label}
        />
      </span>
      <span>{label}</span>
    </label>
  );
}
