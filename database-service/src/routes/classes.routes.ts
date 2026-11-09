import { Router, type Response } from 'express';
import { parseInput, parseJsonBody } from '../middleware/validate.js';
import type { ClassService } from '../services/class.service.js';
import type { DataResponse } from '../types/api.js';
import { classIdParamsSchema, createClassBodySchema, type ClassDto } from '../types/classes.js';

export function classesRouter(classes: ClassService): Router {
  const router = Router();

  router.post('/', async (req, res: Response<DataResponse<ClassDto>>) => {
    const input = parseJsonBody(req, createClassBodySchema);
    const created = await classes.createClass(input);
    res.status(201).location(`/classes/${created.id}`).json({ data: created });
  });

  router.get('/', async (_req, res: Response<DataResponse<ClassDto[]>>) => {
    res.json({ data: await classes.listClasses() });
  });

  router.get('/:classId', async (req, res: Response<DataResponse<ClassDto>>) => {
    const { classId } = parseInput(classIdParamsSchema, req.params);
    res.json({ data: await classes.getClass(classId) });
  });

  return router;
}
