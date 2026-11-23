/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Request, Response, NextFunction } from 'express';

interface BucketEntry {
  timestamps: number[];
}

export interface RateLimiterOptions {
  keyPrefix: string;
  windowMs: number;
  maxPerIp: number;
  maxPerUid?: number;
}

export function createRateLimiter(options: RateLimiterOptions) {
  const buckets = new Map<string, BucketEntry>();

  const consume = (bucketKey: string, max: number, now: number): { allowed: boolean; remaining: number; retryAfterSec: number } => {
    const cutoff = now - options.windowMs;
    const entry = buckets.get(bucketKey) || { timestamps: [] };
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

    if (entry.timestamps.length >= max) {
      const oldest = entry.timestamps[0] || now;
      const retryAfterSec = Math.max(1, Math.ceil((oldest + options.windowMs - now) / 1000));
      buckets.set(bucketKey, entry);
      return { allowed: false, remaining: 0, retryAfterSec };
    }

    entry.timestamps.push(now);
    buckets.set(bucketKey, entry);
    if (buckets.size > 5000) {
      // Bound memory growth cleanly
      const firstKey = buckets.keys().next().value;
      if (firstKey) buckets.delete(firstKey);
    }
    return {
      allowed: true,
      remaining: Math.max(0, max - entry.timestamps.length),
      retryAfterSec: 0,
    };
  };

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const rawIp = req.ip || req.socket?.remoteAddress || 'unknown';
    const ipRes = consume(`${options.keyPrefix}:ip:${rawIp}`, options.maxPerIp, now);
    if (!ipRes.allowed) {
      res.setHeader('Retry-After', String(ipRes.retryAfterSec));
      return res.status(429).json({
        error: 'تم تجاوز الحد الأقصى للطلبات المسموح بها مؤقتاً. يرجى الانتظار قليلاً ثم إعادة المحاولة.',
        retryAfterSec: ipRes.retryAfterSec,
      });
    }

    const actorUid =
      (req as any).authActor?.uid ||
      (req as any).authActor?.teacherId ||
      (req as any).studentActor?.uid ||
      '';
    if (actorUid && options.maxPerUid) {
      const uidRes = consume(`${options.keyPrefix}:uid:${actorUid}`, options.maxPerUid, now);
      if (!uidRes.allowed) {
        res.setHeader('Retry-After', String(uidRes.retryAfterSec));
        return res.status(429).json({
          error: 'تم تجاوز حصة المستخدم للطلبات مؤقتاً. يرجى المحاولة بعد قليل.',
          retryAfterSec: uidRes.retryAfterSec,
        });
      }
      res.setHeader('X-RateLimit-Remaining', String(Math.min(ipRes.remaining, uidRes.remaining)));
    } else {
      res.setHeader('X-RateLimit-Remaining', String(ipRes.remaining));
    }

    return next();
  };
}
