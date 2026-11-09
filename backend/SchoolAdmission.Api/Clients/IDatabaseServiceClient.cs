namespace SchoolAdmission.Api.Clients;

public interface IDatabaseServiceClient
{
    Task<DatabaseServiceHealth> GetHealthAsync(CancellationToken cancellationToken = default);

    Task<InternalClass> CreateClassAsync(string name, int totalSeats, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<InternalClass>> ListClassesAsync(CancellationToken cancellationToken = default);

    Task<InternalClass> GetClassAsync(Guid classId, CancellationToken cancellationToken = default);

    Task<InternalHold> CreateHoldAsync(Guid classId, string studentId, CancellationToken cancellationToken = default);

    Task<InternalHold> GetHoldAsync(Guid holdId, CancellationToken cancellationToken = default);

    Task<InternalHold> ConfirmHoldAsync(Guid holdId, string studentId, CancellationToken cancellationToken = default);

    Task<InternalHold> CancelHoldAsync(Guid holdId, string studentId, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<InternalStudentHold>> ListStudentHoldsAsync(
        string studentId,
        CancellationToken cancellationToken = default);
}
