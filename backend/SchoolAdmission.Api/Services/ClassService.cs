using SchoolAdmission.Api.Clients;
using SchoolAdmission.Api.Contracts;

namespace SchoolAdmission.Api.Services;

public interface IClassService
{
    Task<ClassCreatedResponse> CreateAsync(CreateClassRequest request, CancellationToken cancellationToken);

    Task<IReadOnlyList<ClassResponse>> ListAsync(CancellationToken cancellationToken);

    Task<ClassResponse> GetAsync(int classId, CancellationToken cancellationToken);
}

public sealed class ClassService(IDatabaseServiceClient databaseService) : IClassService
{
    public async Task<ClassCreatedResponse> CreateAsync(CreateClassRequest request, CancellationToken cancellationToken)
    {
        var created = await databaseService.CreateClassAsync(request.Name!, request.TotalSeats!.Value, cancellationToken);
        return new ClassCreatedResponse(created.Id, created.Name, created.TotalSeats);
    }

    public async Task<IReadOnlyList<ClassResponse>> ListAsync(CancellationToken cancellationToken)
    {
        var classes = await databaseService.ListClassesAsync(cancellationToken);
        return classes.Select(ToResponse).ToList();
    }

    public async Task<ClassResponse> GetAsync(int classId, CancellationToken cancellationToken) =>
        ToResponse(await databaseService.GetClassAsync(classId, cancellationToken));

    private static ClassResponse ToResponse(InternalClass c) =>
        new(c.Id, c.Name, c.TotalSeats, c.HeldSeats, c.ConfirmedSeats, c.AvailableSeats);
}
