import { useEffect, useState } from 'react';
import type { Camera } from '../db';
import { useSettings } from '../db';
import { canShareFile, downloadBackup } from '../lib/backup';
import { cardFileName, renderCameraCard, renderCollectionCard, type CardFormat, type CardStyle } from '../lib/shareCard';
import { tx } from '../lib/i18n';
import { toast } from '../lib/toast';
import { Segmented, Sheet } from './ui';

export type ShareTarget =
  | { kind: 'camera'; camera: Camera; photoId?: string | null; index?: number }
  | { kind: 'collection'; cameras: Camera[] };

/** Thứ tự máy trong bộ sưu tập (theo ngày mua / ngày thêm) — dùng cho "Nº 07" */
export function collectionIndex(cams: Camera[], id: string) {
  const owned = cams.filter((c) => c.status === 'owned' && !c.deletedAt);
  const key = (c: Camera) => (c.purchaseDate ? Date.parse(c.purchaseDate) : c.createdAt) || c.createdAt;
  const i = [...owned].sort((a, b) => key(a) - key(b)).findIndex((c) => c.id === id);
  return i >= 0 ? i : undefined;
}

export function ShareSheet({ target, onClose }: { target: ShareTarget | null; onClose: () => void }) {
  const settings = useSettings();
  const [style, setStyle] = useState<CardStyle>('catalog');
  const [format, setFormat] = useState<CardFormat>('post');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!target) return;
    let alive = true;
    setBusy(true);
    const opts = { style, format, owner: settings.ownerName, accent: settings.accent };
    const job = target.kind === 'camera'
      ? renderCameraCard(target.camera, { ...opts, photoId: target.photoId, index: target.index })
      : renderCollectionCard(target.cameras, opts);
    job.then((blob) => {
      if (!alive) return;
      const name = target.kind === 'camera' ? cardFileName([target.camera.brand, target.camera.model, style]) : cardFileName(['collection', style]);
      setFile(new File([blob], name, { type: 'image/jpeg' }));
      setUrl((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(blob); });
    }).catch(() => { if (alive) toast(tx("Không tạo được ảnh")); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [target, style, format, settings.ownerName, settings.accent]);

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  useEffect(() => { if (!target) { setFile(null); setUrl(null); } }, [target]);

  const share = async () => {
    if (!file) return;
    if (canShareFile(file)) {
      try { await navigator.share({ files: [file] }); } catch { /* người dùng huỷ */ }
    } else {
      downloadBackup(file);
      toast(tx("Đã tải ảnh về"));
    }
  };

  const title = target?.kind === 'collection' ? tx("Chia sẻ bộ sưu tập") : tx("Chia sẻ ảnh máy");
  return (
    <Sheet open={!!target} onClose={onClose} title={title} tall>
      <div className="share-preview" data-format={format} aria-busy={busy}>
        {url ? <img src={url} alt={tx("Ảnh xem trước")} /> : <span className="thumb-wait" />}
      </div>
      <div className="field">{tx("Kiểu")}
        <Segmented label={tx("Kiểu ảnh")} value={style} onChange={setStyle}
          options={[{ value: 'catalog', label: tx("Tối giản") }, { value: 'film', label: target?.kind === 'collection' ? tx("Contact sheet") : tx("Khung phim") }]} />
      </div>
      <div className="field">{tx("Khổ")}
        <Segmented label={tx("Khổ ảnh")} value={format} onChange={setFormat}
          options={[{ value: 'post', label: tx("Bài đăng 4:5") }, { value: 'story', label: tx("Story 9:16") }]} />
      </div>
      <button type="button" className="btn" disabled={!file || busy} onClick={share}>
        {canShareFile(file ?? new File([], 'x.jpg', { type: 'image/jpeg' })) ? tx("Chia sẻ") : tx("Tải ảnh về")}</button>
      <p className="muted" style={{ fontSize: 12, lineHeight: 1.45 }}>{tx("Ảnh được tạo ngay trên máy, không kèm giá, số serial hay vị trí GPS của ảnh gốc.")}</p>
    </Sheet>
  );
}
