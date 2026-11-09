using System.Net;
using SchoolAdmission.Tests.Infrastructure;

namespace SchoolAdmission.Tests;

public sealed class HoldEndpointTests : IDisposable
{
    private const int ClassId = 42;
    private const string HoldId = "8a4e1d0c-6b3f-4e2a-9c7d-1f2e3d4c5b6a";
    private const string StudentId = "20152691234567890";
    private const string OtherStudentId = "20152691234567891";

    private readonly ApiFactory _factory = new();
    private readonly HttpClient _client;

    public HoldEndpointTests() => _client = _factory.CreateClient();

    public void Dispose()
    {
        _client.Dispose();
        _factory.Dispose();
    }

    private static object InternalHold(string status = "HELD", string? confirmedAt = null) => new
    {
        holdId = HoldId,
        classId = ClassId,
        studentId = StudentId,
        status,
        createdAt = "2026-11-01T04:00:00.000Z",
        expiresAt = "2026-11-01T04:10:00.000Z",
        confirmedAt,
    };

    private Task<HttpResponseMessage> SendAsync(HttpMethod method, string path, string? studentId = StudentId)
    {
        var request = new HttpRequestMessage(method, path);
        if (studentId is not null)
        {
            request.Headers.Add("X-Student-Id", studentId);
        }

        return _client.SendAsync(request);
    }

    [Fact]
    public async Task CreateHold_Returns201WithExactContract()
    {
        _factory.Database.OnData(HttpMethod.Post, "/holds", InternalHold(), HttpStatusCode.Created);

        var response = await SendAsync(HttpMethod.Post, $"/classes/{ClassId}/holds");

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal($"/holds/{HoldId}", response.Headers.Location?.AbsolutePath);
        var body = await JsonAssert.ReadJsonAsync(response);
        JsonAssert.HasExactProperties(body, "holdId", "classId", "studentId", "status", "expiresAt");
        Assert.Equal(HoldId, body.GetProperty("holdId").GetString());
        Assert.Equal(ClassId, body.GetProperty("classId").GetInt32());
        Assert.Equal(StudentId, body.GetProperty("studentId").GetString());
        Assert.Equal("HELD", body.GetProperty("status").GetString());
        Assert.Equal("2026-11-01T04:10:00Z", body.GetProperty("expiresAt").GetString());

        var forwarded = Assert.Single(_factory.Database.Requests);
        Assert.Equal(ClassId, forwarded.Json.GetProperty("classId").GetInt32());
        Assert.Equal(StudentId, forwarded.Json.GetProperty("studentId").GetString());
    }

    [Fact]
    public async Task CreateHold_MissingStudentHeader_Returns401()
    {
        var response = await SendAsync(HttpMethod.Post, $"/classes/{ClassId}/holds", studentId: null);

        await JsonAssert.ReadProblemAsync(response, 401, "STUDENT_ID_REQUIRED");
        Assert.Empty(_factory.Database.Requests);
    }

    [Theory]
    [InlineData("2015269123456789")]
    [InlineData("201526912345678901")]
    [InlineData("2015269123456789a")]
    [InlineData(" 2015269123456789")]
    [InlineData("２０１５２６９１２３４５６７８９０")]
    public async Task CreateHold_InvalidStudentHeader_Returns400(string studentId)
    {
        var response = await SendAsync(HttpMethod.Post, $"/classes/{ClassId}/holds", studentId);

        var problem = await JsonAssert.ReadProblemAsync(response, 400, "VALIDATION_ERROR");
        Assert.True(problem.GetProperty("errors").TryGetProperty("X-Student-Id", out _));
        Assert.Empty(_factory.Database.Requests);
    }

    [Fact]
    public async Task CreateHold_RepeatedStudentHeader_Returns400()
    {
        var request = new HttpRequestMessage(HttpMethod.Post, $"/classes/{ClassId}/holds");
        request.Headers.Add("X-Student-Id", new[] { StudentId, OtherStudentId });

        var response = await _client.SendAsync(request);

        await JsonAssert.ReadProblemAsync(response, 400, "VALIDATION_ERROR");
        Assert.Empty(_factory.Database.Requests);
    }

    [Fact]
    public async Task CreateHold_MalformedClassId_Returns400()
    {
        var response = await SendAsync(HttpMethod.Post, "/classes/c_123/holds");

        await JsonAssert.ReadProblemAsync(response, 400, "VALIDATION_ERROR");
    }

