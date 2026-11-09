using Microsoft.Extensions.Options;
using SchoolAdmission.Api.Clients;
using SchoolAdmission.Api.Configuration;
using SchoolAdmission.Api.HealthChecks;
using SchoolAdmission.Api.Services;

namespace SchoolAdmission.Api.Extensions;

public static class ServiceCollectionExtensions
{
    public const string ReadyTag = "ready";

    public static IServiceCollection AddDatabaseServiceClient(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services
            .AddOptions<DatabaseServiceOptions>()
            .Bind(configuration.GetSection(DatabaseServiceOptions.SectionName))
            .Configure(options =>
            {
                var baseUrl = configuration[DatabaseServiceOptions.BaseUrlEnvironmentKey];
                if (!string.IsNullOrWhiteSpace(baseUrl))
                {
                    options.BaseUrl = baseUrl;
                }

                var apiKey = configuration[DatabaseServiceOptions.ApiKeyEnvironmentKey];
                if (!string.IsNullOrWhiteSpace(apiKey))
                {
                    options.ApiKey = apiKey;
                }
            })
            .ValidateDataAnnotations()
            .ValidateOnStart();

        services.AddTransient<RequestIdPropagationHandler>();

        services
            .AddHttpClient<IDatabaseServiceClient, DatabaseServiceClient>((sp, client) =>
            {
                var options = sp.GetRequiredService<IOptions<DatabaseServiceOptions>>().Value;
                client.BaseAddress = new Uri(options.BaseUrl.TrimEnd('/') + "/");
                client.Timeout = TimeSpan.FromSeconds(options.TimeoutSeconds);
                client.DefaultRequestHeaders.Add(DatabaseServiceClient.InternalApiKeyHeader, options.ApiKey);
            })
            .AddHttpMessageHandler<RequestIdPropagationHandler>();

        return services;
    }

    public static IServiceCollection AddAdmissionServices(this IServiceCollection services)
    {
        services.AddScoped<IClassService, ClassService>();
        services.AddScoped<IHoldService, HoldService>();
        return services;
    }

    public static IServiceCollection AddAppHealthChecks(this IServiceCollection services)
    {
        services
            .AddHealthChecks()
            .AddCheck<DatabaseServiceHealthCheck>("databaseService", tags: [ReadyTag]);

        return services;
    }

    public static IServiceCollection AddFrontendCors(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var origins = CorsSettings.ParseOrigins(configuration[CorsSettings.ConfigKey]);

        services.AddCors(options => options.AddPolicy(CorsSettings.PolicyName, policy =>
        {
            if (origins.Length > 0)
            {
                policy
                    .WithOrigins(origins)
                    .WithMethods("GET", "POST", "DELETE")
                    .WithHeaders("Content-Type", "Accept", "X-Student-Id")
                    .WithExposedHeaders("Location", "Retry-After");
            }
        }));

        return services;
    }
}
