// A tiny stand-in for the Anthropic Messages API, for browser tests only.
// - answers every request with a short scripted tutor reply
// - records each prompt so tests can check exactly what the model was (and was not) sent
// - misbehaves on request, via markers in the student's message:
//     [[FAIL]]        -> HTTP 500
//     [[LEAK:7]]      -> "The answer is 7."
//     [[VERDICT]]     -> "That's correct! Well done."
//     [[WATCHED]]     -> "I watched the video and ..."
import { createServer } from 'node:http';

const PORT = Number(process.env.FAKE_AI_PORT ?? 3401);
const calls = [];

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
  });
}

function scriptedReply(system, message) {
  const marker = /\[\[LEAK:([^\]]+)\]\]/.exec(message);
  if (marker) return `The answer is ${marker[1]}.`;
  if (message.includes('[[VERDICT]]')) return "That's correct! Well done.";
  if (message.includes('[[WATCHED]]')) return 'I watched the video and it explains this well.';

  const level = Number(/hint level (\d)/.exec(system)?.[1] ?? 0);
  const strategy = system.includes('Do NOT repeat it') ? ' Let us try a number line this time.' : '';
  if (level === 7) return 'Here is the full explanation of why the answer works, step by step.';
  if (level === 0) return 'Let us think about this together. What do you already know?';
  return `Hint ${level} from the fake tutor: look at the signs of the two numbers.${strategy}`;
}

createServer(async (req, res) => {
  if (req.url === '/__health') {
    res.writeHead(200).end('ok');
    return;
  }
  if (req.url === '/__calls' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(calls));
    return;
  }
  if (req.url === '/__reset' && req.method === 'POST') {
    calls.length = 0;
    res.writeHead(200).end('ok');
    return;
  }
  if (req.url === '/v1/messages' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req));
    const system = String(body.system ?? '');
    const user = String(body.messages?.[0]?.content ?? '');
    const message = /<student_message>([\s\S]*?)<\/student_message>/.exec(user)?.[1] ?? '';
    calls.push({ system, user, message });
    if (message.includes('[[FAIL]]')) {
      res.writeHead(500).end('upstream failure');
      return;
    }
    res
      .writeHead(200, { 'content-type': 'application/json' })
      .end(JSON.stringify({ content: [{ type: 'text', text: scriptedReply(system, message) }] }));
    return;
  }
  res.writeHead(404).end('not found');
}).listen(PORT, () => console.log(`fake AI listening on ${PORT}`));
