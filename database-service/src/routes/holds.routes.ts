import { Router, type Response } from 'express';
import { parseInput, parseJsonBody } from '../middleware/validate.js';
import type { HoldService } from '../services/hold.service.js';
import type { DataResponse } from '../types/api.js';
import {
  createHoldBodySchema,
  holdIdParamsSchema,
  studentActionBodySchema,
  studentIdParamsSchema,
  type HoldDto,
  type StudentHoldDto,
} from '../types/holds.js';

export function holdsRouter(holds: HoldService): Router {
  const router = Router();

  router.post('/', async (req, res: Response<DataResponse<HoldDto>>) => {
    const input = parseJsonBody(req, createHoldBodySchema);
    const hold = await holds.createHold(input);
    res.status(201).location(`/holds/${hold.holdId}`).json({ data: hold });
  });

  router.get('/:holdId', async (req, res: Response<DataResponse<HoldDto>>) => {
    const { holdId } = parseInput(holdIdParamsSchema, req.params);
    res.json({ data: await holds.getHold(holdId) });
  });

  router.post('/:holdId/confirm', async (req, res: Response<DataResponse<HoldDto>>) => {
    const { holdId } = parseInput(holdIdParamsSchema, req.params);
    const { studentId } = parseJsonBody(req, studentActionBodySchema);
    res.json({ data: await holds.confirmHold(holdId, studentId) });
  });

  router.post('/:holdId/cancel', async (req, res: Response<DataResponse<HoldDto>>) => {
    const { holdId } = parseInput(holdIdParamsSchema, req.params);
    const { studentId } = parseJsonBody(req, studentActionBodySchema);
    res.json({ data: await holds.cancelHold(holdId, studentId) });
  });

  return router;
}

export function studentsRouter(holds: HoldService): Router {
  const router = Router();

  router.get('/:studentId/holds', async (req, res: Response<DataResponse<StudentHoldDto[]>>) => {
    const { studentId } = parseInput(studentIdParamsSchema, req.params);
    res.json({ data: await holds.listStudentHolds(studentId) });
  });

  return router;
}
