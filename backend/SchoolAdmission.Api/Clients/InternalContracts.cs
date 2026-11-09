namespace SchoolAdmission.Api.Clients;

public sealed record InternalEnvelope<T>(T Data);

public sealed record InternalErrorBody(InternalError? Error, string? RequestId);

public sealed record InternalError(string Code, string Message, IReadOnlyList<InternalValidationIssue>? Details);

public sealed record InternalValidationIssue(string Path, string Message);

public sealed record InternalClass(
    int Id,
    string Name,
    int TotalSeats,
    int HeldSeats,
    int ConfirmedSeats,
    int AvailableSeats,
    DateTimeOffset CreatedAt);

public sealed record InternalHold(
    string HoldId,
    int ClassId,
    string StudentId,
    string Status,
    DateTimeOffset CreatedAt,
    DateTimeOffset ExpiresAt,
    DateTimeOffset? ConfirmedAt);

public sealed record InternalStudentHold(
    string HoldId,
    int ClassId,
    string ClassName,
    string StudentId,
    string Status,
    DateTimeOffset CreatedAt,
    DateTimeOffset ExpiresAt,
    DateTimeOffset? ConfirmedAt);

public sealed record DatabaseServiceHealth(bool IsHealthy, int? StatusCode, string? Error = null);
