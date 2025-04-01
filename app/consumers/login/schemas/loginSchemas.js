export const verifyDeviceSchema = {
  body: {
    type: 'object',
    required: ['userId', 'deviceId', 'verificationCode', 'connectionId', 'email'],
    properties: {
      userId: { type: 'string' },
      deviceId: { type: 'string' },
      verificationCode: { type: 'string' },
      connectionId: { type: 'string' },
      email: { type: 'string', format: 'email' }
    }
  }
};

export const verify2FASchema = {
  body: {
    type: 'object',
    required: ['email', 'twoFactorCode', 'connectionId'],
    properties: {
      email: { type: 'string', format: 'email' },
      twoFactorCode: { type: 'string' },
      connectionId: { type: 'string' }
    }
  }
};