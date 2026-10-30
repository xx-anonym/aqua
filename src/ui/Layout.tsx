import { useState } from 'react';
import { NavLink, Outlet, ScrollRestoration, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sheet } from './components';
import { Icon } from './icons/Icon';

const TABS = [
  { to: '/discover', icon: 'discover', key: 'discover' },
  { to: '/identify', icon: 'identify', key: 'identify' },
  null,
  { to: '/logbook', icon: 'logbook', key: 'logbook' },
  { to: '/collection', icon: 'collection', key: 'collection' },
] as const;

export function Layout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [plusOpen, setPlusOpen] = useState(false);

  const go = (to: string) => {
    setPlusOpen(false);
    navigate(to);
  };

  return (
    <div className="app">
      <main>
        <Outlet />
      </main>
      <ScrollRestoration />
      <nav className="tabbar" aria-label={t('tabs.label')}>
        <div className="tabbar-inner">
          {TABS.map((tab) =>
            tab ? (
              <NavLink key={tab.key} to={tab.to} className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
                <Icon name={tab.icon} />
                <span>{t(`tabs.${tab.key}`)}</span>
              </NavLink>
            ) : (
              <div key="plus" className="tab-plus">
                <button onClick={() => setPlusOpen(true)} aria-label={t('plus.label')} aria-haspopup="dialog">
                  <Icon name="plus" />
                </button>
              </div>
            ),
          )}
        </div>
      </nav>
      {plusOpen && (
        <Sheet title={t('plus.label')} onClose={() => setPlusOpen(false)}>
          <div className="list">
            <button className="list-item" onClick={() => go('/logbook/new')}>
              <Icon name="logbook" />
              <div className="grow">
                <div className="title">{t('plus.newDive')}</div>
                <div className="sub">{t('plus.newDiveHint')}</div>
              </div>
              <Icon name="chevron" />
            </button>
            <button className="list-item" onClick={() => go('/sighting/new')}>
              <Icon name="eye" />
              <div className="grow">
                <div className="title">{t('plus.quickSighting')}</div>
                <div className="sub">{t('plus.quickSightingHint')}</div>
              </div>
              <Icon name="chevron" />
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
