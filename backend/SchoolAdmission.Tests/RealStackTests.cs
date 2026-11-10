using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Net.Sockets;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using SchoolAdmission.Tests.Infrastructure;

namespace SchoolAdmission.Tests;

public sealed class RealStackFactAttribute : FactAttribute
{
    public RealStackFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(RealStackFactory.ServiceUrl) || string.IsNullOrWhiteSpace(RealStackFactory.ApiKey))
        {
            Skip = "Set REAL_PRISMA_SERVICE_URL and REAL_INTERNAL_API_KEY to run against the real database service and PostgreSQL";
        }
    }
}

public sealed class RealStackFactory : WebApplicationFactory<Program>
{
    public static readonly string? ServiceUrl = Environment.GetEnvironmentVariable("REAL_PRISMA_SERVICE_URL");
    public static readonly string? ApiKey = Environment.GetEnvironmentVariable("REAL_INTERNAL_API_KEY");

    private readonly string _serviceUrl;
    private readonly string _apiKey;

    public RealStackFactory()
        : this(ServiceUrl ?? "http://127.0.0.1:1", ApiKey ?? "unused-internal-key-1234567890")
    {
    }

    public RealStackFactory(string serviceUrl, string apiKey)
    {
        _serviceUrl = serviceUrl;
        _apiKey = apiKey;
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("PRISMA_SERVICE_URL", _serviceUrl);
        builder.UseSetting("INTERNAL_API_KEY", _apiKey);
        builder.UseSetting("DatabaseService:TimeoutSeconds", "60");
        builder.UseSetting("Cors:AllowedOrigins", ApiFactory.AllowedOrigin);
    }
}

[Collection(nameof(StartupIsolation))]
public sealed class RealStackTests : IDisposable
{
    private static int _studentCounter;
    private static readonly string StudentPrefix = Random.Shared.Next(1000, 9999).ToString(System.Globalization.CultureInfo.InvariantCulture);

    private readonly RealStackFactory _factory = new();
    private readonly HttpClient _client;
    private readonly string _tag = $"xunit-{Guid.NewGuid():N}"[..14];

    public RealStackTests() => _client = _factory.CreateClient();

    public void Dispose()
    {
        _client.Dispose();
        _factory.Dispose();
    }

    private static string NextStudent() =>
        StudentPrefix + Interlocked.Increment(ref _studentCounter).ToString("D13", System.Globalization.CultureInfo.InvariantCulture);

