using System.Net;
using System.Text.Json;
using SchoolAdmission.Tests.Infrastructure;

namespace SchoolAdmission.Tests;

public sealed class EndpointMatrixTests : IDisposable
{
    private const string ClassId = "3f0d6c2e-1b7a-4c51-9a55-2d3f2b9b1e01";
    private const string HoldId = "8a4e1d0c-6b3f-4e2a-9c7d-1f2e3d4c5b6a";
    private const string StudentId = "20152691234567890";

    private readonly ApiFactory _factory = new();
    private readonly HttpClient _client;

    public EndpointMatrixTests() => _client = _factory.CreateClient();

    public void Dispose()
    {
        _client.Dispose();
        _factory.Dispose();
    }

    private sealed record Endpoint(
        string Method,
        string PublicPath,
        string? Body,
        bool NeedsStudent,
        HttpMethod InternalMethod,
        string InternalPath,
        HttpStatusCode InternalStatus,
        object InternalData,
        HttpStatusCode PublicStatus,
        bool IsArray,
        string[] Fields);

    private static readonly object Class = new
    {
        id = ClassId,
        name = "Class 6 - Morning Shift",
        totalSeats = 120,
        heldSeats = 15,
        confirmedSeats = 80,
        availableSeats = 25,
        createdAt = "2026-11-01T04:00:00.000Z",
    };

    private static object Hold(string status) => new
    {
        holdId = HoldId,
        classId = ClassId,
        studentId = StudentId,
        status,
        createdAt = "2026-11-01T04:00:00.000Z",
        expiresAt = "2026-11-01T04:10:00.000Z",
        confirmedAt = status == "CONFIRMED" ? "2026-11-01T04:05:00.000Z" : null,
    };

    private static readonly object StudentHolds = new[]
    {
        new
        {
            holdId = HoldId,
            classId = ClassId,
            className = "Class 6 - Morning Shift",
            studentId = StudentId,
            status = "HELD",
            createdAt = "2026-11-01T04:00:00.000Z",
            expiresAt = "2026-11-01T04:10:00.000Z",
            confirmedAt = (string?)null,
        },
    };

    private static readonly string[] ClassFields =
        ["id", "name", "totalSeats", "heldSeats", "confirmedSeats", "availableSeats"];

    private static readonly Dictionary<string, Endpoint> Endpoints = new()
    {
        ["CreateClass"] = new("POST", "/classes", """{"name":"Class 6 - Morning Shift","totalSeats":120}""", false,
            HttpMethod.Post, "/classes", HttpStatusCode.Created, Class, HttpStatusCode.Created, false,
            ["id", "name", "totalSeats"]),
        ["ListClasses"] = new("GET", "/classes", null, false,
            HttpMethod.Get, "/classes", HttpStatusCode.OK, new[] { Class }, HttpStatusCode.OK, true, ClassFields),
        ["GetClass"] = new("GET", $"/classes/{ClassId}", null, false,
            HttpMethod.Get, $"/classes/{ClassId}", HttpStatusCode.OK, Class, HttpStatusCode.OK, false, ClassFields),
        ["CreateHold"] = new("POST", $"/classes/{ClassId}/holds", null, true,
            HttpMethod.Post, "/holds", HttpStatusCode.Created, Hold("HELD"), HttpStatusCode.Created, false,
            ["holdId", "classId", "studentId", "status", "expiresAt"]),
        ["GetHold"] = new("GET", $"/holds/{HoldId}", null, false,
            HttpMethod.Get, $"/holds/{HoldId}", HttpStatusCode.OK, Hold("HELD"), HttpStatusCode.OK, false,
            ["holdId", "classId", "status", "expiresAt"]),
        ["ConfirmHold"] = new("POST", $"/holds/{HoldId}/confirm", null, true,
            HttpMethod.Post, $"/holds/{HoldId}/confirm", HttpStatusCode.OK, Hold("CONFIRMED"), HttpStatusCode.OK, false,
            ["holdId", "status"]),
        ["CancelHold"] = new("DELETE", $"/holds/{HoldId}", null, true,
            HttpMethod.Post, $"/holds/{HoldId}/cancel", HttpStatusCode.OK, Hold("CANCELLED"), HttpStatusCode.NoContent, false,
            []),
        ["MyHolds"] = new("GET", "/me/holds", null, true,
            HttpMethod.Get, $"/students/{StudentId}/holds", HttpStatusCode.OK, StudentHolds, HttpStatusCode.OK, true,
            ["holdId", "classId", "className", "status", "expiresAt"]),
    };

