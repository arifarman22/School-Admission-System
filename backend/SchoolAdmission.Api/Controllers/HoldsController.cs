using Microsoft.AspNetCore.Mvc;
using SchoolAdmission.Api.Contracts;
using SchoolAdmission.Api.Filters;
using SchoolAdmission.Api.Services;

namespace SchoolAdmission.Api.Controllers;

[ApiController]
public sealed class HoldsController(IHoldService holds) : ControllerBase
{
    [HttpPost("classes/{classId}/holds")]
    [RequireStudentId]
    [ProducesResponseType<HoldCreatedResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<HoldCreatedResponse>> Create(Guid classId, CancellationToken cancellationToken)
    {
        var studentId = RequireStudentIdAttribute.GetStudentId(HttpContext);
        var hold = await holds.CreateAsync(classId, studentId, cancellationToken);
        return CreatedAtAction(nameof(Get), new { holdId = hold.HoldId }, hold);
    }

    [HttpGet("holds/{holdId}")]
    [ProducesResponseType<HoldResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<HoldResponse>> Get(Guid holdId, CancellationToken cancellationToken) =>
        Ok(await holds.GetAsync(holdId, cancellationToken));

    [HttpPost("holds/{holdId}/confirm")]
    [RequireStudentId]
    [ProducesResponseType<HoldConfirmedResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<HoldConfirmedResponse>> Confirm(Guid holdId, CancellationToken cancellationToken)
    {
        var studentId = RequireStudentIdAttribute.GetStudentId(HttpContext);
        return Ok(await holds.ConfirmAsync(holdId, studentId, cancellationToken));
    }

    [HttpDelete("holds/{holdId}")]
    [RequireStudentId]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Cancel(Guid holdId, CancellationToken cancellationToken)
    {
        var studentId = RequireStudentIdAttribute.GetStudentId(HttpContext);
        await holds.CancelAsync(holdId, studentId, cancellationToken);
        return NoContent();
    }
}
