export class EmbyError extends Error {
  constructor(message, status = 0, body = '') {
    super(message);
    this.name = 'EmbyError';
    this.status = status;
    this.body = body;
  }
}

export function normalizeEmbyBase(raw) {
  let u = String(raw || '').trim().replace(/\/+$/, '');
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = `http://${u}`;
  try {
    const parsed = new URL(u);
    if (!parsed.pathname.endsWith('/emby')) u = `${u}/emby`;
  } catch {
    u = '';
  }
  return u;
}

export const LIBRARY_ITEM_TYPES = {
  movies: ['Movie'],
  tvshows: ['Series'],
  music: ['MusicAlbum'],
  musicvideos: ['MusicVideo'],
  homevideos: ['Video'],
  books: ['Book'],
  photos: ['Photo'],
  boxsets: ['BoxSet'],
  collections: ['BoxSet']
};

const RELEVANT_EVENTS = new Set([
  'item.added',
  'item.updated',
  'item.removed',
  'library.new',
  'library.updated',
  'collection.updated'
]);

export function isRelevantWebhookEvent(event) {
  return RELEVANT_EVENTS.has(String(event || '').toLowerCase());
}

export class EmbyClient {
  constructor(settings) {
    this.base = normalizeEmbyBase(settings.embyUrl);
    this.key = String(settings.embyApiKey || '').trim();
    this.userId = null;
  }

  get configured() {
    return Boolean(this.base && this.key);
  }

