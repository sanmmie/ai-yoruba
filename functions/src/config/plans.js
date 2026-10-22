'use strict';

const plans = {
  free: {
    dailyMessageCap: parseInt(process.env.FREE_DAILY_LIMIT || '10', 10),
    model: process.env.MODEL_FREE || 'claude-3-haiku-20240307',
    maxOutputTokens: 1024,
    historyTokenBudget: 4000,
  },
  premium: {
    dailyMessageCap: parseInt(process.env.PREMIUM_DAILY_CAP || '300', 10),
    model: process.env.MODEL_PREMIUM || 'claude-3-5-sonnet-20240620',
    maxOutputTokens: parseInt(process.env.MAX_TOKENS || '2048', 10),
    historyTokenBudget: 12000,
  },
  student: {
    dailyMessageCap: parseInt(process.env.STUDENT_DAILY_CAP || '50', 10),
    model: process.env.MODEL_PREMIUM || 'claude-3-5-sonnet-20240620',
    maxOutputTokens: 1536,
    historyTokenBudget: 8000,
  }
};

module.exports = { plans };
