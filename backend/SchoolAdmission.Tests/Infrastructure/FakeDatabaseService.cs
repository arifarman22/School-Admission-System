using System.Collections.Concurrent;
using System.Net;
using System.Text;
using System.Text.Json;

namespace SchoolAdmission.Tests.Infrastructure;

public sealed record RecordedRequest(string Method, string Path, IReadOnlyDictionary<string, string> Headers, string? Body)
{
    public JsonElement Json => JsonDocument.Parse(Body ?? "null").RootElement;
}

public sealed class FakeDatabaseService : HttpMessageHandler
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly ConcurrentDictionary<string, Func<HttpResponseMessage>> _routes = new();

    public ConcurrentQueue<RecordedRequest> Requests { get; } = new();

    public void OnData(HttpMethod method, string path, object data, HttpStatusCode status = HttpStatusCode.OK) =>
        _routes[Key(method, path)] = () => Json(status, new { data });

    public void OnError(HttpMethod method, string path, HttpStatusCode status, string code, string message, object[]? details = null) =>
        _routes[Key(method, path)] = () => Json(status, new { error = new { code, message, details }, requestId = "internal-req" });

    public void OnRaw(HttpMethod method, string path, HttpStatusCode status, string body, string contentType = "text/plain") =>
        _routes[Key(method, path)] = () => new HttpResponseMessage(status)
        {
            Content = new StringContent(body, Encoding.UTF8, contentType),
        };

    public void OnThrow(HttpMethod method, string path, Exception exception) =>
        _routes[Key(method, path)] = () => throw exception;

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var path = request.RequestUri!.AbsolutePath;
        var headers = request.Headers.ToDictionary(h => h.Key, h => string.Join(",", h.Value), StringComparer.OrdinalIgnoreCase);
        var body = request.Content is null ? null : await request.Content.ReadAsStringAsync(cancellationToken);
        Requests.Enqueue(new RecordedRequest(request.Method.Method, path, headers, body));

        if (!_routes.TryGetValue(Key(request.Method, path), out var respond))
        {
            throw new InvalidOperationException($"Unexpected internal call {request.Method} {path}");
        }

        return respond();
    }

    private static string Key(HttpMethod method, string path) => $"{method.Method} {path}";

    private static HttpResponseMessage Json(HttpStatusCode status, object payload) =>
        new(status)
        {
            Content = new StringContent(JsonSerializer.Serialize(payload, JsonOptions), Encoding.UTF8, "application/json"),
        };
}