    public static TheoryData<string> AllEndpoints => ToTheoryData(Endpoints.Keys);

    public static TheoryData<string> StudentEndpoints =>
        ToTheoryData(Endpoints.Where(e => e.Value.NeedsStudent).Select(e => e.Key));

    private static TheoryData<string> ToTheoryData(IEnumerable<string> names)
    {
        var data = new TheoryData<string>();
        foreach (var name in names)
        {
            data.Add(name);
        }

        return data;
    }

    private Task<HttpResponseMessage> SendAsync(Endpoint endpoint, bool withStudent = true)
    {
        var request = new HttpRequestMessage(new HttpMethod(endpoint.Method), endpoint.PublicPath);
        if (endpoint.Body is not null)
        {
            request.Content = JsonAssert.JsonBody(endpoint.Body);
        }

        if (withStudent && endpoint.NeedsStudent)
        {
            request.Headers.Add("X-Student-Id", StudentId);
        }

        return _client.SendAsync(request);
    }

    [Fact]
    public void CoversAllEightPublicEndpoints()
    {
        Assert.Equal(8, Endpoints.Count);
        Assert.Equal(8, Endpoints.Values.Select(e => $"{e.Method} {e.PublicPath}").Distinct().Count());
    }

    [Theory]
    [MemberData(nameof(AllEndpoints))]
    public async Task Success_ReturnsDocumentedStatusAndExactJsonFieldNames(string name)
    {
        var endpoint = Endpoints[name];
        _factory.Database.OnData(endpoint.InternalMethod, endpoint.InternalPath, endpoint.InternalData, endpoint.InternalStatus);

        var response = await SendAsync(endpoint);

        Assert.Equal(endpoint.PublicStatus, response.StatusCode);
        if (endpoint.PublicStatus == HttpStatusCode.NoContent)
        {
            Assert.Empty(await response.Content.ReadAsByteArrayAsync());
            return;
        }

        var body = await JsonAssert.ReadJsonAsync(response);
        if (endpoint.IsArray)
        {
            Assert.Equal(JsonValueKind.Array, body.ValueKind);
            JsonAssert.HasExactProperties(Assert.Single(body.EnumerateArray()), endpoint.Fields);
        }
        else
        {
            JsonAssert.HasExactProperties(body, endpoint.Fields);
        }
    }

    [Theory]
    [MemberData(nameof(AllEndpoints))]
    public async Task Success_CallsTheInternalRouteOnceWithTheInternalApiKey(string name)
    {
        var endpoint = Endpoints[name];
        _factory.Database.OnData(endpoint.InternalMethod, endpoint.InternalPath, endpoint.InternalData, endpoint.InternalStatus);

        await SendAsync(endpoint);

        var forwarded = Assert.Single(_factory.Database.Requests);
        Assert.Equal(endpoint.InternalMethod.Method, forwarded.Method);
        Assert.Equal(endpoint.InternalPath, forwarded.Path);
        Assert.Equal(ApiFactory.InternalApiKey, forwarded.Headers["X-Internal-Api-Key"]);
        Assert.False(forwarded.Headers.ContainsKey("X-Student-Id"));
    }

    [Theory]
    [MemberData(nameof(StudentEndpoints))]
    public async Task StudentIdentity_IsForwardedToTheInternalService(string name)
    {
        var endpoint = Endpoints[name];
        _factory.Database.OnData(endpoint.InternalMethod, endpoint.InternalPath, endpoint.InternalData, endpoint.InternalStatus);

        await SendAsync(endpoint);

        var forwarded = Assert.Single(_factory.Database.Requests);
        if (forwarded.Method == "GET")
        {
            Assert.Equal($"/students/{StudentId}/holds", forwarded.Path);
            Assert.Null(forwarded.Body);
        }
        else
        {
            Assert.Equal(StudentId, forwarded.Json.GetProperty("studentId").GetString());
        }
    }

    [Theory]
    [InlineData("CreateClass")]
    [InlineData("ListClasses")]
    [InlineData("GetClass")]
    [InlineData("GetHold")]
    public async Task NonStudentEndpoints_DoNotSendAStudentId(string name)
    {
        var endpoint = Endpoints[name];
        _factory.Database.OnData(endpoint.InternalMethod, endpoint.InternalPath, endpoint.InternalData, endpoint.InternalStatus);

        await SendAsync(endpoint);

        var forwarded = Assert.Single(_factory.Database.Requests);
        Assert.DoesNotContain("studentId", forwarded.Body ?? string.Empty, StringComparison.Ordinal);
        Assert.DoesNotContain(StudentId, forwarded.Path, StringComparison.Ordinal);
    }

