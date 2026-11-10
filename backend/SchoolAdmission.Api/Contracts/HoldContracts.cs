namespace SchoolAdmission.Api.Contracts;

public sealed record HoldCreatedResponse(
    string HoldId,
    int ClassId,
    string StudentId,
    string Status,
    DateTime ExpiresAt);

public sealed record HoldResponse(string HoldId, int ClassId, string Status, DateTime ExpiresAt);

public sealed record HoldConfirmedResponse(string HoldId, string Status);

public sealed record StudentHoldResponse(
    string HoldId,
    int ClassId,
    string ClassName,
    string Section,
    string Status,
    DateTime ExpiresAt);
