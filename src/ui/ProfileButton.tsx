import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSync } from '../sync/syncManager';
import { Icon } from './icons/Icon';

/** Round profile button at the top right of the main screens; shows the account's initial when signed in. */
export function ProfileButton() {
  const { t } = useTranslation();
  const email = useSync((s) => s.email);
  const status = useSync((s) => s.status);
  const initial = email?.trim()[0]?.toUpperCase();
  const label = email ? `${t('tabs.profile')}: ${email}` : t('tabs.profile');
  return (
    <Link to="/profile" className={`avatar-btn${initial ? ' signed-in' : ''}`} aria-label={label} title={label}>
      {initial ?? <Icon name="profile" />}
      {status === 'error' && <span className="avatar-dot" aria-hidden />}
    </Link>
  );
}