    [Theory]
    [MemberData(nameof(StudentEndpoints))]
    public async Task MissingStudentIdentity_Returns401WithoutCallingInternalService(string name)
    {
        var response = await SendAsync(Endpoints[name], withStudent: false);

        await JsonAssert.ReadProblemAsync(response, 401, "STUDENT_ID_REQUIRED");
        Assert.Empty(_factory.Database.Requests);
    }

    [Theory]
    [MemberData(nameof(AllEndpoints))]
    public async Task InternalValidationError_Returns400(string name)
    {
        var endpoint = Endpoints[name];
        _factory.Database.OnError(endpoint.InternalMethod, endpoint.InternalPath, HttpStatusCode.BadRequest, "VALIDATION_ERROR", "invalid");

        await JsonAssert.ReadProblemAsync(await SendAsync(endpoint), 400, "VALIDATION_ERROR");
    }

    [Theory]
    [MemberData(nameof(AllEndpoints))]
    public async Task InternalNotFound_Returns404(string name)
    {
        var endpoint = Endpoints[name];
        _factory.Database.OnError(endpoint.InternalMethod, endpoint.InternalPath, HttpStatusCode.NotFound, "NOT_FOUND", "missing");

        await JsonAssert.ReadProblemAsync(await SendAsync(endpoint), 404, "NOT_FOUND");
    }

    [Theory]
    [MemberData(nameof(AllEndpoints))]
    public async Task InternalBusy_Returns503WithRetryAfter(string name)
    {
        var endpoint = Endpoints[name];
        _factory.Database.OnError(endpoint.InternalMethod, endpoint.InternalPath, HttpStatusCode.ServiceUnavailable, "SERVICE_BUSY", "busy");

        var response = await SendAsync(endpoint);

        await JsonAssert.ReadProblemAsync(response, 503, "SERVICE_BUSY");
        Assert.Equal("1", response.Headers.RetryAfter?.ToString());
    }

    [Theory]
    [MemberData(nameof(AllEndpoints))]
    public async Task DatabaseUnavailable_Returns503(string name)
    {
        var endpoint = Endpoints[name];
        _factory.Database.OnError(endpoint.InternalMethod, endpoint.InternalPath, HttpStatusCode.ServiceUnavailable, "DATABASE_UNAVAILABLE", "db down");

        await JsonAssert.ReadProblemAsync(await SendAsync(endpoint), 503, "SERVICE_UNAVAILABLE");
    }

    [Theory]
    [MemberData(nameof(AllEndpoints))]
    public async Task InternalCrash_Returns502WithoutLeakingDetails(string name)
    {
        var endpoint = Endpoints[name];
        _factory.Database.OnError(endpoint.InternalMethod, endpoint.InternalPath, HttpStatusCode.InternalServerError, "INTERNAL_ERROR", "secret stack trace");

        var response = await SendAsync(endpoint);

        var problem = await JsonAssert.ReadProblemAsync(response, 502, "UPSTREAM_ERROR");
        Assert.DoesNotContain("secret", problem.ToString(), StringComparison.Ordinal);
    }

    [Theory]
    [MemberData(nameof(AllEndpoints))]
    public async Task InternalUnreachable_Returns503(string name)
    {
        var endpoint = Endpoints[name];
        _factory.Database.OnThrow(endpoint.InternalMethod, endpoint.InternalPath, new HttpRequestException("connection refused 10.0.0.5"));

        var response = await SendAsync(endpoint);

        var problem = await JsonAssert.ReadProblemAsync(response, 503, "SERVICE_UNAVAILABLE");
        Assert.DoesNotContain("10.0.0.5", problem.ToString(), StringComparison.Ordinal);
    }

    [Theory]
    [MemberData(nameof(AllEndpoints))]
    public async Task InternalTimeout_Returns504(string name)
    {
        var endpoint = Endpoints[name];
        _factory.Database.OnThrow(endpoint.InternalMethod, endpoint.InternalPath, new TaskCanceledException("timeout"));

        await JsonAssert.ReadProblemAsync(await SendAsync(endpoint), 504, "UPSTREAM_TIMEOUT");
    }

    [Theory]
    [MemberData(nameof(AllEndpoints))]
    public async Task InternalGarbage_Returns502(string name)
    {
        var endpoint = Endpoints[name];
        _factory.Database.OnRaw(endpoint.InternalMethod, endpoint.InternalPath, endpoint.InternalStatus, "<html>proxy</html>", "text/html");

        await JsonAssert.ReadProblemAsync(await SendAsync(endpoint), 502, "UPSTREAM_ERROR");
    }
}
