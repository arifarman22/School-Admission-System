using System.Text.Json;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace SchoolAdmission.Api.HealthChecks;

public static class HealthResponseWriter
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public static Task WriteAsync(HttpContext context, HealthReport report)
    {
        context.Response.ContentType = "application/json";

        var payload = new
        {
            status = report.Status == HealthStatus.Healthy ? "ok" : "error",
            service = "api",
            timestamp = DateTimeOffset.UtcNow,
            durationMs = Math.Round(report.TotalDuration.TotalMilliseconds),
            checks = report.Entries.ToDictionary(
                entry => entry.Key,
                entry => new
                {
                    status = entry.Value.Status == HealthStatus.Healthy ? "ok" : "error",
                    description = entry.Value.Description,
                    durationMs = Math.Round(entry.Value.Duration.TotalMilliseconds),
                }),
        };

        return context.Response.WriteAsync(JsonSerializer.Serialize(payload, JsonOptions));
    }
}
