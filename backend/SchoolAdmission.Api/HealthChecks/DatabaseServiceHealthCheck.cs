using Microsoft.Extensions.Diagnostics.HealthChecks;
using SchoolAdmission.Api.Clients;

namespace SchoolAdmission.Api.HealthChecks;

public sealed class DatabaseServiceHealthCheck(IDatabaseServiceClient client) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        var health = await client.GetHealthAsync(cancellationToken);
        return health.IsHealthy
            ? HealthCheckResult.Healthy("Database service is ready")
            : HealthCheckResult.Unhealthy(health.Error ?? "Database service is not ready");
    }
}
