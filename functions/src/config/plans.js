'use strict';
module.exports.plans = {
  free: {
    dailyLimit: parseInt(process.env.FREE_DAILY_LIMIT || '10', 10),
    model: process.env.MODEL_FREE || 'claude-3-haiku-20240307',
    maxOutputTokens: parseInt(process.env.FREE_MAX_TOKENS || '1024', 10),
  },
  premium: {
    dailyLimit: parseInt(process.env.PREMIUM_DAILY_LIMIT || '300', 10),
    model: process.env.MODEL_PREMIUM || 'claude-3-5-sonnet-20240620',
    maxOutputTokens: parseInt(process.env.PREMIUM_MAX_TOKENS || '2048', 10),
  },
};
