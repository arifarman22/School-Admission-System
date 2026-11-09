namespace SchoolAdmission.Api.Clients;

public sealed class DatabaseServiceException(
    int statusCode,
    string code,
    string message,
    IReadOnlyList<InternalValidationIssue>? details = null)
    : Exception(message)
{
    public const string UpstreamProtocolError = "UPSTREAM_PROTOCOL_ERROR";

    public int StatusCode { get; } = statusCode;

    public string Code { get; } = code;

    public IReadOnlyList<InternalValidationIssue> Details { get; } = details ?? [];
}
