'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { api, rawFetch } from '@/lib/api';
import { toast } from '@/components/toast-provider';
import { cn, fmtTime } from '@/lib/utils';

type Settings = Record<string, any>;
type Status = { lastRun?: string; lastReason?: string; lastError?: string; nextRun?: string; counts?: Record<string, number>; webhook?: { url?: string; lastEvent?: string; lastEventAt?: string; test?: { armed?: boolean; result?: { event?: string; at?: string } } } };

const GROUPS = [
  { key: 'library-single', label: '媒体库·单图海报' },
  { key: 'library-wall3', label: '媒体库·海报墙' },
  { key: 'collection-single', label: '合集·单图海报' }
];

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
        style: group.endsWith('-wall3') ? 'wall3' : 'single',
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

  if (!s || !draft) return <div className="text-sm text-muted-foreground">加载中…</div>;

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
        if (!window.confirm('导入将覆盖当前全部配置与数据，确定继续吗？')) return;
        await api('/api/import', { method: 'POST', body: JSON.stringify({ data }) });
        toast('ok', '导入成功，正在刷新…');
        load();
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
          styleByKind: { library: 'single', collection: 'single' },
          defaultPickByByStyle: draft.defaultPickByByStyle,
          coverByStyle: draft.coverByStyle
        })
      });
      setS(r.settings);
      setDraft(r.settings);
      const kind = group.startsWith('library') ? 'library' : 'collection';
      const style = group.endsWith('-wall3') ? 'wall3' : 'single';
      const label = `${kind === 'library' ? '媒体库' : '合集'}·${style === 'wall3' ? '海报墙' : '单图海报'}`;
      api('/api/sync', { method: 'POST', body: JSON.stringify({ force: true, onlyKind: kind, onlyStyle: style }) }).catch((e: any) => toast('err', e.message));
      toast('info', `设置已保存，开始重新生成${label}封面（仅未锁定项）`);
    } catch (e: any) {
      toast('err', `保存失败：${e.message}`);
    }
  };

  const saveWebdavSettings = async () => {
    const r = await api<{ settings: Settings }>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({
        webdavUrl: draft.webdavUrl,
        webdavUser: draft.webdavUser,
        webdavPassword: draft.webdavPassword,
        webdavFile: draft.webdavFile,
        webdavAutoBackup: draft.webdavAutoBackup,
        webdavIntervalHours: draft.webdavIntervalHours,
        webdavSync: draft.webdavSync
      })
    });
    setS(r.settings);
    setDraft(r.settings);
    return r.settings;
  };

  const webdav = draft;

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
              <Input value={draft.embyUrl || ''} placeholder="http://192.168.1.100:8096" onChange={(e) => setDraft({ ...draft, embyUrl: e.target.value })} />
            </Field>
            <Field label="API 密钥">
              <Input type="password" value={draft.embyApiKey || ''} onChange={(e) => setDraft({ ...draft, embyApiKey: e.target.value })} />
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
              <Input value={draft.cron || ''} onChange={(e) => setDraft({ ...draft, cron: e.target.value })} />
            </Field>
            <Field label="Webhook 防抖（毫秒）">
              <Input type="number" value={draft.webhookDebounceMs ?? 20000} onChange={(e) => setDraft({ ...draft, webhookDebounceMs: Number(e.target.value) })} />
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
          </div>
          <Button onClick={() => save({ cron: draft.cron, webhookDebounceMs: draft.webhookDebounceMs, autoEnableNew: draft.autoEnableNew, syncOnStart: draft.syncOnStart })}>
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
                    className={cn('rounded-md border px-2.5 py-1 text-xs hover:border-primary', curPick === p ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground')}
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
                    className={cn('rounded-md border px-2.5 py-1 text-xs hover:border-primary', (cur.backgroundMode || 'gradient') === b ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground')}
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
                  <span className="mb-1 block text-xs text-muted-foreground">标题字号</span>
                  <Input type="number" min={18} max={480} value={cur.titleSize ?? 84} onChange={(e) => setGroupDraft({ titleSize: Number(e.target.value) })} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-muted-foreground">副标题字号</span>
                  <Input type="number" min={12} max={240} value={cur.subtitleSize ?? 36} onChange={(e) => setGroupDraft({ subtitleSize: Number(e.target.value) })} />
                </label>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground/70">按输出宽度等比缩放</p>
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

            <div className="flex flex-col gap-2 pt-1">
              <Button
                className="w-full"
                onClick={() =>
                  save({
                    styleByKind: { library: 'single', collection: 'single' },
                    defaultPickByByStyle: draft.defaultPickByByStyle,
                    coverByStyle: draft.coverByStyle
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
                    className="h-auto max-h-full w-auto max-w-full animate-in fade-in rounded-lg border object-contain duration-200"
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

          <div className="border-t pt-3">
            <div className="mb-2 text-sm font-semibold">WebDAV 同步</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="WebDAV 地址">
                <Input placeholder="https://dav.example.com/dav/emby-cover-studio" value={webdav.webdavUrl || ''} onChange={(e) => setDraft({ ...draft, webdavUrl: e.target.value })} />
              </Field>
              <Field label="用户名">
                <Input placeholder="用户名" value={webdav.webdavUser || ''} onChange={(e) => setDraft({ ...draft, webdavUser: e.target.value })} />
              </Field>
              <Field label="密码">
                <Input type="password" placeholder="密码" value={webdav.webdavPassword || ''} onChange={(e) => setDraft({ ...draft, webdavPassword: e.target.value })} />
              </Field>
              <Field label="备份文件名">
                <Input value={webdav.webdavFile || 'backup.json'} onChange={(e) => setDraft({ ...draft, webdavFile: e.target.value })} />
              </Field>
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs">
              <Switch checked={!!webdav.webdavAutoBackup} onCheckedChange={(v) => setDraft({ ...draft, webdavAutoBackup: v })} />
              自动备份
              <Input type="number" className="w-20" value={webdav.webdavIntervalHours ?? 24} onChange={(e) => setDraft({ ...draft, webdavIntervalHours: Number(e.target.value) })} />
              小时
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-4 text-xs">
              <span className="text-muted-foreground">同步内容：</span>
              <label className="flex items-center gap-1.5">
                <Switch checked={webdav.webdavSync?.settings !== false} onCheckedChange={(v) => setDraft({ ...draft, webdavSync: { ...(webdav.webdavSync || {}), settings: v } })} />
                设置（含密钥）
              </label>
              <label className="flex items-center gap-1.5">
                <Switch checked={webdav.webdavSync?.targets !== false} onCheckedChange={(v) => setDraft({ ...draft, webdavSync: { ...(webdav.webdavSync || {}), targets: v } })} />
                媒体库/合集配置
              </label>
              <label className="flex items-center gap-1.5">
                <Switch checked={webdav.webdavSync?.tasks !== false} onCheckedChange={(v) => setDraft({ ...draft, webdavSync: { ...(webdav.webdavSync || {}), tasks: v } })} />
                任务记录
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={async () => { try { await saveWebdavSettings(); toast('ok', 'WebDAV 设置已保存'); } catch (e: any) { toast('err', `保存失败：${e.message}`); } }}>
                保存设置
              </Button>
              <Button size="sm" variant="outline" onClick={async () => { try { await saveWebdavSettings(); await api('/api/webdav/test', { method: 'POST', body: '{}' }); toast('ok', 'WebDAV 连接正常'); } catch (e: any) { toast('err', `连接失败：${e.message}`); } }}>
                测试连接
              </Button>
              <Button size="sm" onClick={async () => { try { await saveWebdavSettings(); const r = await api<{ url?: string }>('/api/webdav/backup', { method: 'POST', body: '{}' }); toast('ok', `已备份到 ${r.url}`); load(); } catch (e: any) { toast('err', `备份失败：${e.message}`); } }}>
                立即备份
              </Button>
              <Button size="sm" variant="outline" onClick={async () => { if (!window.confirm('从 WebDAV 恢复将覆盖当前数据，确定？')) return; try { await saveWebdavSettings(); await api('/api/webdav/restore', { method: 'POST', body: '{}' }); toast('ok', '已从 WebDAV 恢复备份'); load(); } catch (e: any) { toast('err', `恢复失败：${e.message}`); } }}>
                从 WebDAV 恢复
              </Button>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">上次备份：{fmtTime(webdav.webdavLastBackup)}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>访问令牌（可选）</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Input type="password" value={draft.accessToken || ''} placeholder="留空表示不启用" onChange={(e) => setDraft({ ...draft, accessToken: e.target.value })} className="max-w-sm" />
          <Button onClick={() => save({ accessToken: draft.accessToken })}>保存访问令牌</Button>
        </CardContent>
      </Card>

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
    <label className="flex cursor-pointer items-center gap-2 rounded-md border border-input bg-card px-2.5 py-1.5 text-xs text-muted-foreground shadow-sm transition-colors hover:border-primary/50 hover:text-foreground">
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
