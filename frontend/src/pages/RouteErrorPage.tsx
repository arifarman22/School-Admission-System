import { isRouteErrorResponse, useRouteError } from 'react-router';
import { AppLayout } from '../components/layout/AppLayout';
import { ButtonLink } from '../components/common/Button';
import { Card } from '../components/common/Card';
import { ErrorState } from '../components/common/States';
import { routes } from '../utils/routes';

export function RouteErrorPage() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? new Error(`${error.status} ${error.statusText}`)
    : error;

  return (
    <AppLayout>
      <Card>
        <ErrorState error={message} title="This page failed to load" />
        <div className="flex justify-center pb-10">
          <ButtonLink to={routes.classes} variant="secondary" size="sm">
            Back to classes
          </ButtonLink>
        </div>
      </Card>
    </AppLayout>
  );
}
