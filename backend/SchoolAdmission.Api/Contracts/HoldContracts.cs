namespace SchoolAdmission.Api.Contracts;

public sealed record HoldCreatedResponse(
    string HoldId,
    string ClassId,
    string StudentId,
    string Status,
    DateTime ExpiresAt);

public sealed record HoldResponse(string HoldId, string ClassId, string Status, DateTime ExpiresAt);

public sealed record HoldConfirmedResponse(string HoldId, string Status);

public sealed record StudentHoldResponse(
    string HoldId,
    string ClassId,
    string ClassName,
    string Status,
    DateTime ExpiresAt);