    private async Task<int> CreateClassAsync(string label, int seats)
    {
        var response = await _client.PostAsJsonAsync("/classes", new { name = $"{_tag} {label}", totalSeats = seats });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await JsonAssert.ReadJsonAsync(response)).GetProperty("id").GetInt32();
    }

    private Task<HttpResponseMessage> SendAsync(HttpMethod method, string path, string? studentId)
    {
        var request = new HttpRequestMessage(method, path);
        if (studentId is not null)
        {
            request.Headers.Add("X-Student-Id", studentId);
        }

        return _client.SendAsync(request);
    }

    private async Task<(int Status, string? Code, JsonElement Body)> ResultAsync(HttpResponseMessage response)
    {
        var text = await response.Content.ReadAsStringAsync();
        var body = text.Length == 0 ? default : JsonDocument.Parse(text).RootElement.Clone();
        string? code = body.ValueKind == JsonValueKind.Object && body.TryGetProperty("code", out var c) ? c.GetString() : null;
        return ((int)response.StatusCode, code, body);
    }

    private Task<HttpResponseMessage> ApplyAsync(int classId, string studentId) =>
        SendAsync(HttpMethod.Post, $"/classes/{classId}/holds", studentId);

    private async Task<JsonElement> GetClassAsync(int classId)
    {
        var response = await _client.GetAsync($"/classes/{classId}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return await JsonAssert.ReadJsonAsync(response);
    }

    private static Dictionary<string, int> Tally(IEnumerable<(int Status, string? Code, JsonElement Body)> results) =>
        results
            .GroupBy(r => r.Status is 200 or 201 or 204 ? r.Status.ToString(System.Globalization.CultureInfo.InvariantCulture) : r.Code ?? r.Status.ToString(System.Globalization.CultureInfo.InvariantCulture))
            .ToDictionary(g => g.Key, g => g.Count());

    [RealStackFact]
    public async Task AllEightEndpoints_WorkEndToEndWithExactContracts()
    {
        var student = NextStudent();

        var create = await _client.PostAsJsonAsync("/classes", new { name = $"{_tag} lifecycle", totalSeats = 3 });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var created = await JsonAssert.ReadJsonAsync(create);
        JsonAssert.HasExactProperties(created, "id", "name", "section", "totalSeats");
        var classId = created.GetProperty("id").GetInt32();
        Assert.Equal($"/classes/{classId}", create.Headers.Location?.AbsolutePath);

        var list = await JsonAssert.ReadJsonAsync(await _client.GetAsync("/classes"));
        var listed = Assert.Single(list.EnumerateArray(), c => c.GetProperty("id").GetInt32() == classId);
        JsonAssert.HasExactProperties(listed, "id", "name", "section", "totalSeats", "heldSeats", "confirmedSeats", "availableSeats");

        var one = await GetClassAsync(classId);
        JsonAssert.HasExactProperties(one, "id", "name", "section", "totalSeats", "heldSeats", "confirmedSeats", "availableSeats");
        Assert.Equal(3, one.GetProperty("availableSeats").GetInt32());

        var apply = await ApplyAsync(classId, student);
        Assert.Equal(HttpStatusCode.Created, apply.StatusCode);
        var hold = await JsonAssert.ReadJsonAsync(apply);
        JsonAssert.HasExactProperties(hold, "holdId", "classId", "studentId", "status", "expiresAt");
        Assert.Equal(student, hold.GetProperty("studentId").GetString());
        Assert.Equal("HELD", hold.GetProperty("status").GetString());
        var holdId = hold.GetProperty("holdId").GetString()!;
        Assert.Equal($"/holds/{holdId}", apply.Headers.Location?.AbsolutePath);

        var fetched = await JsonAssert.ReadJsonAsync(await _client.GetAsync($"/holds/{holdId}"));
        JsonAssert.HasExactProperties(fetched, "holdId", "classId", "status", "expiresAt");
        Assert.Equal("HELD", fetched.GetProperty("status").GetString());

        var mine = await JsonAssert.ReadJsonAsync(await SendAsync(HttpMethod.Get, "/me/holds", student));
        var item = Assert.Single(mine.EnumerateArray());
        JsonAssert.HasExactProperties(item, "holdId", "classId", "className", "section", "status", "expiresAt");
        Assert.Equal($"{_tag} lifecycle", item.GetProperty("className").GetString());

        var confirm = await SendAsync(HttpMethod.Post, $"/holds/{holdId}/confirm", student);
        Assert.Equal(HttpStatusCode.OK, confirm.StatusCode);
        var confirmed = await JsonAssert.ReadJsonAsync(confirm);
        JsonAssert.HasExactProperties(confirmed, "holdId", "status");
        Assert.Equal("CONFIRMED", confirmed.GetProperty("status").GetString());

        var otherClassId = await CreateClassAsync("lifecycle-cancel", 1);
        await JsonAssert.ReadProblemAsync(await ApplyAsync(otherClassId, student), 409, "ALREADY_ADMITTED");

        var otherStudent = NextStudent();
        var second = await JsonAssert.ReadJsonAsync(await ApplyAsync(otherClassId, otherStudent));
        var secondId = second.GetProperty("holdId").GetString()!;
        var cancel = await SendAsync(HttpMethod.Delete, $"/holds/{secondId}", otherStudent);
        Assert.Equal(HttpStatusCode.NoContent, cancel.StatusCode);
        Assert.Empty(await cancel.Content.ReadAsByteArrayAsync());
        var afterCancel = await JsonAssert.ReadJsonAsync(await _client.GetAsync($"/holds/{secondId}"));
        Assert.Equal("CANCELLED", afterCancel.GetProperty("status").GetString());

        var final = await GetClassAsync(classId);
        Assert.Equal(0, final.GetProperty("heldSeats").GetInt32());
        Assert.Equal(1, final.GetProperty("confirmedSeats").GetInt32());
        Assert.Equal(2, final.GetProperty("availableSeats").GetInt32());
    }

    [RealStackFact]
    public async Task ErrorMapping_UsesRealServiceResponses()
    {
        var owner = NextStudent();
        var classId = await CreateClassAsync("errors", 1);

        var duplicate = await _client.PostAsJsonAsync("/classes", new { name = $"{_tag} errors", totalSeats = 5 });
        await JsonAssert.ReadProblemAsync(duplicate, 409, "CLASS_SECTION_TAKEN");

        await JsonAssert.ReadProblemAsync(await _client.PostAsJsonAsync("/classes", new { name = $"{_tag} zero", totalSeats = 0 }), 400, "VALIDATION_ERROR");
        await JsonAssert.ReadProblemAsync(await _client.GetAsync("/classes/2000000000"), 404, "NOT_FOUND");
        await JsonAssert.ReadProblemAsync(await ApplyAsync(2_000_000_000, owner), 404, "NOT_FOUND");
        await JsonAssert.ReadProblemAsync(await SendAsync(HttpMethod.Post, $"/classes/{classId}/holds", null), 401, "STUDENT_ID_REQUIRED");
        await JsonAssert.ReadProblemAsync(await SendAsync(HttpMethod.Post, $"/classes/{classId}/holds", "123"), 400, "VALIDATION_ERROR");

        var holdId = (await JsonAssert.ReadJsonAsync(await ApplyAsync(classId, owner))).GetProperty("holdId").GetString()!;
        await JsonAssert.ReadProblemAsync(await ApplyAsync(classId, owner), 409, "DUPLICATE_APPLICATION");
        await JsonAssert.ReadProblemAsync(await ApplyAsync(classId, NextStudent()), 409, "SEATS_FULL");

        var intruder = NextStudent();
        await JsonAssert.ReadProblemAsync(await SendAsync(HttpMethod.Post, $"/holds/{holdId}/confirm", intruder), 403, "HOLD_NOT_OWNED");
        await JsonAssert.ReadProblemAsync(await SendAsync(HttpMethod.Delete, $"/holds/{holdId}", intruder), 403, "HOLD_NOT_OWNED");

        Assert.Equal(HttpStatusCode.OK, (await SendAsync(HttpMethod.Post, $"/holds/{holdId}/confirm", owner)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await SendAsync(HttpMethod.Post, $"/holds/{holdId}/confirm", owner)).StatusCode);
        await JsonAssert.ReadProblemAsync(await SendAsync(HttpMethod.Delete, $"/holds/{holdId}", owner), 409, "HOLD_ALREADY_CONFIRMED");
        await JsonAssert.ReadProblemAsync(await SendAsync(HttpMethod.Post, $"/holds/{Guid.NewGuid()}/confirm", owner), 404, "NOT_FOUND");
    }

    [RealStackFact]
    public async Task OneStudent_CanBeAdmittedToOnlyOneClass_EvenWhenConfirmingAtOnce()
    {
        var student = NextStudent();
        var holdIds = new List<string>();
        for (var i = 0; i < 4; i++)
        {
            var classId = await CreateClassAsync($"one-admission-{i}", 2);
            holdIds.Add((await JsonAssert.ReadJsonAsync(await ApplyAsync(classId, student))).GetProperty("holdId").GetString()!);
        }

        var responses = await Task.WhenAll(holdIds.Select(id => SendAsync(HttpMethod.Post, $"/holds/{id}/confirm", student)));
        var results = await Task.WhenAll(responses.Select(ResultAsync));

        Assert.Equal(new Dictionary<string, int> { ["200"] = 1, ["ALREADY_ADMITTED"] = 3 }, Tally(results));
        var mine = await JsonAssert.ReadJsonAsync(await SendAsync(HttpMethod.Get, "/me/holds", student));
        Assert.Single(mine.EnumerateArray(), h => h.GetProperty("status").GetString() == "CONFIRMED");
        var otherClass = await CreateClassAsync("one-admission-after", 2);
        await JsonAssert.ReadProblemAsync(await ApplyAsync(otherClass, student), 409, "ALREADY_ADMITTED");
    }

    [RealStackFact]
    public async Task HundredStudentsForTenSeats_ThroughPublicApi_ExactlyTenHolds()
    {
        for (var round = 0; round < 3; round++)
        {
            var classId = await CreateClassAsync($"ten-{round}", 10);
            var samples = new ConcurrentBag<int>();
            using var stop = new CancellationTokenSource();
            var watcher = Task.Run(async () =>
            {
                while (!stop.IsCancellationRequested)
                {
                    samples.Add((await GetClassAsync(classId)).GetProperty("availableSeats").GetInt32());
                }
            });

            var responses = await Task.WhenAll(Enumerable.Range(0, 100).Select(_ => ApplyAsync(classId, NextStudent())));
            var results = await Task.WhenAll(responses.Select(ResultAsync));
            await stop.CancelAsync();
            await watcher;

            Assert.Equal(new Dictionary<string, int> { ["201"] = 10, ["SEATS_FULL"] = 90 }, Tally(results));
            Assert.NotEmpty(samples);
            Assert.All(samples, available => Assert.InRange(available, 0, 10));

            var final = await GetClassAsync(classId);
            Assert.Equal(10, final.GetProperty("heldSeats").GetInt32());
            Assert.Equal(0, final.GetProperty("availableSeats").GetInt32());
            var winners = results.Where(r => r.Status == 201).Select(r => r.Body.GetProperty("studentId").GetString()).ToHashSet();
            Assert.Equal(10, winners.Count);
        }
    }

    [RealStackFact]
    public async Task FiftyStudentsForOneSeat_ThroughPublicApi_ExactlyOneHold()
    {
        var classId = await CreateClassAsync("one", 1);

        var responses = await Task.WhenAll(Enumerable.Range(0, 50).Select(_ => ApplyAsync(classId, NextStudent())));
        var results = await Task.WhenAll(responses.Select(ResultAsync));

        Assert.Equal(new Dictionary<string, int> { ["201"] = 1, ["SEATS_FULL"] = 49 }, Tally(results));
        Assert.Equal(0, (await GetClassAsync(classId)).GetProperty("availableSeats").GetInt32());
    }

    [RealStackFact]
    public async Task SameStudentSimultaneousRequests_ThroughPublicApi_ExactlyOneHold()
    {
        var classId = await CreateClassAsync("same", 10);
        var student = NextStudent();

        var responses = await Task.WhenAll(Enumerable.Range(0, 20).Select(_ => ApplyAsync(classId, student)));
        var results = await Task.WhenAll(responses.Select(ResultAsync));

        Assert.Equal(new Dictionary<string, int> { ["201"] = 1, ["DUPLICATE_APPLICATION"] = 19 }, Tally(results));
        var mine = await JsonAssert.ReadJsonAsync(await SendAsync(HttpMethod.Get, "/me/holds", student));
        Assert.Single(mine.EnumerateArray());
    }

    [RealStackFact]
    public async Task ConcurrentConfirmAndCancel_ThroughPublicApi_OneOutcomeWins()
    {
        for (var round = 0; round < 10; round++)
        {
            var classId = await CreateClassAsync($"race-{round}", 1);
            var student = NextStudent();
            var holdId = (await JsonAssert.ReadJsonAsync(await ApplyAsync(classId, student))).GetProperty("holdId").GetString()!;

            var ops = Enumerable.Range(0, 10).SelectMany(_ => new[] { "confirm", "cancel" }).OrderBy(_ => Random.Shared.Next()).ToArray();
            var responses = await Task.WhenAll(ops.Select(op => op == "confirm"
                ? SendAsync(HttpMethod.Post, $"/holds/{holdId}/confirm", student)
                : SendAsync(HttpMethod.Delete, $"/holds/{holdId}", student)));
            var results = await Task.WhenAll(responses.Select(ResultAsync));
            var confirms = results.Where((_, i) => ops[i] == "confirm").ToArray();
            var cancels = results.Where((_, i) => ops[i] == "cancel").ToArray();

            var status = (await JsonAssert.ReadJsonAsync(await _client.GetAsync($"/holds/{holdId}"))).GetProperty("status").GetString();
            var seats = await GetClassAsync(classId);
            if (status == "CONFIRMED")
            {
                Assert.Equal(new Dictionary<string, int> { ["200"] = 10 }, Tally(confirms));
                Assert.Equal(new Dictionary<string, int> { ["HOLD_ALREADY_CONFIRMED"] = 10 }, Tally(cancels));
                Assert.Equal(1, seats.GetProperty("confirmedSeats").GetInt32());
                Assert.Equal(0, seats.GetProperty("availableSeats").GetInt32());
            }
            else
            {
                Assert.Equal("CANCELLED", status);
                Assert.Equal(new Dictionary<string, int> { ["204"] = 10 }, Tally(cancels));
                Assert.Equal(new Dictionary<string, int> { ["HOLD_NOT_ACTIVE"] = 10 }, Tally(confirms));
                Assert.Equal(1, seats.GetProperty("availableSeats").GetInt32());
            }
        }
    }

    [Fact]
    public async Task UnreachableRealSocket_Returns503ForEveryEndpointWithoutLeakingAddress()
    {
        int port;
        using (var listener = new TcpListener(IPAddress.Loopback, 0))
        {
            listener.Start();
            port = ((IPEndPoint)listener.LocalEndpoint).Port;
            listener.Stop();
        }

        using var factory = new RealStackFactory($"http://127.0.0.1:{port}", "closed-port-internal-key-123456");
        using var client = factory.CreateClient();
        const string student = "20152691234567890";
        const int classId = 7;
        var holdId = Guid.NewGuid();

        var requests = new Func<HttpRequestMessage>[]
        {
            () => new HttpRequestMessage(HttpMethod.Post, "/classes") { Content = JsonAssert.JsonBody("""{"name":"X","totalSeats":1}""") },
            () => new HttpRequestMessage(HttpMethod.Get, "/classes"),
            () => new HttpRequestMessage(HttpMethod.Get, $"/classes/{classId}"),
            () => WithStudent(new HttpRequestMessage(HttpMethod.Post, $"/classes/{classId}/holds")),
            () => new HttpRequestMessage(HttpMethod.Get, $"/holds/{holdId}"),
            () => WithStudent(new HttpRequestMessage(HttpMethod.Post, $"/holds/{holdId}/confirm")),
            () => WithStudent(new HttpRequestMessage(HttpMethod.Delete, $"/holds/{holdId}")),
            () => WithStudent(new HttpRequestMessage(HttpMethod.Get, "/me/holds")),
        };

        foreach (var build in requests)
        {
            var response = await client.SendAsync(build());
            var problem = await JsonAssert.ReadProblemAsync(response, 503, "SERVICE_UNAVAILABLE");
            Assert.DoesNotContain(port.ToString(System.Globalization.CultureInfo.InvariantCulture), problem.ToString(), StringComparison.Ordinal);
        }

        var ready = await client.GetAsync("/health/ready");
        Assert.Equal(HttpStatusCode.ServiceUnavailable, ready.StatusCode);

        static HttpRequestMessage WithStudent(HttpRequestMessage request)
        {
            request.Headers.Add("X-Student-Id", student);
            return request;
        }
    }
}
