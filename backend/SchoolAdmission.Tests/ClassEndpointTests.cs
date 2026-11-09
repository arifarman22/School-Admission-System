using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using SchoolAdmission.Tests.Infrastructure;

namespace SchoolAdmission.Tests;

public sealed class ClassEndpointTests : IDisposable
{
    private const string ClassId = "3f0d6c2e-1b7a-4c51-9a55-2d3f2b9b1e01";

    private readonly ApiFactory _factory = new();
    private readonly HttpClient _client;

    public ClassEndpointTests() => _client = _factory.CreateClient();

    public void Dispose()
    {
        _client.Dispose();
        _factory.Dispose();
    }

    private static object InternalClass(string id = ClassId, string name = "Class 6 - Morning Shift") => new
    {
        id,
        name,
        totalSeats = 120,
        heldSeats = 15,
        confirmedSeats = 80,
        availableSeats = 25,
        createdAt = "2026-11-01T04:00:00.000Z",
    };

    [Fact]
    public async Task CreateClass_Returns201WithExactContract()
    {
        _factory.Database.OnData(HttpMethod.Post, "/classes", InternalClass(), HttpStatusCode.Created);

        var response = await _client.PostAsJsonAsync("/classes", new { name = "Class 6 - Morning Shift", totalSeats = 120 });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal($"/classes/{ClassId}", response.Headers.Location?.AbsolutePath);
        var body = await JsonAssert.ReadJsonAsync(response);
        JsonAssert.HasExactProperties(body, "id", "name", "totalSeats");
        Assert.Equal(ClassId, body.GetProperty("id").GetString());
        Assert.Equal("Class 6 - Morning Shift", body.GetProperty("name").GetString());
        Assert.Equal(120, body.GetProperty("totalSeats").GetInt32());

        var forwarded = Assert.Single(_factory.Database.Requests);
        Assert.Equal(ApiFactory.InternalApiKey, forwarded.Headers["X-Internal-Api-Key"]);
        Assert.Equal("Class 6 - Morning Shift", forwarded.Json.GetProperty("name").GetString());
        Assert.Equal(120, forwarded.Json.GetProperty("totalSeats").GetInt32());
    }

    [Theory]
    [InlineData("""{"totalSeats": 10}""", "Name")]
    [InlineData("""{"name": "", "totalSeats": 10}""", "Name")]
    [InlineData("""{"name": "   ", "totalSeats": 10}""", "Name")]
    [InlineData("""{"name": "A"}""", "TotalSeats")]
    [InlineData("""{"name": "A", "totalSeats": 0}""", "TotalSeats")]
    [InlineData("""{"name": "A", "totalSeats": -3}""", "TotalSeats")]
    [InlineData("""{"name": "A", "totalSeats": 10001}""", "TotalSeats")]
    [InlineData("""{"name": "A", "totalSeats": "30"}""", "$.totalSeats")]
    [InlineData("""{"name": "A", "totalSeats": 1.5}""", "$.totalSeats")]
    [InlineData("""{"name": "A", "totalSeats": 10, "id": "c_1"}""", "$")]
    [InlineData("""{"name": "A", "totalSeats": """, "$")]
    public async Task CreateClass_RejectsInvalidInputWith400WithoutCallingInternalService(string json, string errorKey)
    {
        var response = await _client.PostAsync("/classes", JsonAssert.JsonBody(json));

        var problem = await JsonAssert.ReadProblemAsync(response, 400, "VALIDATION_ERROR");
        var errors = problem.GetProperty("errors");
        Assert.Contains(
            errors.EnumerateObject(),
            e => e.Name.Equals(errorKey, StringComparison.OrdinalIgnoreCase) || e.Name.StartsWith(errorKey, StringComparison.Ordinal));
        Assert.Empty(_factory.Database.Requests);
    }

    [Fact]
    public async Task CreateClass_RejectsNonJsonContentType()
    {
        var response = await _client.PostAsync("/classes", new StringContent("name=A&totalSeats=1"));
        await JsonAssert.ReadProblemAsync(response, 415, "UNSUPPORTED_MEDIA_TYPE");
    }

    [Fact]
    public async Task CreateClass_TranslatesInternalValidationDetails()
    {
        _factory.Database.OnError(
            HttpMethod.Post,
            "/classes",
            HttpStatusCode.BadRequest,
            "VALIDATION_ERROR",
            "Request validation failed",
            [new { path = "name", message = "name must not contain control or invisible formatting characters" }]);

        var response = await _client.PostAsJsonAsync("/classes", new { name = "Bad​name", totalSeats = 5 });

        var problem = await JsonAssert.ReadProblemAsync(response, 400, "VALIDATION_ERROR");
        Assert.Equal(
            "name must not contain control or invisible formatting characters",
            problem.GetProperty("errors").GetProperty("name")[0].GetString());
    }

    [Fact]
    public async Task CreateClass_DuplicateName_Returns409()
    {
        _factory.Database.OnError(HttpMethod.Post, "/classes", HttpStatusCode.Conflict, "CLASS_NAME_TAKEN", "A class named \"A\" already exists");

        var response = await _client.PostAsJsonAsync("/classes", new { name = "A", totalSeats = 5 });

        var problem = await JsonAssert.ReadProblemAsync(response, 409, "CLASS_NAME_TAKEN");
        Assert.Equal("A class named \"A\" already exists", problem.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task ListClasses_ReturnsBareArrayWithExactContract()
    {
        _factory.Database.OnData(HttpMethod.Get, "/classes", new[] { InternalClass() });

        var response = await _client.GetAsync("/classes");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await JsonAssert.ReadJsonAsync(response);
        Assert.Equal(JsonValueKind.Array, body.ValueKind);
        var item = Assert.Single(body.EnumerateArray());
        JsonAssert.HasExactProperties(item, "id", "name", "totalSeats", "heldSeats", "confirmedSeats", "availableSeats");
        Assert.Equal(15, item.GetProperty("heldSeats").GetInt32());
        Assert.Equal(80, item.GetProperty("confirmedSeats").GetInt32());
        Assert.Equal(25, item.GetProperty("availableSeats").GetInt32());
    }

    [Fact]
    public async Task ListClasses_EmptyList()
    {
        _factory.Database.OnData(HttpMethod.Get, "/classes", Array.Empty<object>());

        var response = await _client.GetAsync("/classes");

        Assert.Equal("[]", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task GetClass_ReturnsOneClass()
    {
        _factory.Database.OnData(HttpMethod.Get, $"/classes/{ClassId}", InternalClass());

        var response = await _client.GetAsync($"/classes/{ClassId}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await JsonAssert.ReadJsonAsync(response);
        JsonAssert.HasExactProperties(body, "id", "name", "totalSeats", "heldSeats", "confirmedSeats", "availableSeats");
    }

    [Fact]
    public async Task GetClass_NotFound_Returns404()
    {
        _factory.Database.OnError(HttpMethod.Get, $"/classes/{ClassId}", HttpStatusCode.NotFound, "NOT_FOUND", $"Class {ClassId} not found");

        var response = await _client.GetAsync($"/classes/{ClassId}");

        await JsonAssert.ReadProblemAsync(response, 404, "NOT_FOUND");
    }

    [Fact]
    public async Task GetClass_MalformedId_Returns400()
    {
        var response = await _client.GetAsync("/classes/c_123");

        await JsonAssert.ReadProblemAsync(response, 400, "VALIDATION_ERROR");
        Assert.Empty(_factory.Database.Requests);
    }
}
