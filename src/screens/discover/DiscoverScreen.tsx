import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../../ui/components';
import { Icon } from '../../ui/icons/Icon';
import { DeviceNotice } from '../../ui/DeviceNotice';
import { SpeciesBrowser } from './SpeciesBrowser';

export default function DiscoverScreen() {
  const { t } = useTranslation();
  return (
    <div className="page">
      <PageHeader
        title={t('tabs.discover')}
        actions={
          // Not knowing the name is the other way into the catalog: identify by photo or traits.
          <Link className="btn small header-pill" to="/identify" data-haptic>
            <Icon name="identify" />
            {t('discover.identify')}
          </Link>
        }
      />
      <DeviceNotice />
      <SpeciesBrowser
        stateKey="discover"
        linkTo={(s) => `/species/${s.id}`}
        emptyHint={
          <Link className="btn small outline" to="/identify" style={{ marginTop: 12 }}>
            <Icon name="identify" />
            {t('discover.notFoundIdentify')}
          </Link>
        }
      />
    </div>
  );
}
