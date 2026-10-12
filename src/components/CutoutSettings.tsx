import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { cancelDownload, deleteHq, downloadHq, HQ_ID, manifest, useDownloadState } from '../lib/modelStore';
import { cutoutEngineInfo, precutAll, precutCounts, resetCutoutEngine, stopPrecut, usePrecut } from '../lib/cutout';
import { fmtTs } from '../lib/format';
import { tx } from '../lib/i18n';
import { toast } from '../lib/toast';
import { SubPage } from './SubPage';

const mb = (n: number) => `${Math.round(n / 1e6)} MB`;

/** Nhãn ngắn cho dòng menu Cài đặt */
export function useCutoutLabel() {
  const hq = useLiveQuery(() => db.models.get(HQ_ID).then((m) => !!m), []);
  return hq ? tx("Chất lượng cao") : tx("Cơ bản");
}

export function CutoutPage() {
  const hq = useLiveQuery(() => db.models.get(HQ_ID), []);
  const dl = useDownloadState();
  const pre = usePrecut();
  const [size, setSize] = useState<number | null>(null);
  const [counts, setCounts] = useState<{ done: number; total: number } | null>(null);
  const [hqFailed, setHqFailed] = useState(false);

  useEffect(() => { manifest().then((m) => setSize(m.size)).catch(() => {}); }, []);
  useEffect(() => { precutCounts().then(setCounts).catch(() => {}); }, [hq, pre.running, pre.done]);
  // Có mô hình nhưng máy không nạp nổi (thiếu bộ nhớ) → đang dùng tạm mô hình cơ bản
  useEffect(() => { if (hq) cutoutEngineInfo().then((i) => setHqFailed(!i.hq)).catch(() => setHqFailed(true)); else setHqFailed(false); }, [hq]);

  const start = async () => {
    const ok = await downloadHq();
    if (ok) {
      toast(tx("Đã tải xong mô hình. App sẽ tách nền sẵn các ảnh máy."));
      await resetCutoutEngine();
      precutAll();
    }
  };
  const remove = async () => {
    if (!confirm(tx("Xoá mô hình chất lượng cao khỏi máy? Ảnh chia sẻ sẽ dùng lại mô hình cơ bản."))) return;
    stopPrecut();
    await deleteHq();
    await resetCutoutEngine();
    toast(tx("Đã xoá mô hình"));
  };

  const busy = dl.phase === 'downloading' || dl.phase === 'verifying';
  return (
    <SubPage title={tx("Tách nền ảnh máy")}>
      <section className="section px" style={{ gap: 14 }}>
        <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--text-2)' }}>
          {tx("Ảnh chia sẻ kiểu collage, pop art, sticker cần cắt rời cái máy khỏi nền. Việc này chạy ngay trên điện thoại, ảnh không gửi đi đâu.")}</p>
        <div className="rows">
          <div><span>{tx("Mô hình đang dùng")}</span><span className="mono">{hq ? 'ISNet' : 'U²-Net (nhỏ)'}</span></div>
          {hq && <div><span>{tx("Đã tải")}</span><span className="mono muted">{fmtTs(hq.at)} · {mb(hq.size)}</span></div>}
          {hq && counts && <div><span>{tx("Ảnh bìa đã tách sẵn")}</span><span className="mono">{pre.running ? `${pre.done}/${pre.total}` : `${counts.done}/${counts.total}`}</span></div>}
        </div>

        {!hq && (
          <>
            <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
              {tx("Mô hình chất lượng cao (ISNet) giữ trọn thân máy và chi tiết nhỏ như dây đeo, chữ trên ống kính. Tải một lần, sau đó dùng được cả khi không có mạng. Nên dùng Wi-Fi.")}</p>
            {busy ? (
              <div className="dl-progress" role="status">
                <div className="bar"><i style={{ width: `${dl.phase === 'downloading' ? Math.round((dl.loaded / dl.total) * 100) : 100}%` }} /></div>
                <span className="mono muted" style={{ fontSize: 12 }}>
                  {dl.phase === 'downloading' ? `${mb(dl.loaded)} / ${mb(dl.total)}` : tx("Đang lưu vào máy…")}</span>
                {dl.phase === 'downloading' && <button type="button" className="btn secondary" onClick={cancelDownload}>{tx("Huỷ tải")}</button>}
              </div>
            ) : (
              <button type="button" className="btn" onClick={start}>{tx("Tải mô hình chất lượng cao")}{size ? ` · ${mb(size)}` : ''}</button>
            )}
            {dl.phase === 'error' && <p className="down" style={{ fontSize: 13 }}>{tx("Tải không thành công ({0}). Kiểm tra mạng rồi thử lại.", dl.message)}</p>}
          </>
        )}

        {hq && (
          <>
            {hqFailed && <p className="warn" style={{ fontSize: 13, lineHeight: 1.5 }}>{tx("Máy này chưa chạy được mô hình chất lượng cao (có thể do thiếu bộ nhớ), app đang dùng tạm mô hình cơ bản.")}</p>}
            {pre.running
              ? <button type="button" className="btn secondary" onClick={stopPrecut}>{tx("Tạm dừng tách nền")}</button>
              : counts && counts.done < counts.total && <button type="button" className="btn" onClick={() => precutAll()}>{tx("Tách nền sẵn {0} ảnh còn lại", counts.total - counts.done)}</button>}
            <p className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
              {tx("App tự tách nền dần các ảnh bìa khi đang mở, mỗi ảnh một lần rồi lưu lại, nên lúc chia sẻ không phải chờ.")}</p>
            <button type="button" className="btn secondary" onClick={remove}>{tx("Xoá mô hình (giải phóng {0})", mb(hq.size))}</button>
          </>
        )}
      </section>
    </SubPage>
  );
}
