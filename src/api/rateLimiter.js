class RateLimiter {
  constructor() {
    this.limit = 60;
    this.remaining = 60;
    this.resetTime = 0;
  }

  update(rateLimit) {
    if (rateLimit.limit) this.limit = rateLimit.limit;
    if (typeof rateLimit.remaining === 'number') this.remaining = rateLimit.remaining;
    if (rateLimit.reset) this.resetTime = rateLimit.reset * 1000; // Convert to ms
  }

  getDelay(minFrequencyMs) {
    const now = Date.now();
    // Only back off if remaining is low AND reset time is in the future (not stale)
    if (this.remaining <= 1 && this.resetTime > now) {
      return Math.max(this.resetTime - now, minFrequencyMs);
    }
    return minFrequencyMs;
  }

  getStatus() {
    return {
      limit: this.limit,
      remaining: this.remaining,
      resetTime: this.resetTime
    };
  }
}

module.exports = RateLimiter;
