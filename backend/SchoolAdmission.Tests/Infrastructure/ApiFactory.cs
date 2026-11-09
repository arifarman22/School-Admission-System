using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using SchoolAdmission.Api.Clients;

namespace SchoolAdmission.Tests.Infrastructure;

public sealed class ApiFactory : WebApplicationFactory<Program>
{
    public const string InternalApiKey = "test-internal-key-1234567890";
    public const string AllowedOrigin = "http://localhost:5173";

    public FakeDatabaseService Database { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("PRISMA_SERVICE_URL", "http://database-service.test:4000");
        builder.UseSetting("INTERNAL_API_KEY", InternalApiKey);
        builder.UseSetting("Cors:AllowedOrigins", AllowedOrigin);
        builder.ConfigureTestServices(services =>
            services
                .AddHttpClient<IDatabaseServiceClient, DatabaseServiceClient>()
                .ConfigurePrimaryHttpMessageHandler(() => Database));
    }
}
