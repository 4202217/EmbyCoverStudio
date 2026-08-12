'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn, fmtTime } from '@/lib/utils';

type Settings = Record<string, any>;

async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) }
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `请求失败（${res.status}）`);
  return data as T;
}

const GROUPS = [
  { key: 'library-single', label: '媒体库·单图海报' },
  { key: 'library-wall3', label: '媒体库·海报墙' },
  { key: 'collection-single', label: '合集·单图海报' }
];

export default function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [group, setGroup] = useState('library-single');
  const [msg, setMsg] = useState('');
  const [draft, setDraft] = useState<Settings | null>(null);

  const load = async () => {
    try {
      const r = await api<{ settings: Settings }>('/api/settings');
      setS(r.settings);
      setDraft(r.settings);
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
      setMsg('已保存');
      setTimeout(() => setMsg(''), 2000);
    } catch (e: any) {
      setMsg(`保存失败：${e.message}`);
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
    const res = await fetch('/api/export');
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `emby-cover-studio-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importBackup = (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (!data?.version || !data.settings || !data.targets) throw new Error('格式不正确');
        if (!window.confirm('导入将覆盖当前全部配置与数据，确定继续吗？')) return;
        await api('/api/import', { method: 'POST', body: JSON.stringify({ data }) });
        setMsg('导入成功');
        load();
      } catch (e: any) {
        setMsg(`导入失败：${e.message}`);
      }
    };
    reader.readAsText(file);
  };

  const cur = draft.coverByStyle?.[group] || {};
  const curPick = draft.defaultPickByByStyle?.[group] || 'added';
  const webdav = draft;

  return (
    <div className="max-w-3xl space-y-6">
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
            <div>
              <div className="mb-1 text-xs text-muted-foreground">服务器地址</div>
              <Input value={draft.embyUrl || ''} placeholder="http://192.168.1.100:8096" onChange={(e) => setDraft({ ...draft, embyUrl: e.target.value })} />
            </div>
            <div>
              <div className="mb-1 text-xs text-muted-foreground">API 密钥</div>
              <Input type="password" value={draft.embyApiKey || ''} onChange={(e) => setDraft({ ...draft, embyApiKey: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => save({ embyUrl: draft.embyUrl, embyApiKey: draft.embyApiKey })}>保存连接设置</Button>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  const r = await api<{ serverName?: string; version?: string }>('/api/emby/test', { method: 'POST', body: JSON.stringify({ embyUrl: draft.embyUrl, embyApiKey: draft.embyApiKey }) });
                  setMsg(`连接成功：${r.serverName} v${r.version}`);
                } catch (e: any) {
                  setMsg(`连接失败：${e.message}`);
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
            <div>
              <div className="mb-1 text-xs text-muted-foreground">定时同步 cron</div>
              <Input value={draft.cron || ''} onChange={(e) => setDraft({ ...draft, cron: e.target.value })} />
            </div>
            <div>
              <div className="mb-1 text-xs text-muted-foreground">Webhook 防抖（毫秒）</div>
              <Input type="number" value={draft.webhookDebounceMs ?? 20000} onChange={(e) => setDraft({ ...draft, webhookDebounceMs: Number(e.target.value) })} />
            </div>
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
        </CardContent>
      </Card>

      <Card>
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

          <div className="space-y-3">
            <div>
              <div className="mb-1.5 text-xs font-semibold text-muted-foreground">选图依据</div>
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
            </div>
            <div>
              <div className="mb-1.5 text-xs font-semibold text-muted-foreground">背景模式</div>
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
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="mb-1 text-xs text-muted-foreground">标题字号</div>
                <Input type="number" value={cur.titleSize ?? 84} onChange={(e) => setGroupDraft({ titleSize: Number(e.target.value) })} />
              </div>
              <div>
                <div className="mb-1 text-xs text-muted-foreground">副标题字号</div>
                <Input type="number" value={cur.subtitleSize ?? 36} onChange={(e) => setGroupDraft({ subtitleSize: Number(e.target.value) })} />
              </div>
            </div>
          </div>
          <Button
            onClick={() =>
              save({
                defaultPickByByStyle: draft.defaultPickByByStyle,
                coverByStyle: draft.coverByStyle
              })
            }
          >
            保存封面配置
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>配置与数据备份</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button onClick={exportBackup}>导出备份</Button>
            <label>
              <Button variant="outline" onClick={() => document.getElementById('import-file')?.click()}>导入备份</Button>
              <input id="import-file" type="file" accept=".json" className="hidden" onChange={(e) => e.target.files?.[0] && importBackup(e.target.files[0])} />
            </label>
          </div>

          <div className="border-t pt-3">
            <div className="mb-2 text-sm font-semibold">WebDAV 同步</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input placeholder="https://dav.example.com/dav/emby-cover-studio" value={webdav.webdavUrl || ''} onChange={(e) => setDraft({ ...draft, webdavUrl: e.target.value })} />
              <Input placeholder="用户名" value={webdav.webdavUser || ''} onChange={(e) => setDraft({ ...draft, webdavUser: e.target.value })} />
              <Input type="password" placeholder="密码" value={webdav.webdavPassword || ''} onChange={(e) => setDraft({ ...draft, webdavPassword: e.target.value })} />
              <Input value={webdav.webdavFile || 'backup.json'} onChange={(e) => setDraft({ ...draft, webdavFile: e.target.value })} />
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs">
              <Switch checked={!!webdav.webdavAutoBackup} onCheckedChange={(v) => setDraft({ ...draft, webdavAutoBackup: v })} />
              自动备份
              <Input type="number" className="w-20" value={webdav.webdavIntervalHours ?? 24} onChange={(e) => setDraft({ ...draft, webdavIntervalHours: Number(e.target.value) })} />
              小时
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  save({
                    webdavUrl: draft.webdavUrl,
                    webdavUser: draft.webdavUser,
                    webdavPassword: draft.webdavPassword,
                    webdavFile: draft.webdavFile,
                    webdavAutoBackup: draft.webdavAutoBackup,
                    webdavIntervalHours: draft.webdavIntervalHours
                  })
                }
              >
                保存设置
              </Button>
              <Button size="sm" variant="outline" onClick={async () => { try { await api('/api/webdav/test', { method: 'POST', body: '{}' }); setMsg('连接正常'); } catch (e: any) { setMsg(`连接失败：${e.message}`); } }}>
                测试连接
              </Button>
              <Button size="sm" onClick={async () => { try { const r = await api<{ url?: string }>('/api/webdav/backup', { method: 'POST', body: '{}' }); setMsg(`已备份到 ${r.url}`); } catch (e: any) { setMsg(`备份失败：${e.message}`); } }}>
                立即备份
              </Button>
              <Button size="sm" variant="outline" onClick={async () => { if (!window.confirm('从 WebDAV 恢复将覆盖当前数据，确定？')) return; try { await api('/api/webdav/restore', { method: 'POST', body: '{}' }); setMsg('已恢复'); load(); } catch (e: any) { setMsg(`恢复失败：${e.message}`); } }}>
                从 WebDAV 恢复
              </Button>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">上次备份：{fmtTime(webdav.webdavLastBackup)}</div>
          </div>
        </CardContent>
      </Card>

      {msg ? <div className="text-sm text-muted-foreground">{msg}</div> : null}
    </div>
  );
}
