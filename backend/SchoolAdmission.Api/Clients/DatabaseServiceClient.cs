using System.Globalization;
using System.Text.Json;

namespace SchoolAdmission.Api.Clients;

public sealed class DatabaseServiceClient(HttpClient httpClient, ILogger<DatabaseServiceClient> logger)
    : IDatabaseServiceClient
{
    public const string InternalApiKeyHeader = "X-Internal-Api-Key";

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<DatabaseServiceHealth> GetHealthAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            using var response = await httpClient.GetAsync("health/ready", cancellationToken);
            return response.IsSuccessStatusCode
                ? new DatabaseServiceHealth(true, (int)response.StatusCode)
                : new DatabaseServiceHealth(false, (int)response.StatusCode, "Database service reported unhealthy");
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            if (cancellationToken.IsCancellationRequested)
            {
                throw;
            }

            logger.LogWarning(ex, "Database service health request failed");
            return new DatabaseServiceHealth(false, null, "Database service unreachable");
        }
    }

    public Task<InternalClass> CreateClassAsync(string name, string section, int totalSeats, CancellationToken cancellationToken = default) =>
        SendAsync<InternalClass>(HttpMethod.Post, "classes", new { name, section, totalSeats }, cancellationToken);

    public async Task<IReadOnlyList<InternalClass>> ListClassesAsync(CancellationToken cancellationToken = default) =>
        await SendAsync<List<InternalClass>>(HttpMethod.Get, "classes", null, cancellationToken);

    public Task<InternalClass> GetClassAsync(int classId, CancellationToken cancellationToken = default) =>
        SendAsync<InternalClass>(HttpMethod.Get, $"classes/{classId.ToString(CultureInfo.InvariantCulture)}", null, cancellationToken);

    public Task<InternalHold> CreateHoldAsync(int classId, string studentId, CancellationToken cancellationToken = default) =>
        SendAsync<InternalHold>(
            HttpMethod.Post,
            "holds",
            new { classId, studentId },
            cancellationToken);

    public Task<InternalHold> GetHoldAsync(Guid holdId, CancellationToken cancellationToken = default) =>
        SendAsync<InternalHold>(HttpMethod.Get, $"holds/{holdId:D}", null, cancellationToken);

    public Task<InternalHold> ConfirmHoldAsync(Guid holdId, string studentId, CancellationToken cancellationToken = default) =>
        SendAsync<InternalHold>(HttpMethod.Post, $"holds/{holdId:D}/confirm", new { studentId }, cancellationToken);

    public Task<InternalHold> CancelHoldAsync(Guid holdId, string studentId, CancellationToken cancellationToken = default) =>
        SendAsync<InternalHold>(HttpMethod.Post, $"holds/{holdId:D}/cancel", new { studentId }, cancellationToken);

    public async Task<IReadOnlyList<InternalStudentHold>> ListStudentHoldsAsync(
        string studentId,
        CancellationToken cancellationToken = default) =>
        await SendAsync<List<InternalStudentHold>>(
            HttpMethod.Get,
            $"students/{Uri.EscapeDataString(studentId)}/holds",
            null,
            cancellationToken);

    private async Task<T> SendAsync<T>(
        HttpMethod method,
        string path,
        object? body,
        CancellationToken cancellationToken)
        where T : class
    {
        using var request = new HttpRequestMessage(method, path);
        if (body is not null)
        {
            request.Content = JsonContent.Create(body, options: JsonOptions);
        }

        using var response = await httpClient.SendAsync(request, cancellationToken);

        if (response.IsSuccessStatusCode)
        {
            var envelope = await ReadJsonAsync<InternalEnvelope<T>>(response, cancellationToken);
            if (envelope?.Data is null)
            {
                throw ProtocolError(response, "Database service returned an empty response");
            }

            return envelope.Data;
        }

        var error = await ReadJsonAsync<InternalErrorBody>(response, cancellationToken);
        if (error?.Error is null)
        {
            throw ProtocolError(response, "Database service returned an unrecognised error");
        }

        throw new DatabaseServiceException(
            (int)response.StatusCode,
            error.Error.Code,
            error.Error.Message,
            error.Error.Details);
    }

    private async Task<TBody?> ReadJsonAsync<TBody>(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        try
        {
            return await response.Content.ReadFromJsonAsync<TBody>(JsonOptions, cancellationToken);
        }
        catch (Exception ex) when (ex is JsonException or NotSupportedException)
        {
            logger.LogWarning(ex, "Database service returned an unreadable body (status {StatusCode})", (int)response.StatusCode);
            return default;
        }
    }

    private static DatabaseServiceException ProtocolError(HttpResponseMessage response, string message) =>
        new((int)response.StatusCode, DatabaseServiceException.UpstreamProtocolError, message);
}
