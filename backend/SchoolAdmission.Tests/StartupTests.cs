using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace SchoolAdmission.Tests;

[CollectionDefinition(nameof(StartupIsolation), DisableParallelization = true)]
public sealed class StartupIsolation
{
}

[Collection(nameof(StartupIsolation))]
public sealed class StartupTests
{
    [Fact]
    public void Startup_FailsWithoutInternalApiKey()
    {
        using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Testing");
            builder.UseSetting("PRISMA_SERVICE_URL", "http://database-service.test:4000");
            builder.UseSetting("INTERNAL_API_KEY", "short");
        });

        var ex = Assert.ThrowsAny<Exception>(() => factory.CreateClient());
        Assert.Contains("INTERNAL_API_KEY", ex.ToString(), StringComparison.Ordinal);
    }
}