  async _fetch(path, opts = {}) {
    if (!this.configured) throw new EmbyError('尚未配置 Emby 服务器地址或 API 密钥', 0);
    const url = `${this.base}${path}`;
    const res = await fetch(url, {
      method: opts.method || 'GET',
      headers: {
        'X-Emby-Token': this.key,
        Accept: 'application/json',
        ...(opts.headers || {})
      },
      body: opts.body,
      signal: AbortSignal.timeout(opts.timeout || 20000)
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new EmbyError(`Emby ${opts.method || 'GET'} ${path} 失败（HTTP ${res.status}）`, res.status, text);
    }
    return res;
  }

  async _json(path, opts) {
    const res = await this._fetch(path, opts);
    return res.json();
  }

  async _buffer(path, opts) {
    const res = await this._fetch(path, opts);
    return Buffer.from(await res.arrayBuffer());
  }

  async systemInfo() {
    return this._json('/System/Info');
  }

  async _users() {
    const arr = await this._json('/Users');
    this.userId = arr?.[0]?.Id || null;
    return arr || [];
  }

  async _ensureUser() {
    if (!this.userId) await this._users().catch(() => {});
    return this.userId;
  }

  async _items(qs) {
    const uid = await this._ensureUser();
    const userPath = uid ? `/Users/${uid}/Items?${qs}` : null;
    const plainPath = `/Items?${qs}`;
    const attempts = userPath ? [userPath, plainPath] : [plainPath];
    let lastErr = null;
    for (const p of attempts) {
      try {
        return await this._json(p);
      } catch (e) {
        lastErr = e;
        if (e.status !== 401 && e.status !== 404) throw e;
      }
    }
    throw lastErr;
  }

  async test() {
    const info = await this.systemInfo();
    let users = [];
    try {
      users = await this._users();
    } catch {
      users = [];
    }
    return {
      ok: true,
      serverName: info.ServerName || 'Emby',
      version: info.Version || '',
      userId: this.userId,
      users: users.map((u) => ({ id: u.Id, name: u.Name }))
    };
  }

  async getLibraries() {
    const list = await this._json('/Library/VirtualFolders');
    let libs = (list || []).map((v) => ({
      id: String(v.ItemId || v.PrimaryImageItemId || ''),
      name: v.Name || '',
      collectionType: v.CollectionType || '',
      kind: 'library'
    })).filter((v) => v.id && v.name);
    if (!libs.length) {
      // 兜底：通过用户视图获取媒体库
      const uid = await this._ensureUser();
      if (uid) {
        const data = await this._json(`/Users/${uid}/Views`);
        libs = (data.Items || []).map((v) => ({
          id: String(v.Id),
          name: v.Name || '',
          collectionType: v.CollectionType || '',
          kind: 'library'
        })).filter((v) => v.id && v.name);
      }
    }
    return libs;
  }

  async getCollections() {
    const qs = new URLSearchParams({
      IncludeItemTypes: 'BoxSet',
      Recursive: 'true',
      Fields: 'ChildCount,PrimaryImageAspectRatio',
      SortBy: 'SortName',
      SortOrder: 'Ascending',
      Limit: '500'
    });
    const data = await this._items(qs.toString());
    return (data.Items || []).map((i) => ({
      id: String(i.Id),
      name: i.Name || '',
      childCount: i.ChildCount ?? 0,
      kind: 'collection',
      collectionType: ''
    }));
  }

  async getCoverItems(target, maxItems = 20) {
    const qs = new URLSearchParams({
      Recursive: 'true',
      Limit: String(maxItems || 50),
      Fields: 'PrimaryImageAspectRatio,DateCreated,PremiereDate'
    });
    if (target.kind === 'library') {
      const types = LIBRARY_ITEM_TYPES[target.collectionType] || [];
      if (types.length) qs.set('IncludeItemTypes', types.join(','));
      else qs.set('ExcludeItemTypes', 'BoxSet,CollectionFolder,Folder,Person,Studio,Genre,Year');
      qs.set('SortBy', 'DateCreated');
      qs.set('SortOrder', 'Descending');
      qs.set('ParentId', target.id);
    } else {
      qs.set('ParentId', target.id);
      // 封面候选只取影片等媒体条目，排除嵌套的合集/文件夹
      qs.set('ExcludeItemTypes', 'BoxSet,CollectionFolder,Folder');
    }
    const data = await this._items(qs.toString());
    return (data.Items || []).map((i) => {
      const tags = i.ImageTags || {};
      return {
        id: String(i.Id),
        name: i.Name || '',
        hasPrimary: Boolean(tags.Primary || tags.Thumb),
        imageTag: tags.Primary || tags.Thumb || '',
        dateCreated: i.DateCreated || '',
        premiereDate: i.PremiereDate || ''
      };
    });
  }

  // 查询条目所属的祖先（媒体库、合集等），用于 Webhook 精准定位相关合集
  async getItemAncestors(itemId) {
    const uid = await this._ensureUser();
    const paths = uid
      ? [`/Users/${uid}/Items/${itemId}/Ancestors`, `/Items/${itemId}/Ancestors`]
      : [`/Items/${itemId}/Ancestors`];
    let lastErr = null;
    for (const p of paths) {
      try {
        const data = await this._json(p);
        const items = Array.isArray(data) ? data : (data.Items || []);
        return items.map((a) => ({ id: String(a.Id || ''), name: a.Name || '', type: a.Type || '' }));
      } catch (e) {
        lastErr = e;
        if (e.status !== 401 && e.status !== 404) throw e;
      }
    }
    throw lastErr;
  }

  async getImage(itemId, maxWidth = 400) {
    const p = `/Items/${itemId}/Images/Primary?maxWidth=${maxWidth}&quality=90`;
    try {
      return await this._buffer(p);
    } catch (e) {
      if (e.status !== 401 && e.status !== 404) throw e;
      const uid = await this._ensureUser();
      if (uid) {
        return await this._buffer(`/Users/${uid}/Items/${itemId}/Images/Primary?maxWidth=${maxWidth}&quality=90`);
      }
      throw e;
    }
  }

  // 获取封面原始文件（不加任何缩放/质量参数），用于对比 Emby 当前封面是否与本工具上次生成的一致
  async getOriginalImage(itemId) {
    const p = `/Items/${itemId}/Images/Primary`;
    try {
      return await this._buffer(p);
    } catch (e) {
      if (e.status !== 401 && e.status !== 404) throw e;
      const uid = await this._ensureUser();
      if (uid) {
        return await this._buffer(`/Users/${uid}/Items/${itemId}/Images/Primary`);
      }
      throw e;
    }
  }

  async uploadImage(itemId, pngBuffer) {
    const p = `/Items/${itemId}/Images/Primary`;
    const b64 = pngBuffer.toString('base64');
    try {
      const res = await this._fetch(p, {
        method: 'POST',
        body: b64,
        headers: { 'Content-Type': 'image/png' }
      });
      return res.status;
    } catch (e) {
      if (e.status === 400 || e.status === 415) {
        // 部分版本（如 Jellyfin）接受原始字节
        const res = await this._fetch(p, {
          method: 'POST',
          body: pngBuffer,
          headers: { 'Content-Type': 'image/png' }
        });
        return res.status;
      }
      throw e;
    }
  }
}
