export default async function handler(req, res) {
  const { path } = req.query;
  const notionPath = Array.isArray(path) ? path.join('/') : path;

  const response = await fetch(`https://api.notion.com/v1/${notionPath}`, {
    method: req.method,
    headers: {
      'Authorization': `Bearer ntn_J580615544116crlsXr6Rl6UJLsFshQbJIGBf1A17K94Eo`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    },
    body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
  });

  const data = await response.json();
  res.status(response.status).json(data);
}
