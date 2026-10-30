import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useCatalog, speciesName, useLang } from '../catalog/useCatalog';
import { SpeciesThumb } from './components';

interface Feedback {
  toast: (message: string) => void;
  /** Shows the "new species!" animation for a first sighting. */
  celebrate: (speciesId: string) => void;
}

const FeedbackContext = createContext<Feedback>({ toast: () => undefined, celebrate: () => undefined });

export const useFeedback = () => useContext(FeedbackContext);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [celebrated, setCelebrated] = useState<string | null>(null);

  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 2800);
    return () => clearTimeout(t);
  }, [toastMsg]);

  const toast = useCallback((m: string) => setToastMsg(m), []);
  const celebrate = useCallback((id: string) => setCelebrated(id), []);
  const value = useMemo(() => ({ toast, celebrate }), [toast, celebrate]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      {toastMsg && (
        <div className="toast" role="status" aria-live="polite">
          {toastMsg}
        </div>
      )}
      {celebrated && <Celebration speciesId={celebrated} onDone={() => setCelebrated(null)} />}
    </FeedbackContext.Provider>
  );
}

const BUBBLES = Array.from({ length: 22 }, (_, i) => ({
  left: (i * 37) % 100,
  size: 8 + ((i * 13) % 26),
  delay: (i % 7) * 0.18,
  duration: 2.2 + ((i * 7) % 10) / 6,
}));

function Celebration({ speciesId, onDone }: { speciesId: string; onDone: () => void }) {
  const catalog = useCatalog();
  const lang = useLang();
  const { t } = useTranslation();
  const species = catalog.byId.get(speciesId);

  useEffect(() => {
    const timer = setTimeout(onDone, 3200);
    navigator.vibrate?.(60);
    return () => clearTimeout(timer);
  }, [onDone]);

  if (!species) return null;
  return (
    <div className="celebrate" onClick={onDone} role="alertdialog" aria-live="assertive" aria-label={t('celebrate.title')}>
      {BUBBLES.map((b, i) => (
        <span
          key={i}
          className="bubble"
          style={{
            left: `${b.left}%`,
            width: b.size,
            height: b.size,
            animationDelay: `${b.delay}s`,
            animationDuration: `${b.duration}s`,
          }}
        />
      ))}
      <div className="celebrate-card">
        <div className="thumb">
          <SpeciesThumb species={species} />
        </div>
        <div className="kicker">{t('celebrate.title')}</div>
        <div style={{ fontWeight: 750, fontSize: '1.15rem', marginTop: 4 }}>{speciesName(species, lang)}</div>
        <div className="muted small" style={{ fontStyle: 'italic' }}>
          {species.scientificName}
        </div>
        <div className="small" style={{ marginTop: 10 }}>
          {t('celebrate.subtitle')}
        </div>
      </div>
    </div>
  );
}
