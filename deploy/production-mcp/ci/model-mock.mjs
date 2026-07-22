import http from 'node:http';

http.createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end('{"status":"ok"}');
    return;
  }
  if (request.method === 'POST' && request.url === '/v1/chat/completions') {
    response.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive'
    });
    response.write('data: {"id":"canary-model-probe","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"canary-model-ok"},"finish_reason":null}]}\n\n');
    response.end('data: [DONE]\n\n');
    return;
  }
  response.writeHead(404).end();
}).listen(Number(process.env.PORT || 8080), '0.0.0.0');
