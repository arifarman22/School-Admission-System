import { ButtonLink } from '../components/common/Button';
import { Card } from '../components/common/Card';
import { EmptyState } from '../components/common/States';
import { routes } from '../utils/routes';

export function NotFoundPage() {
  return (
    <Card>
      <EmptyState
        title="Page not found"
        description="The page you are looking for does not exist."
        action={
          <ButtonLink to={routes.classes} variant="secondary" size="sm">
            Back to classes
          </ButtonLink>
        }
      />
    </Card>
  );
}
