import { useTranslation } from 'react-i18next';
import { PageHeader } from '../../ui/components';
import { SpeciesBrowser } from './SpeciesBrowser';

export default function DiscoverScreen() {
  const { t } = useTranslation();
  return (
    <div className="page">
      <PageHeader title={t('tabs.discover')} />
      <SpeciesBrowser stateKey="discover" linkTo={(s) => `/species/${s.id}`} />
    </div>
  );
}
