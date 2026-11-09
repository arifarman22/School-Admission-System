using SchoolAdmission.Api.Clients;
using SchoolAdmission.Api.Contracts;

namespace SchoolAdmission.Api.Services;

public interface IHoldService
{
    Task<HoldCreatedResponse> CreateAsync(int classId, string studentId, CancellationToken cancellationToken);

    Task<HoldResponse> GetAsync(Guid holdId, CancellationToken cancellationToken);

    Task<HoldConfirmedResponse> ConfirmAsync(Guid holdId, string studentId, CancellationToken cancellationToken);

    Task CancelAsync(Guid holdId, string studentId, CancellationToken cancellationToken);

    Task<IReadOnlyList<StudentHoldResponse>> ListForStudentAsync(string studentId, CancellationToken cancellationToken);
}

public sealed class HoldService(IDatabaseServiceClient databaseService) : IHoldService
{
    public async Task<HoldCreatedResponse> CreateAsync(int classId, string studentId, CancellationToken cancellationToken)
    {
        var hold = await databaseService.CreateHoldAsync(classId, studentId, cancellationToken);
        return new HoldCreatedResponse(hold.HoldId, hold.ClassId, hold.StudentId, hold.Status, hold.ExpiresAt.UtcDateTime);
    }

    public async Task<HoldResponse> GetAsync(Guid holdId, CancellationToken cancellationToken)
    {
        var hold = await databaseService.GetHoldAsync(holdId, cancellationToken);
        return new HoldResponse(hold.HoldId, hold.ClassId, hold.Status, hold.ExpiresAt.UtcDateTime);
    }

    public async Task<HoldConfirmedResponse> ConfirmAsync(Guid holdId, string studentId, CancellationToken cancellationToken)
    {
        var hold = await databaseService.ConfirmHoldAsync(holdId, studentId, cancellationToken);
        return new HoldConfirmedResponse(hold.HoldId, hold.Status);
    }

    public Task CancelAsync(Guid holdId, string studentId, CancellationToken cancellationToken) =>
        databaseService.CancelHoldAsync(holdId, studentId, cancellationToken);

    public async Task<IReadOnlyList<StudentHoldResponse>> ListForStudentAsync(
        string studentId,
        CancellationToken cancellationToken)
    {
        var holds = await databaseService.ListStudentHoldsAsync(studentId, cancellationToken);
        return holds
            .Select(h => new StudentHoldResponse(h.HoldId, h.ClassId, h.ClassName, h.Status, h.ExpiresAt.UtcDateTime))
            .ToList();
    }
}
