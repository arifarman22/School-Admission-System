using Microsoft.AspNetCore.Mvc;
using SchoolAdmission.Api.Contracts;
using SchoolAdmission.Api.Filters;
using SchoolAdmission.Api.Services;

namespace SchoolAdmission.Api.Controllers;

[ApiController]
[Route("me")]
public sealed class MeController(IHoldService holds) : ControllerBase
{
    [HttpGet("holds")]
    [RequireStudentId]
    [ProducesResponseType<IReadOnlyList<StudentHoldResponse>>(StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<StudentHoldResponse>>> ListHolds(CancellationToken cancellationToken)
    {
        var studentId = RequireStudentIdAttribute.GetStudentId(HttpContext);
        return Ok(await holds.ListForStudentAsync(studentId, cancellationToken));
    }
}
