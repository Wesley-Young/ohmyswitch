import { Link } from 'react-router';

import { PageContent, PageHeader } from '@/components/page';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <>
      <PageHeader title="页面不存在" />
      <PageContent>
        <Button variant="outline" nativeButton={false} render={<Link to="/providers" />}>
          返回供应商
        </Button>
      </PageContent>
    </>
  );
}
