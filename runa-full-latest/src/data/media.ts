// Файлы блоков: загрузка в приватное хранилище и временные ссылки на показ.
import { useEffect, useState } from 'react';
import { newId } from '../core/order';
import { useApp } from '../state/store';
import { supabase } from './supabase';

export const MAX_BYTES = 50 * 1024 * 1024;

export interface Uploaded {
  path: string;
  name: string;
  size: number;
  mime: string;
}

const safeName = (n: string) => n.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_').slice(-60) || 'file';

export async function uploadMedia(file: File): Promise<Uploaded> {
  if (file.size > MAX_BYTES) throw new Error(`«${file.name}» больше 50 МБ — такой файл загрузить нельзя`);
  const uid = useApp.getState().session?.user.id;
  if (!uid) throw new Error('Войдите в аккаунт, чтобы загружать файлы');
  const path = `${uid}/${newId()}-${safeName(file.name)}`;
  const { error } = await supabase.storage.from('media').upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    cacheControl: '31536000',
  });
  if (error) throw new Error(`Не удалось загрузить «${file.name}»: ${error.message}`);
  return { path, name: file.name, size: file.size, mime: file.type };
}

const TTL = 3600;
const cache = new Map<string, { url: string; exp: number }>();
const inflight = new Map<string, Promise<string>>();

/** Временная ссылка на файл (час). Хранится в памяти и обновляется сама. */
export function mediaUrl(path: string, download?: string, fresh = false): Promise<string> {
  const key = `${path}|${download ?? ''}`;
  const hit = cache.get(key);
  if (!fresh && hit && hit.exp - Date.now() > 60_000) return Promise.resolve(hit.url);
  const waiting = inflight.get(key);
  if (waiting && !fresh) return waiting;
  const p = (async () => {
    const { data, error } = await supabase.storage.from('media').createSignedUrl(path, TTL, download ? { download } : undefined);
    if (error || !data) throw new Error(error?.message ?? 'Файл недоступен');
    cache.set(key, { url: data.signedUrl, exp: Date.now() + TTL * 1000 });
    return data.signedUrl;
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/** Адрес для показа: файл из хранилища (path) или внешняя ссылка (src). */
export function useMediaUrl(path: string | null | undefined, src: string | null | undefined, download?: string) {
  const [state, setState] = useState<{ url: string | null; failed: boolean }>({ url: path ? null : (src ?? null), failed: false });
  useEffect(() => {
    let off = false;
    if (!path) {
      setState({ url: src ?? null, failed: false });
      return;
    }
    setState({ url: null, failed: false });
    mediaUrl(path, download)
      .then((url) => !off && setState({ url, failed: false }))
      .catch(() => !off && setState({ url: null, failed: true }));
    return () => {
      off = true;
    };
  }, [path, src, download]);
  const retry = () => {
    if (!path) return;
    mediaUrl(path, download, true)
      .then((url) => setState({ url, failed: false }))
      .catch(() => setState({ url: null, failed: true }));
  };
  return { ...state, retry };
}

export interface Preview {
  title: string;
  description: string;
  image: string;
  site: string;
}

export async function fetchPreview(url: string): Promise<Preview> {
  const { data, error } = await supabase.functions.invoke('link-preview', { body: { url } });
  if (error || !data) throw new Error(error?.message ?? 'Нет ответа');
  return {
    title: String(data.title ?? ''),
    description: String(data.description ?? ''),
    image: String(data.image ?? ''),
    site: String(data.site ?? ''),
  };
}
