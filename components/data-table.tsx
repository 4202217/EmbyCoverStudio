'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Check, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

export type Column<T> = {
  key: string;
  label: string;
  width?: string;
  sortable?: boolean;
  filterOpts?: { value: string; label: string }[];
  render: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number;
};

type Sort = { key: string; dir: 1 | -1 } | null;

export function DataTable<T extends { [k: string]: any }>({
  columns,
  fetchData,
  emptyText = '暂无数据',
  initialSort = null,
  onLoaded,
  fetchPage,
  pageSize = 50
}: {
  columns: Column<T>[];
  fetchData: () => Promise<T[]>;
  emptyText?: string;
  initialSort?: { key: string; dir: 1 | -1 } | null;
  onLoaded?: (rows: T[]) => void;
  fetchPage?: (page: number, pageSize: number) => Promise<{ rows: T[]; total: number }>;
  pageSize?: number;
}) {
  const [rows, setRows] = useState<T[] | null>(null);
  const [sort, setSort] = useState<Sort>(initialSort);
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);
  const [popup, setPopup] = useState<{ key: string; x: number; y: number; width: number; below: boolean } | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadSeq = useRef(0);
  const firstPage = useRef(true);

  const load = async (animate = true, targetPage = page) => {
    const seq = ++loadSeq.current;
    if (animate) setLoading(true);
    try {
      if (fetchPage) {
        const r = await fetchPage(targetPage, pageSize);
        if (seq !== loadSeq.current) return;
        setRows(r.rows);
        setTotal(r.total);
        onLoaded?.(r.rows);
      } else {
        const data = await fetchData();
        if (seq !== loadSeq.current) return;
        setRows(data);
        onLoaded?.(data);
      }
    } catch {
      if (seq === loadSeq.current) setRows([]);
    } finally {
      if (animate && seq === loadSeq.current) setTimeout(() => setLoading(false), 350);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!fetchPage) return;
    if (firstPage.current) {
      firstPage.current = false;
      return;
    }
    load(true, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  useEffect(() => {
    if (!popup) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-th-filter]') || t.closest('[data-filter-popup]')) return;
      setPopup(null);
    };
    const onScroll = () => setPopup(null);
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('wheel', onScroll, { passive: true });
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('wheel', onScroll);
    };
  }, [popup]);

  const filterCols = useMemo(() => columns.filter((c) => c.filterOpts), [columns]);

  const visible = useMemo(() => {
    if (!rows) return [];
    let list = rows.filter((r) =>
      filterCols.every((c) => {
        const vals = filters[c.key];
        if (!vals || !vals.length) return true;
        return vals.includes(String(r[c.key] ?? ''));
      })
    );
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      const dir = sort.dir;
      list = [...list].sort((a, b) => {
        let cmp = 0;
        if (col?.sortValue) cmp = String(col.sortValue(a)).localeCompare(String(col.sortValue(b)), 'zh-CN', { numeric: true });
        else if (sort.key === 'ts') cmp = new Date(a.ts || 0).getTime() - new Date(b.ts || 0).getTime();
        else if (typeof a[sort.key] === 'number' && typeof b[sort.key] === 'number') cmp = a[sort.key] - b[sort.key];
        else cmp = String(a[sort.key] ?? '').localeCompare(String(b[sort.key] ?? ''), 'zh-CN');
        return cmp * dir;
      });
    }
    return list;
  }, [rows, sort, filters, filterCols, columns]);

  const toggleSort = (key: string) => {
    setSort((s) => {
      if (s?.key === key) return { key, dir: s.dir === 1 ? -1 : 1 };
      return { key, dir: key === 'seq' || key === 'ts' ? -1 : 1 };
    });
  };

  const openFilter = (key: string, anchor: HTMLElement) => {
    const rect = anchor.getBoundingClientRect();
    const width = 200;
    let left = rect.left;
    let top = rect.bottom + 4;
    const below = top + 300 <= window.innerHeight - 8;
    if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
    if (!below) top = Math.max(8, rect.top - 300);
    setPopup({ key, x: left, y: top, width, below });
  };

  const pendingFilters = (key: string) => filters[key] || [];

  return (
    <div>
      <div ref={scrollRef} aria-busy={rows === null || loading} className="relative max-h-[420px] overflow-auto rounded-lg border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card/90 shadow-[0_1px_0_0_hsl(var(--border))] backdrop-blur-sm">
            <TableRow>
              {columns.map((c) => {
                const active = sort?.key === c.key;
                const filtered = (filters[c.key]?.length || 0) > 0;
                return (
                  <TableHead
                    key={c.key}
                    style={c.width ? { width: c.width } : undefined}
                    aria-sort={active && c.sortable ? (sort!.dir === 1 ? 'ascending' : 'descending') : undefined}
                    className={cn(c.sortable && 'cursor-pointer select-none whitespace-nowrap')}
                  >
                    <button
                      type="button"
                      data-th-filter={c.filterOpts ? '1' : undefined}
                      className={cn(
                        'flex w-full items-center gap-1 rounded px-0 py-0 text-left text-xs font-medium text-muted-foreground',
                        c.filterOpts ? 'cursor-pointer' : 'cursor-pointer',
                        active && 'text-foreground'
                      )}
                      onClick={(e) => {
                        if (c.filterOpts) {
                          e.stopPropagation();
                          openFilter(c.key, e.currentTarget);
                        } else if (c.sortable) {
                          toggleSort(c.key);
                        }
                      }}
                    >
                      <span className="whitespace-nowrap">{c.label}</span>
                      {c.sortable ? (
                        active ? (
                          sort!.dir === 1 ? (
                            <ArrowUp aria-hidden="true" className="h-3 w-3 shrink-0" />
                          ) : (
                            <ArrowDown aria-hidden="true" className="h-3 w-3 shrink-0" />
                          )
                        ) : (
                          <ArrowUpDown aria-hidden="true" className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                        )
                      ) : null}
                      {c.filterOpts ? (
                        <span className={cn('ml-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-sm border', filtered ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                          <Check aria-hidden="true" className={cn('h-2.5 w-2.5', !filtered && 'opacity-0')} />
                        </span>
                      ) : null}
                    </button>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows === null ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  {columns.map((c) => (
                    <TableCell key={c.key} className="py-3">
                      <div className="h-3.5 w-full max-w-[140px] animate-pulse rounded bg-muted/60" style={{ opacity: 1 - i * 0.12 }} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : visible.length ? (
              visible.map((r, i) => (
                <TableRow key={i} className="transition-colors duration-150 ease-out">
                  {columns.map((c) => <TableCell key={c.key} className="align-middle">{c.render(r)}</TableCell>)}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-10 text-center">
                  <div className="mx-auto flex w-fit flex-col items-center gap-1.5 text-sm text-muted-foreground">
                    <ArrowUpDown aria-hidden="true" className="h-5 w-5 text-muted-foreground/40" />
                    {emptyText}
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {popup ? (
        <div
          data-filter-popup
          className="fixed z-50 animate-in fade-in zoom-in-95 rounded-md border bg-popover p-2 text-xs text-popover-foreground shadow-pop duration-150 ease-out motion-reduce:animate-none"
          style={{ left: popup.x, top: popup.y, width: popup.width, transformOrigin: popup.below ? 'top left' : 'bottom left' }}
          onClick={(e) => e.stopPropagation()}
        >
          <FilterMenu
            col={columns.find((c) => c.key === popup.key)!}
            sort={sort}
            selected={pendingFilters(popup.key)}
            onSort={(dir) => {
              setSort({ key: popup.key, dir });
              setPopup(null);
            }}
            onToggle={(value) => {
              const p = pendingFilters(popup.key);
              const next = p.includes(value) ? p.filter((v) => v !== value) : [...p, value];
              setFilters((f) => ({ ...f, [popup.key]: next }));
            }}
            onAll={(checked) => setFilters((f) => ({ ...f, [popup.key]: checked ? [] : (columns.find((c) => c.key === popup.key)?.filterOpts || []).map((o) => o.value) }))}
            onClear={() => setFilters((f) => ({ ...f, [popup.key]: [] }))}
          />
        </div>
      ) : null}

      <div className="mt-2 flex items-center justify-between gap-2">
        {fetchPage ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>共 {total} 条</span>
            <Button size="sm" variant="outline" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
              上一页
            </Button>
            <span>{page} / {Math.max(1, Math.ceil(total / pageSize))}</span>
            <Button size="sm" variant="outline" disabled={page >= Math.ceil(total / pageSize) || loading} onClick={() => setPage((p) => p + 1)}>
              下一页
            </Button>
          </div>
        ) : (
          <span />
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => load()}
          disabled={loading}
          className="min-w-[64px]"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          刷新
        </Button>
      </div>
    </div>
  );
}

function FilterMenu<T>({
  col,
  sort,
  selected,
  onSort,
  onToggle,
  onAll,
  onClear
}: {
  col: Column<T>;
  sort: Sort;
  selected: string[];
  onSort: (dir: 1 | -1) => void;
  onToggle: (value: string) => void;
  onAll: (checked: boolean) => void;
  onClear: () => void;
}) {
  const opts = col.filterOpts || [];
  return (
    <div className="space-y-1">
      <div className="grid grid-cols-2 gap-1">
        <button
          className={cn('cursor-pointer rounded border px-2 py-1 hover:border-primary', sort?.key === col.key && sort.dir === 1 ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground')}
          onClick={() => onSort(1)}
        >
          升序
        </button>
        <button
          className={cn('cursor-pointer rounded border px-2 py-1 hover:border-primary', sort?.key === col.key && sort.dir === -1 ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground')}
          onClick={() => onSort(-1)}
        >
          降序
        </button>
      </div>
      <div className="my-1.5 border-t" />
      <label className="flex cursor-pointer items-center gap-1.5 py-0.5">
        <input type="checkbox" className="accent-primary" checked={selected.length === 0} onChange={(e) => onAll(e.target.checked)} />
        全选
      </label>
      {opts.map((o) => (
        <label key={o.value} className="flex cursor-pointer items-center gap-1.5 py-0.5">
          <input type="checkbox" className="accent-primary" checked={selected.includes(o.value)} onChange={() => onToggle(o.value)} />
          {o.label}
        </label>
      ))}
      <div className="my-1.5 border-t" />
      <button className="cursor-pointer text-muted-foreground underline underline-offset-2 hover:text-foreground" onClick={onClear}>
        清空筛选
      </button>
    </div>
  );
}
