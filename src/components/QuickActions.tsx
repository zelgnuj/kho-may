import { useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { addPhotos, useCameras, type Camera } from '../db';
import { TYPE_LABEL, lensLabel } from '../lib/format';
import { compressImage } from '../lib/images';
import { holdPhotos } from '../lib/quickPhotos';
import { toast } from '../lib/toast';
import { LoadFilmSheet } from './Film';
import { LoanSheet } from './Loan';
import { IconCamera, IconFilm, IconHandshake, IconHeart, IconPlus, IconSearch } from './Icons';
import { CameraThumb, Sheet } from './ui';
import { tx } from '../lib/i18n';

type Step = null | 'menu' | 'photo-pick' | 'film-pick' | 'loan-pick';

/** Nút + giữa thanh dưới: các việc làm nhanh */
export function QuickActions() {
  const nav = useNavigate();
  const loc = useLocation();
  const [step, setStep] = useState<Step>(null);
  const [shots, setShots] = useState<Blob[]>([]);
  const [filmCam, setFilmCam] = useState<Camera | null>(null);
  const [loanCam, setLoanCam] = useState<Camera | null>(null);
  const camInput = useRef<HTMLInputElement>(null);
  const onWish = loc.pathname.startsWith('/wishlist');

  const close = () => setStep(null);
  const go = (to: string) => { close(); nav(to); };
  const takePhoto = () => camInput.current?.click(); // phải gọi ngay trong lúc bấm (iPhone)

  const onShots = async (files: FileList | null) => {
    if (!files?.length) return;
    const blobs = await Promise.all([...files].map((f) => compressImage(f)));
    setShots(blobs);
    setStep('photo-pick');
  };
  const attach = async (cam: Camera) => {
    await addPhotos(cam.id, shots);
    toast(tx("Đã thêm {0} vào {1} {2}", shots.length > 1 ? tx("{0} ảnh", shots.length) : tx("ảnh"), cam.brand, cam.model));
    setShots([]);
    go(`/may/${cam.id}`);
  };
  const newWithShots = () => { holdPhotos(shots); setShots([]); go('/them?anh=1'); };

  const wish = { key: 'wish', icon: <IconHeart size={22} />, label: tx("Thêm vào Wishlist"), sub: tx("Máy đang săn"), run: () => go('/wishlist/them') };
  const film = { key: 'film', icon: <IconFilm size={22} />, label: tx("Lắp film"), sub: tx("Chọn máy, chọn cuộn"), run: () => setStep('film-pick') };
  const add = { key: 'add', icon: <IconPlus size={22} />, label: tx("Thêm máy vào kho"), sub: tx("Máy mới về"), run: () => go('/them') };
  const loan = { key: 'loan', icon: <IconHandshake size={22} />, label: tx("Cho mượn"), sub: tx("Ghi ai mượn, hẹn trả"), run: () => setStep('loan-pick') };
  const others = onWish ? [wish, add, film, loan] : [wish, film, loan, add];

  return (
    <>
      <button type="button" className="nav-add" aria-label={tx("Làm nhanh")} aria-haspopup="dialog" onClick={() => setStep('menu')}><IconPlus size={26} /></button>
      <input ref={camInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { onShots(e.target.files); e.target.value = ''; }} />

      <Sheet open={step === 'menu'} onClose={close} title={tx("Làm nhanh")}>
        <button type="button" className="quick-hero" onClick={takePhoto}>
          <span className="quick-hero-icon"><IconCamera size={28} /></span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'left' }}>
            <b style={{ fontSize: 17 }}>{tx("Chụp ảnh máy")}</b>
            <span style={{ fontSize: 13, opacity: .75 }}>{tx("Chụp xong chọn máy để gắn ảnh")}</span>
          </span>
        </button>
        <div className="quick-grid">
          {others.map((a) => (
            <button key={a.key} type="button" className="quick-tile" onClick={a.run}>
              <span className="quick-tile-icon">{a.icon}</span>
              <b>{a.label}</b>
              <span className="muted">{a.sub}</span>
            </button>
          ))}
        </div>
      </Sheet>

      <CameraChooser open={step === 'photo-pick'} title={tx("Ảnh này của máy nào?{0}", shots.length > 1 ? tx(" ({0} ảnh)", shots.length) : '')}
        onClose={() => { setShots([]); close(); }} onPick={attach}
        extra={<button type="button" className="pick-free" onClick={newWithShots}>{tx("Máy mới, chưa có trong kho → thêm máy với ảnh này")}</button>} />

      <CameraChooser open={step === 'film-pick'} title={tx("Lắp film vào máy nào?")} filmOnly onClose={close}
        onPick={(c) => { setFilmCam(c); close(); }} />
      {filmCam && <LoadFilmSheet open onClose={() => setFilmCam(null)} cam={filmCam} />}

      <CameraChooser open={step === 'loan-pick'} title={tx("Cho mượn máy nào?")} onClose={close} showLoan
        onPick={(c) => { if (c.loan) go(`/may/${c.id}`); else { setLoanCam(c); close(); } }} />
      {loanCam && <LoanSheet open onClose={() => setLoanCam(null)} cam={loanCam} />}
    </>
  );
}

function CameraChooser({ open, title, onClose, onPick, extra, filmOnly, showLoan }: {
  open: boolean; title: string; onClose: () => void; onPick: (c: Camera) => void; extra?: React.ReactNode; filmOnly?: boolean; showLoan?: boolean;
}) {
  const cams = useCameras();
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    return (cams ?? [])
      .filter((c) => c.status === 'owned' && (!filmOnly || c.type !== 'DIG'))
      .filter((c) => !k || `${c.brand} ${c.model}`.toLowerCase().includes(k))
      .sort((a, b) => (b.lastViewedAt ?? 0) - (a.lastViewedAt ?? 0) || b.updatedAt - a.updatedAt);
  }, [cams, q, filmOnly]);
  return (
    <Sheet open={open} onClose={() => { setQ(''); onClose(); }} title={title} tall>
      <label className="search" style={{ flex: 'none' }}>
        <IconSearch size={18} />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tx("Tìm máy…")} aria-label={tx("Tìm máy trong kho")} />
      </label>
      {extra}
      <div className="rows pick-list" role="listbox" aria-label={tx("Chọn máy")}>
        {list.map((c) => (
          <button key={c.id} type="button" role="option" aria-selected={false} className="pick-row" onClick={() => { setQ(''); onPick(c); }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <span className="chooser-thumb"><CameraThumb camera={c} artWidth={40} strokeWidth={3} /></span>
              <span className="pick-name">
                <span>{c.brand} {c.model}</span>
                <span className="pick-meta">{[TYPE_LABEL[c.type], lensLabel(c.lens)].filter(Boolean).join(' · ')}</span>
              </span>
            </span>
            {showLoan && c.loan && <span className="pick-spec" style={{ borderColor: '#7FB8FF', color: '#7FB8FF' }}>{c.loan.to} {' '}{tx("mượn · nhận lại")}</span>}
            {filmOnly && c.film && <span className="pick-spec" style={{ maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.film.stock}</span>}
          </button>
        ))}
        {!list.length && <div className="muted" style={{ fontSize: 13 }}>{tx("Không có máy nào khớp.")}</div>}
      </div>
    </Sheet>
  );
}
