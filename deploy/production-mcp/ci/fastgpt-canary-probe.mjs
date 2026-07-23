import { createHash } from 'node:crypto';

const required = (name) => {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const baseUrl = required('FASTGPT_CANARY_ADMIN_URL').replace(/\/$/, '');
const rootPassword = required('CANARY_FASTGPT_ROOT_PASSWORD');

async function jsonRequest(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`FastGPT returned non-JSON response with status ${response.status}`);
  }
  if (!response.ok || (typeof body?.code === 'number' && body.code !== 200)) {
    throw new Error(`FastGPT request failed with status ${response.status} and code ${body?.code ?? 'unknown'}`);
  }
  return body?.data ?? body;
}

const preLoginUrl = new URL(`${baseUrl}/api/support/user/account/preLogin`);
preLoginUrl.searchParams.set('username', 'root');
const preLogin = await jsonRequest(preLoginUrl);
if (!preLogin?.code) throw new Error('FastGPT pre-login code is missing');

const login = await jsonRequest(`${baseUrl}/api/support/user/account/loginByPassword`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    username: 'root',
    password: createHash('sha256').update(rootPassword).digest('hex'),
    code: preLogin.code,
    language: 'zh-CN',
  }),
});
if (!login?.token) throw new Error('FastGPT root login token is missing');

const modelConfig = [{
  model: 'canary-ci-model',
  metadata: {
    provider: 'custom',
    model: 'canary-ci-model',
    name: 'canary-ci-model',
    type: 'llm',
    isActive: true,
    maxContext: 4096,
    maxResponse: 256,
    quoteMaxToken: 256,
    functionCall: false,
    toolChoice: false,
    requestUrl: 'http://fastgpt-canary-model-mock:8080/v1/chat/completions',
  },
}];

await jsonRequest(`${baseUrl}/api/core/ai/model/updateWithJson`, {
  method: 'POST',
  headers: { token: login.token, 'content-type': 'application/json' },
  body: JSON.stringify({ config: JSON.stringify(modelConfig) }),
});
const modelTest = await jsonRequest(`${baseUrl}/api/core/ai/model/test?model=canary-ci-model`, {
  method: 'POST',
  headers: { token: login.token },
});
if (!JSON.stringify(modelTest).includes('canary-model-ok')) {
  throw new Error('FastGPT model test did not return the controlled Canary response');
}

console.log('CANARY_FASTGPT_LOGIN_AND_MODEL=PASS');
