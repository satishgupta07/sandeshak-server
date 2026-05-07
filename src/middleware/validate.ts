import { Request, Response, NextFunction } from 'express'
import { ZodType } from 'zod'

export const validateBody =
  <T>(schema: ZodType<T>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      const message = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
      res.status(400).json({ error: message })
      return
    }
    req.body = result.data
    next()
  }
