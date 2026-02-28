import api from './authApi';

// KITA GUNAKAN NAMED EXPORT (tambahkan kata 'export' di depan const)
export const referralApi = {
  // Generate or get existing referral code
  generateCode: async (customCode = null) => {
    const body = customCode ? { custom_code: customCode } : {};
    const response = await api.post('/api/v1/referral/generate', body);
    return response.data;
  },

  // Get my current referral code
  getMyCode: async () => {
    const response = await api.get('/api/v1/referral/my-code');
    return response.data;
  },

  // Get referral dashboard stats
  getStats: async () => {
    const response = await api.get('/api/v1/referral/stats');
    return response.data;
  },

  // Validate a referral code (public, no auth needed)
  validateCode: async (code) => {
    const response = await api.get(`/api/v1/referral/validate/${code}`);
    return response.data;
  },

  // Apply referral code to current user
  applyCode: async (code) => {
    const response = await api.post('/api/v1/referral/apply', { code });
    return response.data;
  },

  // Request commission payout
  requestPayout: async (amountUsdt, walletAddress, network = 'BSC') => {
    const response = await api.post('/api/v1/referral/payout', {
      amount_usdt: amountUsdt,
      wallet_address: walletAddress,
      network,
    });
    return response.data;
  },

  // Get payout history
  getPayouts: async () => {
    const response = await api.get('/api/v1/referral/payouts');
    return response.data;
  },
};