using System.Net;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using SchoolAdmission.Tests.Infrastructure;

namespace SchoolAdmission.Tests;

public sealed class PlatformTests : IDisposable
{
    private readonly ApiFactory _factory = new();
    private readonly HttpClient _client;

    public PlatformTests() => _client = _factory.CreateClient();

    public void Dispose()
    {
        _client.Dispose();
        _factory.Dispose();
    }

    [Fact]
    public async Task InternalServiceUnreachable_Returns503Problem()
    {
        _factory.Database.OnThrow(HttpMethod.Get, "/classes", new HttpRequestException("connection refused"));

        var response = await _client.GetAsync("/classes");

        var problem = await JsonAssert.ReadProblemAsync(response, 503, "SERVICE_UNAVAILABLE");
        Assert.DoesNotContain("connection refused", problem.ToString(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task InternalServiceTimeout_Returns504Problem()
    {
        _factory.Database.OnThrow(HttpMethod.Get, "/classes", new TaskCanceledException("timeout"));

        var response = await _client.GetAsync("/classes");

        await JsonAssert.ReadProblemAsync(response, 504, "UPSTREAM_TIMEOUT");
    }

    [Theory]
    [InlineData(HttpStatusCode.InternalServerError, "INTERNAL_ERROR")]
    [InlineData(HttpStatusCode.Unauthorized, "UNAUTHORIZED")]
    [InlineData(HttpStatusCode.NotImplemented, "NOT_IMPLEMENTED")]
    public async Task UnexpectedInternalErrors_Return502WithoutLeakingDetails(HttpStatusCode status, string code)
    {
        _factory.Database.OnError(HttpMethod.Get, "/classes", status, code, "secret internal detail");

        var response = await _client.GetAsync("/classes");

        var problem = await JsonAssert.ReadProblemAsync(response, 502, "UPSTREAM_ERROR");
        Assert.DoesNotContain("secret", problem.ToString(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task UnreadableInternalResponse_Returns502()
    {
        _factory.Database.OnRaw(HttpMethod.Get, "/classes", HttpStatusCode.OK, "<html>proxy error</html>", "text/html");

        var response = await _client.GetAsync("/classes");

        await JsonAssert.ReadProblemAsync(response, 502, "UPSTREAM_ERROR");
    }

    [Fact]
    public async Task DatabaseUnavailable_Returns503()
    {
        _factory.Database.OnError(HttpMethod.Get, "/classes", HttpStatusCode.ServiceUnavailable, "DATABASE_UNAVAILABLE", "db down");

        var response = await _client.GetAsync("/classes");

        await JsonAssert.ReadProblemAsync(response, 503, "SERVICE_UNAVAILABLE");
    }

    [Fact]
    public async Task ForwardsTraceIdAsRequestIdToInternalService()
    {
        _factory.Database.OnData(HttpMethod.Get, "/classes", Array.Empty<object>());

        await _client.GetAsync("/classes");

        var forwarded = Assert.Single(_factory.Database.Requests);
        Assert.Matches("^[0-9a-f]{32}$", forwarded.Headers["X-Request-Id"]);
    }

    [Theory]
    [InlineData("GET", "/students/20152691234567890/holds")]
    [InlineData("POST", "/holds")]
    [InlineData("POST", "/holds/8a4e1d0c-6b3f-4e2a-9c7d-1f2e3d4c5b6a/cancel")]
    [InlineData("GET", "/does-not-exist")]
    public async Task InternalAndUnknownRoutesAreNotExposed(string method, string path)
    {
        var response = await _client.SendAsync(new HttpRequestMessage(new HttpMethod(method), path));

        Assert.True(
            response.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.MethodNotAllowed,
            $"Expected 404/405 but got {(int)response.StatusCode}");
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.Empty(_factory.Database.Requests);
    }

    [Fact]
    public async Task Cors_AllowsFrontendOriginWithStudentHeader()
    {
        var request = new HttpRequestMessage(HttpMethod.Options, "/classes/3f0d6c2e-1b7a-4c51-9a55-2d3f2b9b1e01/holds");
        request.Headers.Add("Origin", ApiFactory.AllowedOrigin);
        request.Headers.Add("Access-Control-Request-Method", "POST");
        request.Headers.Add("Access-Control-Request-Headers", "x-student-id");

        var response = await _client.SendAsync(request);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(ApiFactory.AllowedOrigin, response.Headers.GetValues("Access-Control-Allow-Origin").Single());
        Assert.Contains("x-student-id", response.Headers.GetValues("Access-Control-Allow-Headers").Single(), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Cors_RejectsUnknownOrigin()
    {
        _factory.Database.OnData(HttpMethod.Get, "/classes", Array.Empty<object>());
        var request = new HttpRequestMessage(HttpMethod.Get, "/classes");
        request.Headers.Add("Origin", "https://evil.example");

        var response = await _client.SendAsync(request);

        Assert.False(response.Headers.Contains("Access-Control-Allow-Origin"));
    }

    [Fact]
    public async Task Liveness_DoesNotCallInternalService()
    {
        var response = await _client.GetAsync("/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Empty(_factory.Database.Requests);
    }

    [Fact]
    public async Task Readiness_ReflectsInternalService()
    {
        _factory.Database.OnRaw(HttpMethod.Get, "/health/ready", HttpStatusCode.ServiceUnavailable, "{}", "application/json");

        var response = await _client.GetAsync("/health/ready");

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
    }

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