    [Theory]
    [InlineData(HttpStatusCode.Conflict, "SEATS_FULL", 409)]
    [InlineData(HttpStatusCode.Conflict, "DUPLICATE_APPLICATION", 409)]
    [InlineData(HttpStatusCode.Conflict, "ALREADY_ADMITTED", 409)]
    [InlineData(HttpStatusCode.NotFound, "NOT_FOUND", 404)]
    public async Task CreateHold_TranslatesDomainErrors(HttpStatusCode internalStatus, string code, int publicStatus)
    {
        _factory.Database.OnError(HttpMethod.Post, "/holds", internalStatus, code, "domain message");

        var response = await SendAsync(HttpMethod.Post, $"/classes/{ClassId}/holds");

        var problem = await JsonAssert.ReadProblemAsync(response, publicStatus, code);
        Assert.Equal("domain message", problem.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task CreateHold_Busy_Returns503WithRetryAfter()
    {
        _factory.Database.OnError(HttpMethod.Post, "/holds", HttpStatusCode.ServiceUnavailable, "SERVICE_BUSY", "The class is busy, please retry");

        var response = await SendAsync(HttpMethod.Post, $"/classes/{ClassId}/holds");

        await JsonAssert.ReadProblemAsync(response, 503, "SERVICE_BUSY");
        Assert.Equal("1", response.Headers.RetryAfter?.ToString());
    }

    [Fact]
    public async Task GetHold_ReturnsExactContractWithoutStudentId()
    {
        _factory.Database.OnData(HttpMethod.Get, $"/holds/{HoldId}", InternalHold());

        var response = await SendAsync(HttpMethod.Get, $"/holds/{HoldId}", studentId: null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await JsonAssert.ReadJsonAsync(response);
        JsonAssert.HasExactProperties(body, "holdId", "classId", "status", "expiresAt");
        Assert.Equal("2026-11-01T04:10:00Z", body.GetProperty("expiresAt").GetString());
    }

    [Fact]
    public async Task GetHold_NotFound_Returns404()
    {
        _factory.Database.OnError(HttpMethod.Get, $"/holds/{HoldId}", HttpStatusCode.NotFound, "NOT_FOUND", "Hold not found");

        var response = await SendAsync(HttpMethod.Get, $"/holds/{HoldId}", studentId: null);

        await JsonAssert.ReadProblemAsync(response, 404, "NOT_FOUND");
    }

    [Fact]
    public async Task ConfirmHold_Returns200WithExactContractAndForwardsStudent()
    {
        _factory.Database.OnData(HttpMethod.Post, $"/holds/{HoldId}/confirm", InternalHold("CONFIRMED", "2026-11-01T04:05:00.000Z"));

        var response = await SendAsync(HttpMethod.Post, $"/holds/{HoldId}/confirm");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await JsonAssert.ReadJsonAsync(response);
        JsonAssert.HasExactProperties(body, "holdId", "status");
        Assert.Equal("CONFIRMED", body.GetProperty("status").GetString());
        Assert.Equal(StudentId, Assert.Single(_factory.Database.Requests).Json.GetProperty("studentId").GetString());
    }

    [Fact]
    public async Task ConfirmHold_RequiresStudentHeader()
    {
        var response = await SendAsync(HttpMethod.Post, $"/holds/{HoldId}/confirm", studentId: null);

        await JsonAssert.ReadProblemAsync(response, 401, "STUDENT_ID_REQUIRED");
    }

    [Theory]
    [InlineData(HttpStatusCode.Forbidden, "HOLD_NOT_OWNED", 403)]
    [InlineData(HttpStatusCode.Conflict, "HOLD_EXPIRED", 409)]
    [InlineData(HttpStatusCode.Conflict, "ALREADY_ADMITTED", 409)]
    [InlineData(HttpStatusCode.Conflict, "HOLD_NOT_ACTIVE", 409)]
    [InlineData(HttpStatusCode.NotFound, "NOT_FOUND", 404)]
    public async Task ConfirmHold_TranslatesDomainErrors(HttpStatusCode internalStatus, string code, int publicStatus)
    {
        _factory.Database.OnError(HttpMethod.Post, $"/holds/{HoldId}/confirm", internalStatus, code, "domain message");

        var response = await SendAsync(HttpMethod.Post, $"/holds/{HoldId}/confirm", OtherStudentId);

        await JsonAssert.ReadProblemAsync(response, publicStatus, code);
    }

    [Fact]
    public async Task DeleteHold_Returns204WithEmptyBodyAndCancelsInternally()
    {
        _factory.Database.OnData(HttpMethod.Post, $"/holds/{HoldId}/cancel", InternalHold("CANCELLED"));

        var response = await SendAsync(HttpMethod.Delete, $"/holds/{HoldId}");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Empty(await response.Content.ReadAsByteArrayAsync());
        var forwarded = Assert.Single(_factory.Database.Requests);
        Assert.Equal("POST", forwarded.Method);
        Assert.Equal(StudentId, forwarded.Json.GetProperty("studentId").GetString());
    }

    [Fact]
    public async Task DeleteHold_RequiresStudentHeader()
    {
        var response = await SendAsync(HttpMethod.Delete, $"/holds/{HoldId}", studentId: null);

        await JsonAssert.ReadProblemAsync(response, 401, "STUDENT_ID_REQUIRED");
    }

    [Theory]
    [InlineData(HttpStatusCode.Forbidden, "HOLD_NOT_OWNED", 403)]
    [InlineData(HttpStatusCode.Conflict, "HOLD_ALREADY_CONFIRMED", 409)]
    [InlineData(HttpStatusCode.Conflict, "HOLD_EXPIRED", 409)]
    public async Task DeleteHold_TranslatesDomainErrors(HttpStatusCode internalStatus, string code, int publicStatus)
    {
        _factory.Database.OnError(HttpMethod.Post, $"/holds/{HoldId}/cancel", internalStatus, code, "domain message");

        var response = await SendAsync(HttpMethod.Delete, $"/holds/{HoldId}");

        await JsonAssert.ReadProblemAsync(response, publicStatus, code);
    }

    [Fact]
    public async Task MyHolds_ReturnsBareArrayWithExactContract()
    {
        _factory.Database.OnData(HttpMethod.Get, $"/students/{StudentId}/holds", new[]
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
        });

        var response = await SendAsync(HttpMethod.Get, "/me/holds");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await JsonAssert.ReadJsonAsync(response);
        var item = Assert.Single(body.EnumerateArray());
        JsonAssert.HasExactProperties(item, "holdId", "classId", "className", "status", "expiresAt");
        Assert.Equal("Class 6 - Morning Shift", item.GetProperty("className").GetString());
    }

    [Fact]
    public async Task MyHolds_RequiresStudentHeader()
    {
        var response = await SendAsync(HttpMethod.Get, "/me/holds", studentId: null);

        await JsonAssert.ReadProblemAsync(response, 401, "STUDENT_ID_REQUIRED");
    }
}
